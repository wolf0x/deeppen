import { createDeepAgent } from "deepagents";
import type { SubAgent } from "deepagents";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { v4 as uuid } from "uuid";
type BaseChatModel = any; // from @langchain/core, not directly importable in pnpm
import type { ModelConfig, StreamEvent } from "@deeppen/shared";
import { createStreamEmitterMiddleware } from "../middleware/streamEmitter.js";
import { createProgressTrackerMiddleware } from "../middleware/ctfProgressTracker.js";
import { createRabbitHoleEscapeMiddleware } from "../middleware/ctfRabbitHoleEscape.js";
import { createMiddleware, ToolMessage } from "langchain";
import { DockerBackend } from "../backends/docker.js";
import { LocalBackend } from "../backends/local.js";
import { createWebFetchTool } from "../tools/web_fetch.js";
import type { ContainerManager } from "./ContainerManager.js";

/**
 * Create a LangChain chat model from a ModelConfig.
 * Supports: anthropic, openai, azure-openai, openai-compatible,
 * ollama, deepseek, minimax, xiaomimio, zhipu, openrouter
 */
export function createChatModel(config: ModelConfig): BaseChatModel {
  const common = {
    maxTokens: config.maxTokens,
    temperature: config.temperature,
  };

  switch (config.provider) {
    case "anthropic":
      return new ChatAnthropic({
        ...common,
        anthropicApiKey: config.apiKey,
        model: config.modelId,
        ...(config.baseUrl && { anthropicApiUrl: config.baseUrl }),
      });

    case "openai":
      return new ChatOpenAI({
        ...common,
        apiKey: config.apiKey,
        model: config.modelId,
        ...(config.baseUrl && { configuration: { baseURL: config.baseUrl } }),
      });

    case "azure-openai":
      return new ChatOpenAI({
        ...common,
        apiKey: config.apiKey,
        model: config.modelId,
        configuration: { baseURL: config.baseUrl },
      });

    // These providers all use OpenAI-compatible API format
    case "openai-compatible":
    case "deepseek":
    case "minimax":
    case "xiaomimio":
    case "zhipu":
    case "openrouter":
      return new ChatOpenAI({
        ...common,
        apiKey: config.apiKey,
        model: config.modelId,
        configuration: { baseURL: config.baseUrl },
      });

    case "ollama":
      return new ChatOpenAI({
        ...common,
        model: config.modelId,
        configuration: {
          baseURL: config.baseUrl ?? "http://localhost:11434/v1",
        },
      });

    default:
      throw new Error(`Unsupported provider: ${(config as any).provider}`);
  }
}

export interface RunAgentOptions {
  modelConfig: ModelConfig;
  challenge: string;
  category: string;
  skills?: string[];
  attachments?: string[];
  subagents?: SubAgent[];
  containerManager?: ContainerManager;
  rabbitHole?: {
    maxIterations: number;
    maxTimeMinutes: number;
    pivotStrategy: "different-approach" | "ask-user" | "stop";
  };
  onStreamEvent?: (event: StreamEvent) => void;
  onFlagFound?: (flag: string) => void;
  abortSignal?: AbortSignal;
}

const CTF_SYSTEM_PROMPT = `You are DeepPen, an autonomous CTF challenge solver.

## Phase 1: Analyze (FIRST STEP)
Before doing anything, analyze the challenge description to determine:
- Is this a SINGLE-FLAG challenge? (one target, one flag to find)
- Is this a MULTI-FLAG challenge? (multiple challenges, CTF platform, "solve all")

Output your analysis as:
"SINGLE-FLAG: [reason]" or "MULTI-FLAG: [reason, number of challenges if known]"

## Phase 2: Execute
- Use tools step by step to investigate and exploit
- Work systematically through each challenge

## Phase 3: Extract & Continue
**If SINGLE-FLAG:**
- Find the flag → output it clearly as flag{...} or CTF{...} or HTB{...}
- After finding ONE flag, you are DONE — summarize findings and stop

**If MULTI-FLAG:**
- Output each flag found on its own line: flag{...}
- After finding a flag, immediately move to the NEXT unsolved challenge
- Keep track of solved vs unsolved challenges
- Continue until all challenges are solved or time runs out
- When ALL done, output: "ALL_CHALLENGES_SOLVED: [count] flags found"

## Tools — Use These Directly
- execute: Run any shell command (nmap, sqlmap, curl, gdb, python, etc.)
- web_fetch: Fetch a URL and return its content
- ls, read_file, write_file, edit_file, glob, grep: File operations

## CRITICAL: Do NOT Delegate
- NEVER use the "task" tool or subagents
- Call execute/web_fetch/other tools DIRECTLY yourself

## Rules
- Read skill instructions before starting if available
- When stuck on one challenge, skip it and try another
- Document findings for each challenge`;

/**
 * Create and run a DeepAgents agent for CTF solving.
 *
 * This is a thin configuration layer — DeepAgents owns the agent loop,
 * tool execution, skill loading, and subagent delegation.
 * Stream events are emitted via middleware hooks.
 */
