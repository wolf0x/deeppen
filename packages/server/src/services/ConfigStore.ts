import { db } from "../db/index.js";
import { modelConfigs, subagentConfigs } from "../db/index.js";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import type { ModelConfig, SubAgentConfig } from "@deeppen/shared";

export class ConfigStore {
  // ─── Model Configs ─────────────────────────────────
  async listModels(): Promise<ModelConfig[]> {
    const rows = await db.select().from(modelConfigs);
    return rows.map(this.rowToModelConfig);
  }

  async getModel(id: string): Promise<ModelConfig | null> {
    const rows = await db
      .select()
      .from(modelConfigs)
      .where(eq(modelConfigs.id, id));
    return rows[0] ? this.rowToModelConfig(rows[0]) : null;
  }

  async createModel(config: Omit<ModelConfig, "id">): Promise<ModelConfig> {
    const id = uuid();
    const now = new Date();
    await db.insert(modelConfigs).values({
      id,
      name: config.name,
      provider: config.provider,
      apiKeyEncrypted: config.apiKey?.trim() || null,
      baseUrl: config.baseUrl ?? null,
      modelId: config.modelId,
      maxTokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0,
      configJson: config.configJson
        ? JSON.stringify(config.configJson)
        : null,
      createdAt: now,
      updatedAt: now,
    });
    return (await this.getModel(id)) as ModelConfig;
  }

  async updateModel(
    id: string,
    config: Partial<ModelConfig>,
  ): Promise<ModelConfig | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (config.name !== undefined) updateData.name = config.name;
    if (config.provider !== undefined) updateData.provider = config.provider;
    if (config.apiKey !== undefined)
      updateData.apiKeyEncrypted = config.apiKey?.trim() || null;
    if (config.baseUrl !== undefined) updateData.baseUrl = config.baseUrl;
    if (config.modelId !== undefined) updateData.modelId = config.modelId;
    if (config.maxTokens !== undefined) updateData.maxTokens = config.maxTokens;
    if (config.temperature !== undefined)
      updateData.temperature = config.temperature;

    await db
      .update(modelConfigs)
      .set(updateData)
      .where(eq(modelConfigs.id, id));
    return this.getModel(id);
  }

  async deleteModel(id: string): Promise<void> {
    await db.delete(modelConfigs).where(eq(modelConfigs.id, id));
  }

  async updateModelTestResult(
    id: string,
    status: "ok" | "error",
    error?: string,
  ): Promise<void> {
    await db
      .update(modelConfigs)
      .set({
        testStatus: status,
        testError: error ?? null,
        lastTestedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(modelConfigs.id, id));
  }

  // ─── SubAgent Configs ──────────────────────────────
  async listSubagents(): Promise<SubAgentConfig[]> {
    const rows = await db.select().from(subagentConfigs);
    return rows.map(this.rowToSubAgentConfig);
  }

  async getSubagent(id: string): Promise<SubAgentConfig | null> {
    const rows = await db
      .select()
      .from(subagentConfigs)
      .where(eq(subagentConfigs.id, id));
    return rows[0] ? this.rowToSubAgentConfig(rows[0]) : null;
  }

  async createSubagent(
    config: Omit<SubAgentConfig, "id">,
  ): Promise<SubAgentConfig> {
    const id = uuid();
    await db.insert(subagentConfigs).values({
      id,
      name: config.name,
      description: config.description,
      systemPrompt: config.systemPrompt,
      modelId: config.modelId ?? null,
      toolsJson: config.tools ? JSON.stringify(config.tools) : null,
      skillsJson: config.skills ? JSON.stringify(config.skills) : null,
      createdAt: new Date(),
    });
    return (await this.getSubagent(id)) as SubAgentConfig;
  }

  async updateSubagent(
    id: string,
    config: Partial<SubAgentConfig>,
  ): Promise<SubAgentConfig | null> {
    const updateData: Record<string, unknown> = {};
    if (config.name !== undefined) updateData.name = config.name;
    if (config.description !== undefined)
      updateData.description = config.description;
    if (config.systemPrompt !== undefined)
      updateData.systemPrompt = config.systemPrompt;
    if (config.modelId !== undefined) updateData.modelId = config.modelId;
    if (config.tools !== undefined)
      updateData.toolsJson = JSON.stringify(config.tools);
    if (config.skills !== undefined)
      updateData.skillsJson = JSON.stringify(config.skills);

    await db
      .update(subagentConfigs)
      .set(updateData)
      .where(eq(subagentConfigs.id, id));
    return this.getSubagent(id);
  }

  async deleteSubagent(id: string): Promise<void> {
    await db.delete(subagentConfigs).where(eq(subagentConfigs.id, id));
  }

  // ─── Internal: Get model with real API key (for agent execution) ──
  async getModelWithKey(id: string): Promise<ModelConfig | null> {
    const rows = await db
      .select()
      .from(modelConfigs)
      .where(eq(modelConfigs.id, id));
    if (!rows[0]) return null;
    return {
      ...this.rowToModelConfig(rows[0]),
      apiKey: rows[0].apiKeyEncrypted ?? undefined,
    };
  }

  // ─── Mappers ───────────────────────────────────────
  private rowToModelConfig(row: any): ModelConfig {
    return {
      id: row.id,
      name: row.name,
      provider: row.provider as ModelConfig["provider"],
      apiKey: row.apiKeyEncrypted ? "***" : undefined, // Masked for security
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

  private rowToSubAgentConfig(row: any): SubAgentConfig {
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
}
