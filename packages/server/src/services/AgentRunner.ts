import { createDeepAgent } from "deepagents";
import type { SubAgent } from "deepagents";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ModelConfig, StreamEvent } from "@deeppen/shared";
import { createFlagExtractorMiddleware } from "../middleware/ctfFlagExtractor.js";
import { createProgressTrackerMiddleware } from "../middleware/ctfProgressTracker.js";
import { createRabbitHoleEscapeMiddleware } from "../middleware/ctfRabbitHoleEscape.js";
import { createToolTrackerMiddleware } from "../middleware/ctfToolTracker.js";
import { DockerBackend } from "../backends/docker.js";
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
        openAIApiKey: config.apiKey,
        model: config.modelId,
        ...(config.baseUrl && { configuration: { baseURL: config.baseUrl } }),
      });

    case "azure-openai":
      return new ChatOpenAI({
        ...common,
        azureOpenAIApiKey: config.apiKey,
        azureOpenAIBasePath: config.baseUrl,
        model: config.modelId,
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
        openAIApiKey: config.apiKey,
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

/**
 * Create and run a deepagentsjs agent for CTF solving.
 *
 * Assembles the full CTF middleware stack:
 * 1. Progress tracker — records approaches and tool usage
 * 2. Rabbit hole escape — enforces iteration/time limits
 * 3. Flag extractor — detects flags in model responses
 *
 * Returns the found flag (if any), all messages, and stream events.
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

  // Create Docker backend if container manager is provided
  const backend = containerManager
    ? new DockerBackend(containerManager)
    : undefined;

  // Create tools array
  const tools = [createWebFetchTool()];

  // If no skills specified, load skills matching the category
  const effectiveSkills = skills && skills.length > 0 ? skills : [`/skills/${category}/`];

  const agent = createDeepAgent({
    model,
    systemPrompt: `You are DeepPen, an autonomous CTF challenge solver. Your workflow:

## Phase 1: Analyze
When you receive a challenge, FIRST analyze it to determine:
- What type of challenge is this? (web, pwn, crypto, forensics, misc, prompt-injection)
- What attack vectors are likely?
- What tools will you need?
- What is your strategy?

## Phase 2: Execute
- Read the skill instructions for this challenge type if available
- Execute your strategy step by step
- Use the container tools (nmap, sqlmap, curl, gdb, etc.) via the execute tool
- Use web_fetch to retrieve web content
- Use filesystem tools to read/write files

## Phase 3: Extract Flag
- When you find the flag, output it clearly in format: flag{...} or CTF{...} or HTB{...}

## Available Tools
- execute: Run any shell command in the Kali container. Use for nmap, sqlmap, curl, gdb, python scripts, etc.
- web_fetch: Fetch a URL and return its content
- read_file, write_file, edit_file: File operations in the container workspace
- ls, glob, grep: Search and list files

Challenge Category: ${category}

Challenge:
${challenge}

${attachments?.length ? `\nAttached files have been downloaded to /workspace/attachments/\nFiles: ${attachments.join(", ")}` : ""}

Available skills for this challenge type have been loaded. Read their instructions before starting.
`,
    skills: effectiveSkills,
    backend,
    tools,
    subagents: options.subagents ?? [],
    middleware: [
      createToolTrackerMiddleware({ onStreamEvent, onFlagFound }),
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
  });

  const result = await agent.invoke(
    { messages: [{ role: "user", content: challenge }] },
    { signal: abortSignal },
  );

  return {
    flag: foundFlag,
    messages: result.messages,
    events,
  };
}
