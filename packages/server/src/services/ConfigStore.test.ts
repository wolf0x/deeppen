import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import type { ModelConfig, SubAgentConfig } from "@deeppen/shared";

// Inline schema for testing (avoids importing the real db module)
const modelConfigs = sqliteTable("model_configs", {
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

const subagentConfigs = sqliteTable("subagent_configs", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  modelId: text("model_id"),
  toolsJson: text("tools_json"),
  skillsJson: text("skills_json"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Create test database helper
function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // Create tables
  sqlite.exec(`
    CREATE TABLE model_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      api_key_encrypted TEXT,
      base_url TEXT,
      model_id TEXT NOT NULL,
      max_tokens INTEGER DEFAULT 4096,
      temperature REAL DEFAULT 0,
      config_json TEXT,
      last_tested_at INTEGER,
      test_status TEXT,
      test_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE subagent_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      model_id TEXT,
      tools_json TEXT,
      skills_json TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  return drizzle(sqlite, { modelConfigs, subagentConfigs });
}

describe("ConfigStore", () => {
  let testDb: ReturnType<typeof createTestDb>;
  let store: any;

  beforeEach(() => {
    testDb = createTestDb();

    // Create a ConfigStore-like class that uses the test db
    store = {
      async listModels(): Promise<ModelConfig[]> {
        const rows = await testDb.select().from(modelConfigs);
        return rows.map(rowToModelConfig);
      },
      async getModel(id: string): Promise<ModelConfig | null> {
        const rows = await testDb
          .select()
          .from(modelConfigs)
          .where(eq(modelConfigs.id, id));
        return rows[0] ? rowToModelConfig(rows[0]) : null;
      },
      async createModel(config: Omit<ModelConfig, "id">): Promise<ModelConfig> {
        const id = uuid();
        const now = new Date();
        await testDb.insert(modelConfigs).values({
          id,
          name: config.name,
          provider: config.provider,
          apiKeyEncrypted: config.apiKey ?? null,
          baseUrl: config.baseUrl ?? null,
          modelId: config.modelId,
          maxTokens: config.maxTokens ?? 4096,
          temperature: config.temperature ?? 0,
          configJson: config.configJson ? JSON.stringify(config.configJson) : null,
          createdAt: now,
          updatedAt: now,
        });
        return (await store.getModel(id)) as ModelConfig;
      },
      async deleteModel(id: string): Promise<void> {
        await testDb.delete(modelConfigs).where(eq(modelConfigs.id, id));
      },
      async updateModelTestResult(
        id: string,
        status: "ok" | "error",
        error?: string,
      ): Promise<void> {
        await testDb
          .update(modelConfigs)
          .set({
            testStatus: status,
            testError: error ?? null,
            lastTestedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(modelConfigs.id, id));
      },
      async listSubagents(): Promise<SubAgentConfig[]> {
        const rows = await testDb.select().from(subagentConfigs);
        return rows.map(rowToSubAgentConfig);
      },
      async getSubagent(id: string): Promise<SubAgentConfig | null> {
        const rows = await testDb
          .select()
          .from(subagentConfigs)
          .where(eq(subagentConfigs.id, id));
        return rows[0] ? rowToSubAgentConfig(rows[0]) : null;
      },
      async createSubagent(
        config: Omit<SubAgentConfig, "id">,
      ): Promise<SubAgentConfig> {
        const id = uuid();
        await testDb.insert(subagentConfigs).values({
          id,
          name: config.name,
          description: config.description,
          systemPrompt: config.systemPrompt,
          modelId: config.modelId ?? null,
          toolsJson: config.tools ? JSON.stringify(config.tools) : null,
          skillsJson: config.skills ? JSON.stringify(config.skills) : null,
          createdAt: new Date(),
        });
        return (await store.getSubagent(id)) as SubAgentConfig;
      },
      async deleteSubagent(id: string): Promise<void> {
        await testDb.delete(subagentConfigs).where(eq(subagentConfigs.id, id));
      },
    };
  });

  // Model CRUD tests
  it("starts with no models", async () => {
    const models = await store.listModels();
    expect(models).toEqual([]);
  });

  it("creates a model and retrieves it", async () => {
    const model = await store.createModel({
      name: "Claude",
      provider: "anthropic",
      apiKey: "sk-test",
      modelId: "claude-sonnet-4-6",
      maxTokens: 4096,
      temperature: 0,
    });
    expect(model.id).toBeDefined();
    expect(model.name).toBe("Claude");
    expect(model.provider).toBe("anthropic");

    const fetched = await store.getModel(model.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe("Claude");
  });

  it("lists models after creation", async () => {
    await store.createModel({
      name: "Model A",
      provider: "openai",
      modelId: "gpt-4o",
      maxTokens: 4096,
      temperature: 0,
    });
    await store.createModel({
      name: "Model B",
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      maxTokens: 4096,
      temperature: 0,
    });

    const models = await store.listModels();
    expect(models.length).toBe(2);
  });

  it("deletes a model", async () => {
    const model = await store.createModel({
      name: "ToDelete",
      provider: "openai",
      modelId: "gpt-4o",
      maxTokens: 4096,
      temperature: 0,
    });
    await store.deleteModel(model.id);
    const fetched = await store.getModel(model.id);
    expect(fetched).toBeNull();
  });

  it("returns null for nonexistent model", async () => {
    const fetched = await store.getModel("nonexistent");
    expect(fetched).toBeNull();
  });

  it("updates model test result", async () => {
    const model = await store.createModel({
      name: "TestModel",
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      maxTokens: 4096,
      temperature: 0,
    });
    await store.updateModelTestResult(model.id, "ok");
    const fetched = await store.getModel(model.id);
    expect(fetched!.testStatus).toBe("ok");
  });

  it("stores and retrieves apiKey", async () => {
    const model = await store.createModel({
      name: "WithKey",
      provider: "anthropic",
      apiKey: "sk-secret-key",
      modelId: "claude-sonnet-4-6",
      maxTokens: 4096,
      temperature: 0,
    });
    const fetched = await store.getModel(model.id);
    expect(fetched!.apiKey).toBe("sk-secret-key");
  });

  // SubAgent CRUD tests
  it("starts with no subagents", async () => {
    const agents = await store.listSubagents();
    expect(agents).toEqual([]);
  });

  it("creates a subagent and retrieves it", async () => {
    const agent = await store.createSubagent({
      name: "researcher",
      description: "Research agent",
      systemPrompt: "You are a researcher.",
    });
    expect(agent.id).toBeDefined();
    expect(agent.name).toBe("researcher");

    const fetched = await store.getSubagent(agent.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe("researcher");
  });

  it("stores tools and skills as JSON", async () => {
    const agent = await store.createSubagent({
      name: "tool-agent",
      description: "Has tools",
      systemPrompt: "You have tools.",
      tools: ["read_file", "grep"],
      skills: ["/skills/web-security/"],
    });
    const fetched = await store.getSubagent(agent.id);
    expect(fetched!.tools).toEqual(["read_file", "grep"]);
    expect(fetched!.skills).toEqual(["/skills/web-security/"]);
  });

  it("deletes a subagent", async () => {
    const agent = await store.createSubagent({
      name: "to-delete",
      description: "Will be deleted",
      systemPrompt: "Bye.",
    });
    await store.deleteSubagent(agent.id);
    const fetched = await store.getSubagent(agent.id);
    expect(fetched).toBeNull();
  });
});

function rowToModelConfig(row: any): ModelConfig {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider as ModelConfig["provider"],
    apiKey: row.apiKeyEncrypted ?? undefined,
    baseUrl: row.baseUrl ?? undefined,
    modelId: row.modelId,
    maxTokens: row.maxTokens ?? 4096,
    temperature: row.temperature ?? 0,
    configJson: row.configJson ? JSON.parse(row.configJson) : undefined,
    lastTestedAt: row.lastTestedAt ?? undefined,
    testStatus: row.testStatus ?? undefined,
    testError: row.testError ?? undefined,
  };
}

function rowToSubAgentConfig(row: any): SubAgentConfig {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    systemPrompt: row.systemPrompt,
    modelId: row.modelId ?? undefined,
    tools: row.toolsJson ? JSON.parse(row.toolsJson) : undefined,
    skills: row.skillsJson ? JSON.parse(row.skillsJson) : undefined,
  };
}