export async function runCTFAgent(options: RunAgentOptions): Promise<{
  flag: string | null;
  messages: any[];
  events: StreamEvent[];
}> {
  const {
    modelConfig,
    challenge,
    category,
    skills,
    attachments,
    containerManager,
    rabbitHole,
    onStreamEvent,
    onFlagFound,
    abortSignal,
  } = options;

  const model = createChatModel(modelConfig);
  let foundFlag: string | null = null;
  const events: StreamEvent[] = [];

  // Backend: Docker if available, otherwise local
  const backend = containerManager
    ? new DockerBackend(containerManager)
    : new LocalBackend();

  // Custom tools — DeepAgents provides execute, ls, read_file, etc. natively
  const tools = [createWebFetchTool()];

  // Skills: use container path when Docker is available, host path otherwise
  // Container mounts skills at /skills/, host has them at projectRoot/skills/
  const skillsRoot = containerManager ? "/skills" : (() => {
    const { fileURLToPath } = require("node:url");
    const { dirname, resolve } = require("node:path");
    return resolve(dirname(fileURLToPath(import.meta.url)), "../../../../skills");
  })();

  const categorySkillMap: Record<string, string> = {
    web: skillsRoot + "/web-security/",
    pwn: skillsRoot + "/pwn/",
    crypto: skillsRoot + "/bug-bounty/",
    forensics: skillsRoot + "/bug-bounty/",
    misc: skillsRoot + "/bug-bounty/",
    "prompt-injection": skillsRoot + "/hunt-llm-ai/",
  };
  const effectiveSkills = skills?.length ? skills : [categorySkillMap[category] ?? skillsRoot + "/bug-bounty/"];
  console.log("[AgentRunner] Skills:", effectiveSkills[0]);

  // Timeout wrapper for task tool — prevents subagent hangs
  const taskTimeoutMiddleware = createMiddleware({
    name: "TaskTimeout",
    wrapToolCall: async (request: any, handler: any) => {
      if (request.toolCall?.name === "task") {
        const timeout = 60_000;
        try {
          return await Promise.race([
            handler(request),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Subagent timed out after 60s")), timeout)
            ),
          ]);
        } catch (err: any) {
          return new ToolMessage({
            content: `Error: ${err.message}. Use execute/web_fetch tools directly instead.`,
            tool_call_id: request.toolCall.id ?? "timeout",
          });
        }
      }
      return handler(request);
    },
  });

  console.log("[AgentRunner] Creating DeepAgent with", tools.length, "custom tools, skills:", effectiveSkills);
  const agent = createDeepAgent({
    model,
    systemPrompt: CTF_SYSTEM_PROMPT,
    tools,
    backend,
    skills: effectiveSkills,
    subagents: options.subagents ?? [],
    generalPurposeAgent: false,
    middleware: [
      // Subagent timeout — prevents 12min+ hangs
      taskTimeoutMiddleware,
      // Stream events — the ONLY source of tool/model activity events
      createStreamEmitterMiddleware({
        onStreamEvent: (e) => { events.push(e); onStreamEvent?.(e); },
        onFlagFound: (f) => { foundFlag = f; onFlagFound?.(f); },
      }),
      // Progress tracking — records approaches for writeup generation
      createProgressTrackerMiddleware({
        taskId: "live",
        onProgress: (entry) => {
          const event: StreamEvent = {
            id: entry.id,
            parentId: null,
            type: "agent-think",
            timestamp: Date.now(),
            data: { content: entry.notes },
            status: "complete",
            depth: 0,
          };
          events.push(event);
          onStreamEvent?.(event);
        },
      }),
      // Rabbit hole escape — enforces iteration/time limits
      createRabbitHoleEscapeMiddleware({
        maxIterations: rabbitHole?.maxIterations ?? 50,
        maxTimeMinutes: rabbitHole?.maxTimeMinutes ?? 30,
        pivotStrategy: rabbitHole?.pivotStrategy ?? "different-approach",
        onEscape: (reason, iterations) => {
          const event: StreamEvent = {
            id: `escape-${iterations}`,
            parentId: null,
            type: "rabbit-hole-escape",
            timestamp: Date.now(),
            data: { content: reason },
            status: "complete",
            depth: 0,
          };
          events.push(event);
          onStreamEvent?.(event);
        },
      }),
    ],
  } as any);

  // Emit agent-start
  onStreamEvent?.({
    id: `start-${uuid()}`,
    parentId: null,
    type: "agent-start",
    timestamp: Date.now(),
    data: {},
    status: "complete",
    depth: 0,
  });

  // Invoke the agent — DeepAgents handles the full ReAct loop
  console.log("[AgentRunner] Invoking agent with", challenge.length, "char challenge");
  try {
    const result = await agent.invoke(
      { messages: [{ role: "user", content: challenge }] },
      { signal: abortSignal },
    );
    console.log("[AgentRunner] Agent completed with", result.messages.length, "messages");
    return {
      flag: foundFlag,
      messages: result.messages,
      events,
    };
  } catch (err: any) {
    console.error("[AgentRunner] Agent error:", err.message);
    throw err;
  }
}
