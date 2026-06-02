import { z } from "zod";

// ─── Task ────────────────────────────────────────────
export const TaskStatusSchema = z.enum([
  "idle", "created", "running", "paused", "stopped", "completed", "failed"
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const ChallengeCategorySchema = z.enum([
  "web", "pwn", "crypto", "forensics", "misc", "prompt-injection"
]);
export type ChallengeCategory = z.infer<typeof ChallengeCategorySchema>;

export const TaskConfigSchema = z.object({
  name: z.string().min(1),
  challenge: z.object({
    description: z.string().min(1),
    category: ChallengeCategorySchema,
    platform: z.string().optional(),
    challengeId: z.string().optional(),
    attachments: z.array(z.string()).optional(),
  }),
  modelId: z.string(),
  subagentIds: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  connectorId: z.string().optional(),
  rabbitHole: z.object({
    maxIterations: z.number().default(50),
    maxTimeMinutes: z.number().default(30),
    maxSubagentDepth: z.number().default(3),
    pivotStrategy: z.enum(["different-approach", "ask-user", "stop"]).default("different-approach"),
  }).optional(),
  autoSubmit: z.boolean().optional().default(true),
});
export type TaskConfig = z.infer<typeof TaskConfigSchema>;

// ─── Model Config ────────────────────────────────────
export const ModelProviderSchema = z.enum([
  "anthropic", "openai", "azure-openai", "openai-compatible",
  "ollama", "deepseek", "minimax", "xiaomimio", "zhipu", "openrouter"
]);
export type ModelProvider = z.infer<typeof ModelProviderSchema>;

export const ModelConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  provider: ModelProviderSchema,
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  modelId: z.string().min(1),
  maxTokens: z.number().default(4096),
  temperature: z.number().default(0),
  configJson: z.record(z.unknown()).optional(),
  lastTestedAt: z.date().optional(),
  testStatus: z.enum(["ok", "error"]).optional(),
  testError: z.string().optional(),
});
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

// ─── SubAgent Config ─────────────────────────────────
export const SubAgentConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().min(1),
  systemPrompt: z.string().min(1),
  modelId: z.string().optional(),
  tools: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
});
export type SubAgentConfig = z.infer<typeof SubAgentConfigSchema>;

// ─── Stream Events ───────────────────────────────────
export const StreamEventTypeSchema = z.enum([
  "agent-start", "agent-think", "agent-response",
  "tool-call", "tool-result",
  "subagent-spawn", "subagent-return",
  "flag-found", "flag-submitted", "flag-accepted", "flag-rejected",
  "rabbit-hole-escape",
  "task-complete", "task-error"
]);
export type StreamEventType = z.infer<typeof StreamEventTypeSchema>;

export const StreamEventSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  type: StreamEventTypeSchema,
  timestamp: z.number(),
  data: z.object({
    content: z.string().optional(),
    toolName: z.string().optional(),
    toolInput: z.unknown().optional(),
    toolOutput: z.string().optional(),
    subagentType: z.string().optional(),
    flag: z.string().optional(),
    error: z.string().optional(),
  }),
  status: z.enum(["running", "complete", "error"]),
  depth: z.number(),
});
export type StreamEvent = z.infer<typeof StreamEventSchema>;

// ─── Progress ────────────────────────────────────────
export const ProgressEntrySchema = z.object({
  id: z.string(),
  taskId: z.string(),
  timestamp: z.date(),
  approach: z.string(),
  toolsUsed: z.array(z.string()),
  result: z.enum(["progress", "dead-end", "partial"]),
  notes: z.string(),
});
export type ProgressEntry = z.infer<typeof ProgressEntrySchema>;

// ─── Connectors ──────────────────────────────────────
export const ConnectorTypeSchema = z.enum(["mcp", "api"]);
export type ConnectorType = z.infer<typeof ConnectorTypeSchema>;

export const SubmitResultSchema = z.object({
  accepted: z.boolean(),
  message: z.string(),
  score: z.number().optional(),
});
export type SubmitResult = z.infer<typeof SubmitResultSchema>;

// ─── Model Test ──────────────────────────────────────
export const ModelTestResultSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number(),
  modelId: z.string(),
  tokenUsage: z.object({ input: z.number(), output: z.number() }).optional(),
  supportsToolUse: z.boolean(),
  error: z.string().optional(),
  testedAt: z.date(),
});
export type ModelTestResult = z.infer<typeof ModelTestResultSchema>;
