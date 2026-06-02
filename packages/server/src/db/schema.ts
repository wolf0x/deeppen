import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const modelConfigs = sqliteTable("model_configs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  apiKeyEncrypted: text("api_key_encrypted"),
  baseUrl: text("base_url"),
  modelId: text("model_id").notNull(),
  maxTokens: integer("max_tokens").default(4096),
  temperature: real("temperature").default(0),
  configJson: text("config_json"),
  lastTestedAt: integer("last_tested_at", { mode: "timestamp" }),
  testStatus: text("test_status"),
  testError: text("test_error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const subagentConfigs = sqliteTable("subagent_configs", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  modelId: text("model_id"),
  toolsJson: text("tools_json"),
  skillsJson: text("skills_json"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("idle"),
  category: text("category").notNull(),
  challengeDescription: text("challenge_description"),
  platform: text("platform"),
  challengeId: text("challenge_id"),
  attachmentsJson: text("attachments_json"),
  modelConfigId: text("model_config_id"),
  subagentsJson: text("subagents_json"),
  skillsJson: text("skills_json"),
  connectorId: text("connector_id"),
  rabbitHoleConfigJson: text("rabbit_hole_config_json"),
  autoSubmit: integer("auto_submit", { mode: "boolean" }).default(true),
  flag: text("flag"),
  flagAccepted: integer("flag_accepted", { mode: "boolean" }),
  writeupId: text("writeup_id"),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  elapsedMs: integer("elapsed_ms"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const streamEvents = sqliteTable("stream_events", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  parentId: text("parent_id"),
  type: text("type").notNull(),
  timestamp: integer("timestamp").notNull(),
  dataJson: text("data_json"),
  status: text("status").notNull(),
  depth: integer("depth").notNull(),
});

export const progressEntries = sqliteTable("progress_entries", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
  approach: text("approach").notNull(),
  toolsUsedJson: text("tools_used_json"),
  result: text("result").notNull(),
  notes: text("notes"),
});

export const writeups = sqliteTable("writeups", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  title: text("title").notNull(),
  contentMarkdown: text("content_markdown").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  path: text("path").notNull(),
  source: text("source").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const mcpConfigs = sqliteTable("mcp_configs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  transport: text("transport").notNull(), // 'stdio' | 'sse'
  command: text("command"),
  argsJson: text("args_json"),
  envJson: text("env_json"),
  url: text("url"),
  headersJson: text("headers_json"),
  toolMappingJson: text("tool_mapping_json"),
  isRunning: integer("is_running", { mode: "boolean" }).default(false),
  lastTestedAt: integer("last_tested_at", { mode: "timestamp" }),
  testStatus: text("test_status"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const apiConnectorConfigs = sqliteTable("api_connector_configs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  authType: text("auth_type").notNull(),
  authConfigJson: text("auth_config_json"),
  endpointsJson: text("endpoints_json").notNull(),
  responseParsingJson: text("response_parsing_json").notNull(),
  lastTestedAt: integer("last_tested_at", { mode: "timestamp" }),
  testStatus: text("test_status"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
