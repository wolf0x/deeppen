import { createDeepAgent } from "deepagents";
import type { SubAgent } from "deepagents";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
type BaseChatModel = any; // from @langchain/core, not directly importable in pnpm
import type { ModelConfig, StreamEvent } from "@deeppen/shared";
import { createStreamEmitterMiddleware } from "../middleware/streamEmitter.js";
import { createProgressTrackerMiddleware } from "../middleware/ctfProgressTracker.js";
import { createRabbitHoleEscapeMiddleware } from "../middleware/ctfRabbitHoleEscape.js";
import { createFlagExtractorMiddleware } from "../middleware/ctfFlagExtractor.js";
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

## Workflow
1. **Analyze** — determine challenge type, attack vectors, strategy
2. **Execute** — use tools step by step to investigate and exploit
3. **Extract** — output the flag clearly as flag{...} or CTF{...} or HTB{...}

## Tools — Use These Directly
- execute: Run any shell command (nmap, sqlmap, curl, gdb, python, etc.)
- web_fetch: Fetch a URL and return its content
- ls, read_file, write_file, edit_file, glob, grep: File operations

## CRITICAL: Do NOT Delegate
- NEVER use the "task" tool or subagents
- Call execute/web_fetch/other tools DIRECTLY yourself
- Every tool call must be a direct invocation, not a delegation

## Rules
- Read skill instructions before starting if available
- Work systematically, document findings
- Pivot approach if stuck`;

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

  // Skills: load from /skills/{category}/ on the backend filesystem
  const effectiveSkills = skills?.length ? skills : [`/skills/${category}/`];

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
      // Flag extraction — scans model responses for flag patterns
      createFlagExtractorMiddleware({
        onFlagFound: (flag) => {
          foundFlag = flag;
          const event: StreamEvent = {
            id: `flag-${Date.now()}`,
            parentId: null,
            type: "flag-found",
            timestamp: Date.now(),
            data: { flag },
            status: "complete",
            depth: 0,
          };
          events.push(event);
          onStreamEvent?.(event);
          onFlagFound?.(flag);
        },
      }),
    ],
  } as any);

  // Emit agent-start
  onStreamEvent?.({
    id: `start-${Date.now()}`,
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
