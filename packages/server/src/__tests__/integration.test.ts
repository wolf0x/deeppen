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

// Mock AgentRunner
vi.mock("../services/AgentRunner.js", () => ({
  createChatModel: vi.fn(),
  runCTFAgent: vi.fn().mockResolvedValue({ flag: null, messages: [], events: [] }),
}));

// Imports (after mocks)
import request from "supertest";
import express from "express";
import { TaskManager } from "../services/TaskManager.js";
import { ConfigStore } from "../services/ConfigStore.js";
import { StreamBridge } from "../services/StreamBridge.js";
import { createTaskRoutes } from "../routes/tasks.js";
import { createConfigRoutes } from "../routes/config.js";
import { createStreamRoutes } from "../routes/stream.js";
import { createHealthRoutes } from "../routes/health.js";

function createTestApp() {
  const app = express();
  app.use(express.json());
  const taskManager = new TaskManager();
  const configStore = new ConfigStore();
  const streamBridge = new StreamBridge();
  taskManager.on("stream", (taskId: string, event: any) => streamBridge.broadcast(taskId, event));
  app.use("/api/tasks", createTaskRoutes(taskManager));
  app.use("/api/config", createConfigRoutes(configStore));
  app.use("/api/tasks", createStreamRoutes(taskManager, streamBridge));
  app.use("/api/health", createHealthRoutes());
  return { app, taskManager, configStore };
}

describe("Integration: API Endpoints", () => {
  beforeEach(() => {
    testSqlite.exec("DELETE FROM stream_events; DELETE FROM tasks; DELETE FROM subagent_configs; DELETE FROM model_configs;");
  });

  it("GET /api/health returns ok", async () => {
    const { app } = createTestApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("deeppen");
  });

  it("GET /api/tasks returns empty array initially", async () => {
    const { app } = createTestApp();
    const res = await request(app).get("/api/tasks");
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });

  it("POST /api/config/models creates a model config", async () => {
    const { app } = createTestApp();
    const res = await request(app).post("/api/config/models").send({
      name: "Test Model", provider: "anthropic", apiKey: "test-key", modelId: "claude-sonnet-4-6",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe("Test Model");
  });

  it("POST /api/tasks creates a task", async () => {
    const { app, configStore } = createTestApp();
    const model = await configStore.createModel({
      name: "Test Model", provider: "anthropic", apiKey: "test-key",
      modelId: "claude-sonnet-4-6", maxTokens: 4096, temperature: 0,
    });
    const res = await request(app).post("/api/tasks").send({
      name: "Test CTF Challenge",
      challenge: { description: "Find the flag: flag{test123}", category: "misc" },
      modelId: model.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  it("POST /api/tasks rejects invalid config", async () => {
    const { app } = createTestApp();
    const res = await request(app).post("/api/tasks").send({ name: "" });
    expect(res.status).toBe(400);
  });

  it("GET /api/tasks/:id returns 404 for nonexistent task", async () => {
    const { app } = createTestApp();
    const res = await request(app).get("/api/tasks/nonexistent");
    expect(res.status).toBe(404);
  });

  it("POST /api/tasks/:id/start returns 400 for nonexistent task", async () => {
    const { app } = createTestApp();
    const res = await request(app).post("/api/tasks/nonexistent/start");
    expect(res.status).toBe(400);
  });

  it("GET /api/config/models returns models after creation", async () => {
    const { app, configStore } = createTestApp();
    await configStore.createModel({
      name: "Model A", provider: "openai", modelId: "gpt-4o", maxTokens: 4096, temperature: 0,
    });
    const res = await request(app).get("/api/config/models");
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe("Model A");
  });

  it("GET /api/config/agents returns empty array initially", async () => {
    const { app } = createTestApp();
    const res = await request(app).get("/api/config/agents");
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });

  it("full task lifecycle: create → get → list", async () => {
    const { app, configStore } = createTestApp();
    const model = await configStore.createModel({
      name: "Claude", provider: "anthropic", modelId: "claude-sonnet-4-6", maxTokens: 4096, temperature: 0,
    });
    const createRes = await request(app).post("/api/tasks").send({
      name: "Web Challenge",
      challenge: { description: "SQL injection", category: "web" },
      modelId: model.id,
    });
    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;

    const getRes = await request(app).get(`/api/tasks/${taskId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.name).toBe("Web Challenge");

    const listRes = await request(app).get("/api/tasks");
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(1);
  });
});
