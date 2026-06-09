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
import { DockerBackend } from "../backends/docker.js";
import { LocalBackend } from "../backends/local.js";
import { createWebFetchTool } from "../tools/web_fetch.js";
import type { ContainerManager } from "./ContainerManager.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Create a LangChain chat model from a ModelConfig.
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

## Environment
- You are running inside a Kali Linux container with security tools pre-installed (nmap, curl, python3, sqlmap, etc.)
- The target is specified in the challenge description — it may be a remote server, domain, URL, or SSH host
- DO NOT install packages or set up environments — tools are already available
- DO NOT try to start Docker or containers — focus on the challenge directly

## Phase 1: Analyze (FIRST STEP)
Before doing anything, analyze the challenge description to determine:
- Is this a SINGLE-FLAG challenge? (one target, one flag to find)
- Is this a MULTI-FLAG challenge? (multiple challenges, CTF platform, "solve all")

Output your analysis as:
"SINGLE-FLAG: [reason]" or "MULTI-FLAG: [reason, number of challenges if known]"

## Phase 2: Execute
- Use tools step by step to investigate and exploit
- Work systematically through each challenge
- For complex sub-tasks, delegate to the general-purpose subagent using the task tool

## Phase 3: Extract & Continue
**If SINGLE-FLAG:**
- Find the flag → output it clearly as flag{...} or CTF{...} or HTB{...}
- After finding ONE flag, you are DONE — summarize findings and stop

**If MULTI-FLAG:**
- Output each flag found on its own line: flag{...}
- After finding a flag, immediately move to the NEXT unsolved challenge
- Keep track of solved vs unsolved challenges
- **NEVER STOP voluntarily** — keep solving until time runs out
- Periodically check: how many solved vs total? What's left?
- When time is running out (25+ minutes), do a final summary
- Only stop when: ALL solved, or time limit reached, or no more approaches to try
- When ALL done, output: "ALL_CHALLENGES_SOLVED: [count] flags found"

## Available Tools
- execute: Run any shell command (nmap, sqlmap, curl, gdb, python, etc.)
- web_fetch: Fetch a URL and return its content
- ls, read_file, write_file, edit_file, glob, grep: File operations
- task: Delegate complex sub-tasks to the general-purpose subagent

## Rules
- Read skill instructions before starting if available
- When stuck on one challenge, skip it and try another
- Document findings for each challenge
- Use the task tool for complex multi-step sub-tasks that benefit from focused execution
- DO NOT waste time on setup — focus on solving the challenge`;

/**
 * Create and run a DeepAgents agent for CTF solving.
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
  const skillsRoot = containerManager
    ? "/skills"
    : resolve(dirname(fileURLToPath(import.meta.url)), "../../../../skills");

  // Load all relevant skills per category
  const categorySkillMap: Record<string, string[]> = {
    web: [
      skillsRoot + "/web-security/",
      skillsRoot + "/hunt-sqli/",
      skillsRoot + "/hunt-xss/",
      skillsRoot + "/hunt-ssrf/",
      skillsRoot + "/hunt-idor/",
      skillsRoot + "/hunt-csrf/",
      skillsRoot + "/hunt-auth-bypass/",
      skillsRoot + "/hunt-rce/",
      skillsRoot + "/hunt-file-upload/",
      skillsRoot + "/hunt-api-misconfig/",
    ],
    pwn: [
      skillsRoot + "/pwn/",
      skillsRoot + "/security-arsenal/",
    ],
    crypto: [
      skillsRoot + "/bug-bounty/",
      skillsRoot + "/security-arsenal/",
    ],
    forensics: [
      skillsRoot + "/bug-bounty/",
    ],
    misc: [
      skillsRoot + "/bug-bounty/",
      skillsRoot + "/hunt-misc/",
      skillsRoot + "/security-arsenal/",
    ],
    "prompt-injection": [
      skillsRoot + "/hunt-llm-ai/",
      skillsRoot + "/bug-bounty/",
    ],
  };
  const effectiveSkills = skills?.length ? skills : (categorySkillMap[category] ?? [skillsRoot + "/bug-bounty/"]);
  console.log("[AgentRunner] Skills:", effectiveSkills.length, "loaded for", category);

  console.log("[AgentRunner] Creating DeepAgent with", tools.length, "custom tools, skills:", effectiveSkills);
  const agent = createDeepAgent({
    model,
    systemPrompt: CTF_SYSTEM_PROMPT,
    tools,
    backend,
    skills: effectiveSkills,
    subagents: options.subagents ?? [],
    // Enable default general-purpose subagent — it handles complex sub-tasks
    generalPurposeAgent: true,
    middleware: [
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
        maxIterations: rabbitHole?.maxIterations ?? 100,
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
