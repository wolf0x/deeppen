import { describe, it, expect, beforeEach, vi } from "vitest";

const { testSqlite, mcTable, saTable } = vi.hoisted(() => {
  const Database = require("better-sqlite3");
  const { drizzle } = require("drizzle-orm/better-sqlite3");
  const { sqliteTable, text, integer, real } = require("drizzle-orm/sqlite-core");

  const testSqlite = new Database(":memory:");
  testSqlite.pragma("journal_mode = WAL");
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

  return { testSqlite, mcTable, saTable };
});

vi.mock("../db/index.js", () => {
  const { drizzle } = require("drizzle-orm/better-sqlite3");
  const db = drizzle(testSqlite, { modelConfigs: mcTable, subagentConfigs: saTable });
  return { db, sqlite: testSqlite, modelConfigs: mcTable, subagentConfigs: saTable };
});

const { ConfigStore } = await import("./ConfigStore.js");

describe("ConfigStore", () => {
  let store: InstanceType<typeof ConfigStore>;

  beforeEach(() => {
    testSqlite.exec("DELETE FROM subagent_configs; DELETE FROM model_configs;");
    store = new ConfigStore();
  });

  it("starts with no models", async () => {
    expect(await store.listModels()).toEqual([]);
  });

  it("creates and retrieves a model", async () => {
    const model = await store.createModel({
      name: "Claude", provider: "anthropic", apiKey: "sk-test",
      modelId: "claude-sonnet-4-6", maxTokens: 4096, temperature: 0,
    });
    expect(model.id).toBeDefined();
    expect(model.name).toBe("Claude");

    const fetched = await store.getModel(model.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe("Claude");
    // API key should be masked in getModel
    expect(fetched!.apiKey).toBe("***");
  });

  it("getModelWithKey returns real API key", async () => {
    const model = await store.createModel({
      name: "Claude", provider: "anthropic", apiKey: "sk-secret",
      modelId: "claude-sonnet-4-6", maxTokens: 4096, temperature: 0,
    });
    const full = await store.getModelWithKey(model.id);
    expect(full).not.toBeNull();
    expect(full!.apiKey).toBe("sk-secret");
  });

  it("deletes a model", async () => {
    const model = await store.createModel({
      name: "ToDelete", provider: "openai", modelId: "gpt-4o", maxTokens: 4096, temperature: 0,
    });
    await store.deleteModel(model.id);
    expect(await store.getModel(model.id)).toBeNull();
  });

  it("lists models after creation", async () => {
    await store.createModel({ name: "A", provider: "openai", modelId: "gpt-4o", maxTokens: 4096, temperature: 0 });
    await store.createModel({ name: "B", provider: "anthropic", modelId: "claude", maxTokens: 4096, temperature: 0 });
    expect((await store.listModels()).length).toBe(2);
  });

  it("starts with no subagents", async () => {
    expect(await store.listSubagents()).toEqual([]);
  });

  it("creates and retrieves a subagent", async () => {
    const agent = await store.createSubagent({
      name: "researcher", description: "Research agent", systemPrompt: "You research.",
    });
    expect(agent.id).toBeDefined();
    const fetched = await store.getSubagent(agent.id);
    expect(fetched!.name).toBe("researcher");
  });

  it("stores tools and skills as JSON", async () => {
    const agent = await store.createSubagent({
      name: "tool-agent", description: "Has tools", systemPrompt: "You have tools.",
      tools: ["read_file", "grep"], skills: ["/skills/web-security/"],
    });
    const fetched = await store.getSubagent(agent.id);
    expect(fetched!.tools).toEqual(["read_file", "grep"]);
    expect(fetched!.skills).toEqual(["/skills/web-security/"]);
  });

  it("deletes a subagent", async () => {
    const agent = await store.createSubagent({ name: "to-delete", description: "Bye", systemPrompt: "Bye." });
    await store.deleteSubagent(agent.id);
    expect(await store.getSubagent(agent.id)).toBeNull();
  });

  it("returns null for nonexistent model", async () => {
    expect(await store.getModel("nonexistent")).toBeNull();
  });

  it("returns null for nonexistent subagent", async () => {
    expect(await store.getSubagent("nonexistent")).toBeNull();
  });
});
