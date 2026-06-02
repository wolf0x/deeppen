import { db } from "../db/index.js";
import { apiConnectorConfigs } from "../db/index.js";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export interface APIConnectorConfig {
  id: string;
  name: string;
  baseUrl: string;
  authType: string;
  authConfig?: Record<string, string>;
  endpoints: Record<string, { method: string; path: string }>;
  responseParsing: Record<string, string>;
  testStatus?: string;
}

export class APIConnector {
  async list(): Promise<APIConnectorConfig[]> {
    const rows = await db.select().from(apiConnectorConfigs);
    return rows.map(this.rowToConfig);
  }

  async get(id: string): Promise<APIConnectorConfig | null> {
    const rows = await db.select().from(apiConnectorConfigs).where(eq(apiConnectorConfigs.id, id));
    return rows[0] ? this.rowToConfig(rows[0]) : null;
  }

  async create(config: Omit<APIConnectorConfig, "id">): Promise<APIConnectorConfig> {
    const id = uuid();
    const now = new Date();
    await db.insert(apiConnectorConfigs).values({
      id, name: config.name, baseUrl: config.baseUrl, authType: config.authType,
      authConfigJson: config.authConfig ? JSON.stringify(config.authConfig) : null,
      endpointsJson: JSON.stringify(config.endpoints),
      responseParsingJson: JSON.stringify(config.responseParsing),
      createdAt: now, updatedAt: now,
    });
    return (await this.get(id))!;
  }

  async delete(id: string): Promise<void> {
    await db.delete(apiConnectorConfigs).where(eq(apiConnectorConfigs.id, id));
  }

  async test(id: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const config = await this.get(id);
      if (!config) return { ok: false, error: "Not found" };
      // Try to reach the base URL
      const response = await fetch(config.baseUrl, { method: "HEAD", signal: AbortSignal.timeout(5000) });
      await db.update(apiConnectorConfigs).set({ testStatus: "ok", lastTestedAt: new Date(), updatedAt: new Date() }).where(eq(apiConnectorConfigs.id, id));
      return { ok: true };
    } catch (err: any) {
      await db.update(apiConnectorConfigs).set({ testStatus: "error", lastTestedAt: new Date(), updatedAt: new Date() }).where(eq(apiConnectorConfigs.id, id));
      return { ok: false, error: err.message };
    }
  }

  private rowToConfig(row: any): APIConnectorConfig {
    return {
      id: row.id, name: row.name, baseUrl: row.baseUrl, authType: row.authType,
      authConfig: row.authConfigJson ? JSON.parse(row.authConfigJson) : undefined,
      endpoints: JSON.parse(row.endpointsJson), responseParsing: JSON.parse(row.responseParsingJson),
      testStatus: row.testStatus ?? undefined,
    };
  }
}
