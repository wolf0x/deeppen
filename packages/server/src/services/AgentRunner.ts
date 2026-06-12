import { createDeepAgent } from "deepagents";
import type { SubAgent } from "deepagents";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { v4 as uuid } from "uuid";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
type BaseChatModel = any; // from @langchain/core, not directly importable in pnpm
import type { ModelConfig, StreamEvent } from "@deeppen/shared";
import { createStreamEmitterMiddleware } from "../middleware/streamEmitter.js";
import { createProgressTrackerMiddleware } from "../middleware/ctfProgressTracker.js";
import { createRabbitHoleEscapeMiddleware } from "../middleware/ctfRabbitHoleEscape.js";
import { createGuidanceInjectorMiddleware } from "../middleware/guidanceInjector.js";
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
  userContext?: string;
  taskId?: string;
  guidanceStore?: any;
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

## CRITICAL: Follow Skills Step by Step
You have access to CTF skills loaded from /skills/. Each skill contains a SKILL.md with proven methodology.
1. FIRST: Read the relevant SKILL.md file using read_file
2. THEN: Follow the methodology step by step — do NOT skip steps
3. The skill tells you exactly what to test and how — trust it

## Phase 1: Analyze + Read Skill
1. Analyze the challenge to determine type (web/pwn/crypto/etc.)
2. Read the matching SKILL.md (e.g., /skills/ctf-web/SKILL.md)
3. The skill will tell you the methodology — follow it

## Phase 2: Execute (Follow Skill Methodology)
- Follow the skill's steps IN ORDER
- If the skill says "test for SQL injection on login forms" → do it
- If the skill says "check /ftp directory" → do it
- If the skill says "try XSS on search parameter" → do it
- Do NOT skip steps or improvise — the skill is proven to work

## Phase 3: Extract Flag
- Output flag clearly as flag{...} or CTF{...} or HTB{...}

## Tools
- execute: Run shell commands (curl, nmap, sqlmap, python, etc.)
- web_fetch: Fetch a URL
- read_file: Read SKILL.md files
- ls, grep, glob: Search files

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
  const skillsRoot = containerManager
    ? "/skills"
    : resolve(dirname(fileURLToPath(import.meta.url)), "../../../../skills");

  // Map challenge categories to ctf-* skills
  const categorySkillMap: Record<string, string[]> = {
    web: [skillsRoot + "/ctf-web/", skillsRoot + "/ctf-writeup/"],
    pwn: [skillsRoot + "/ctf-pwn/", skillsRoot + "/ctf-writeup/"],
    crypto: [skillsRoot + "/ctf-crypto/", skillsRoot + "/ctf-writeup/"],
    forensics: [skillsRoot + "/ctf-forensics/", skillsRoot + "/ctf-writeup/"],
    misc: [skillsRoot + "/ctf-misc/", skillsRoot + "/ctf-writeup/"],
    "prompt-injection": [skillsRoot + "/ctf-ai-ml/", skillsRoot + "/ctf-writeup/"],
  };
  const effectiveSkills = skills?.length ? skills : (categorySkillMap[category] ?? [skillsRoot + "/ctf-misc/", skillsRoot + "/ctf-writeup/"]);
  console.log("[AgentRunner] Skills:", effectiveSkills.join(", "));

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
      // Guidance injection from Loop Agent
      ...(options.taskId && options.guidanceStore
        ? [createGuidanceInjectorMiddleware(options.taskId, options.guidanceStore)]
        : []),
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
  // Inject user context (hints, background info) into the challenge
  let fullChallenge = challenge;
  if (options.userContext) {
    fullChallenge += `\n\n## User-Provided Context\n${options.userContext}`;
  }

  console.log("[AgentRunner] Invoking agent with", fullChallenge.length, "char challenge");
  try {
    const result = await agent.invoke(
      { messages: [{ role: "user", content: fullChallenge }] },
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
