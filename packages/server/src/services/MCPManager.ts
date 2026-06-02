import { db } from "../db/index.js";
import { mcpConfigs } from "../db/index.js";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

function isAllowedUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    // Block internal/private IPs
    const hostname = url.hostname;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname.startsWith("169.254.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.16.") ||
      hostname.startsWith("192.168.") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local")
    ) {
      return false;
    }
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export interface MCPConfig {
  id: string;
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  toolMapping?: Record<string, string>;
  isRunning?: boolean;
  testStatus?: string;
}

export class MCPManager {
  async list(): Promise<MCPConfig[]> {
    const rows = await db.select().from(mcpConfigs);
    return rows.map(this.rowToConfig);
  }

  async get(id: string): Promise<MCPConfig | null> {
    const rows = await db.select().from(mcpConfigs).where(eq(mcpConfigs.id, id));
    return rows[0] ? this.rowToConfig(rows[0]) : null;
  }

  async create(config: Omit<MCPConfig, "id">): Promise<MCPConfig> {
    const id = uuid();
    const now = new Date();
    await db.insert(mcpConfigs).values({
      id, name: config.name, transport: config.transport,
      command: config.command ?? null, argsJson: config.args ? JSON.stringify(config.args) : null,
      envJson: config.env ? JSON.stringify(config.env) : null, url: config.url ?? null,
      headersJson: config.headers ? JSON.stringify(config.headers) : null,
      toolMappingJson: config.toolMapping ? JSON.stringify(config.toolMapping) : null,
      createdAt: now, updatedAt: now,
    });
    return (await this.get(id))!;
  }

  async update(id: string, config: Partial<MCPConfig>): Promise<MCPConfig | null> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (config.name !== undefined) updateData.name = config.name;
    if (config.transport !== undefined) updateData.transport = config.transport;
    if (config.command !== undefined) updateData.command = config.command;
    if (config.args !== undefined) updateData.argsJson = JSON.stringify(config.args);
    if (config.url !== undefined) updateData.url = config.url;
    await db.update(mcpConfigs).set(updateData).where(eq(mcpConfigs.id, id));
    return this.get(id);
  }

  async delete(id: string): Promise<void> {
    await db.delete(mcpConfigs).where(eq(mcpConfigs.id, id));
  }

  async test(id: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const config = await this.get(id);
      if (!config) return { ok: false, error: "Not found" };
      // Basic validation
      if (config.transport === "stdio" && !config.command) return { ok: false, error: "No command specified" };
      if (config.transport === "sse" && !config.url) return { ok: false, error: "No URL specified" };
      // SSRF protection for SSE transport
      if (config.transport === "sse" && config.url && !isAllowedUrl(config.url)) {
        return { ok: false, error: "URL not allowed: must be a public HTTP/HTTPS URL" };
      }
      await db.update(mcpConfigs).set({ testStatus: "ok", lastTestedAt: new Date(), updatedAt: new Date() }).where(eq(mcpConfigs.id, id));
      return { ok: true };
    } catch (err: any) {
      await db.update(mcpConfigs).set({ testStatus: "error", lastTestedAt: new Date(), updatedAt: new Date() }).where(eq(mcpConfigs.id, id));
      return { ok: false, error: err.message };
    }
  }

  private rowToConfig(row: any): MCPConfig {
    return {
      id: row.id, name: row.name, transport: row.transport,
      command: row.command ?? undefined, args: row.argsJson ? JSON.parse(row.argsJson) : undefined,
      env: row.envJson ? JSON.parse(row.envJson) : undefined, url: row.url ?? undefined,
      headers: row.headersJson ? JSON.parse(row.headersJson) : undefined,
      toolMapping: row.toolMappingJson ? JSON.parse(row.toolMappingJson) : undefined,
      isRunning: row.isRunning ?? false, testStatus: row.testStatus ?? undefined,
    };
  }
}
