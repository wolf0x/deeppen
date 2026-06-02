import { describe, it, expect, beforeEach, vi } from "vitest";

// Hoist the in-memory database setup
const { testSqlite, mcTable, saTable, tTable, seTable } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { sqliteTable, text, integer, real } = require("drizzle-orm/sqlite-core");

  const testSqlite = new Database(":memory:");
  testSqlite.pragma("journal_mode = WAL");
  testSqlite.pragma("foreign_keys = ON");
  testSqlite.exec(`
    CREATE TABLE model_configs (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, provider TEXT NOT NULL,
      api_key_encrypted TEXT, base_url TEXT, model_id TEXT NOT NULL,
      max_tokens INTEGER DEFAULT 4096, temperature REAL DEFAULT 0,
      config_json TEXT, last_tested_at INTEGER, test_status TEXT,
      test_error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE subagent_configs (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL,
      system_prompt TEXT NOT NULL, model_id TEXT, tools_json TEXT,
      skills_json TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idle',
      category TEXT NOT NULL, challenge_description TEXT, platform TEXT,
      challenge_id TEXT, attachments_json TEXT, model_config_id TEXT,
      subagents_json TEXT, skills_json TEXT, connector_id TEXT,
      rabbit_hole_config_json TEXT, auto_submit INTEGER DEFAULT 1,
      flag TEXT, flag_accepted INTEGER, writeup_id TEXT,
      started_at INTEGER, completed_at INTEGER, elapsed_ms INTEGER,
      error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE stream_events (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL, parent_id TEXT,
      type TEXT NOT NULL, timestamp INTEGER NOT NULL, data_json TEXT,
      status TEXT NOT NULL, depth INTEGER NOT NULL
    );
    CREATE TABLE progress_entries (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL, timestamp INTEGER NOT NULL,
      approach TEXT NOT NULL, tools_used_json TEXT, result TEXT NOT NULL,
      notes TEXT
    );
    CREATE TABLE writeups (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL, title TEXT NOT NULL,
      content_markdown TEXT NOT NULL, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE skills (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL,
      path TEXT NOT NULL, source TEXT NOT NULL, enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL
    );
  `);

  const mcTable = sqliteTable("model_configs", {
    id: text("id").primaryKey(), name: text("name").notNull(), provider: text("provider").notNull(),
    apiKeyEncrypted: text("api_key_encrypted"), baseUrl: text("base_url"), modelId: text("model_id").notNull(),
    maxTokens: integer("max_tokens").default(4096), temperature: real("temperature").default(0),
    configJson: text("config_json"), lastTestedAt: integer("last_tested_at", { mode: "timestamp" }),
    testStatus: text("test_status"), testError: text("test_error"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  });
  const saTable = sqliteTable("subagent_configs", {
    id: text("id").primaryKey(), name: text("name").notNull().unique(), description: text("description").notNull(),
    systemPrompt: text("system_prompt").notNull(), modelId: text("model_id"), toolsJson: text("tools_json"),
    skillsJson: text("skills_json"), createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  });
  const tTable = sqliteTable("tasks", {
    id: text("id").primaryKey(), name: text("name").notNull(), status: text("status").notNull().default("idle"),
    category: text("category").notNull(), challengeDescription: text("challenge_description"),
    platform: text("platform"), challengeId: text("challenge_id"), attachmentsJson: text("attachments_json"),
    modelConfigId: text("model_config_id"), subagentsJson: text("subagents_json"), skillsJson: text("skills_json"),
    connectorId: text("connector_id"), rabbitHoleConfigJson: text("rabbit_hole_config_json"),
    autoSubmit: integer("auto_submit", { mode: "boolean" }).default(true), flag: text("flag"),
    flagAccepted: integer("flag_accepted", { mode: "boolean" }), writeupId: text("writeup_id"),
    startedAt: integer("started_at", { mode: "timestamp" }), completedAt: integer("completed_at", { mode: "timestamp" }),
    elapsedMs: integer("elapsed_ms"), error: text("error"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  });
  const seTable = sqliteTable("stream_events", {
    id: text("id").primaryKey(), taskId: text("task_id").notNull(), parentId: text("parent_id"),
    type: text("type").notNull(), timestamp: integer("timestamp").notNull(), dataJson: text("data_json"),
    status: text("status").notNull(), depth: integer("depth").notNull(),
  });

  return { testSqlite, mcTable, saTable, tTable, seTable };
});

// Mock the db module
vi.mock("../db/index.js", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/better-sqlite3");
  const db = drizzle(testSqlite, { modelConfigs: mcTable, subagentConfigs: saTable, tasks: tTable, streamEvents: seTable });
  return { db, sqlite: testSqlite, modelConfigs: mcTable, subagentConfigs: saTable, tasks: tTable, streamEvents: seTable };
});

// Mock ConfigStore
vi.mock("./ConfigStore.js", () => ({
  ConfigStore: vi.fn().mockImplementation(() => ({
    getModel: vi.fn().mockResolvedValue({
      id: "test-model", name: "Test Model", provider: "anthropic",
      modelId: "claude-3-sonnet", maxTokens: 4096, temperature: 0,
    }),
  })),
}));

// Mock AgentRunner
vi.mock("./AgentRunner.js", () => ({
  runCTFAgent: vi.fn().mockResolvedValue({ flag: null, messages: [], events: [] }),
}));

const { TaskManager } = await import("./TaskManager.js");

describe("TaskManager", () => {
  let tm: InstanceType<typeof TaskManager>;

  beforeEach(() => {
    testSqlite.exec("DELETE FROM stream_events; DELETE FROM tasks;");
    tm = new TaskManager();
  });

  it("can be instantiated", () => {
    expect(tm).toBeDefined();
  });

  it("extends EventEmitter", () => {
    expect(typeof tm.on).toBe("function");
    expect(typeof tm.emit).toBe("function");
  });

  it("creates a task and returns an ID", async () => {
    const id = await tm.create({
      name: "Test Task",
      challenge: { description: "Find the flag", category: "web" },
      modelId: "test-model",
    });
    expect(id).toBeDefined();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("retrieves a created task", async () => {
    const id = await tm.create({
      name: "My Task",
      challenge: { description: "Solve this", category: "crypto" },
      modelId: "test-model",
    });
    const task = await tm.getTask(id);
    expect(task).not.toBeNull();
    expect(task!.name).toBe("My Task");
    expect(task!.category).toBe("crypto");
    expect(task!.status).toBe("created");
  });

  it("lists tasks", async () => {
    await tm.create({ name: "Task 1", challenge: { description: "A", category: "web" }, modelId: "test-model" });
    await tm.create({ name: "Task 2", challenge: { description: "B", category: "pwn" }, modelId: "test-model" });
    const allTasks = await tm.listTasks();
    expect(allTasks.length).toBe(2);
  });

  it("returns null for nonexistent task", async () => {
    const task = await tm.getTask("nonexistent");
    expect(task).toBeNull();
  });

  it("throws when starting a nonexistent task", async () => {
    await expect(tm.start("nonexistent")).rejects.toThrow("not found");
  });

  it("stores challenge metadata correctly", async () => {
    const id = await tm.create({
      name: "HTB Challenge",
      challenge: { description: "Find the SQL injection", category: "web", platform: "HTB", challengeId: "12345" },
      modelId: "test-model",
      autoSubmit: true,
    });
    const task = await tm.getTask(id);
    expect(task!.platform).toBe("HTB");
    expect(task!.challengeId).toBe("12345");
  });
});
