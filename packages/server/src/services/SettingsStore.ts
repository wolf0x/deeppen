import { db } from "../db/index.js";
import { settings } from "../db/index.js";
import { eq } from "drizzle-orm";

export interface AppSettings {
  // Agent settings
  maxIterations: number;
  maxToolCalls: number;
  maxTimeMinutes: number;
  taskTimeoutMinutes: number;

  // UI settings
  fontFamily: string;
  fontSize: number;
  bgColor: string;
  surfaceColor: string;
  elevatedColor: string;

  // Stream tree settings
  recentEventCount: number;
  autoCollapseHistory: boolean;
  maxExpandedLines: number;
}

const DEFAULTS: AppSettings = {
  maxIterations: 100,
  maxToolCalls: 500,
  maxTimeMinutes: 30,
  taskTimeoutMinutes: 35,

  fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
  fontSize: 13,
  bgColor: "#0d1117",
  surfaceColor: "#161b22",
  elevatedColor: "#1c2128",

  recentEventCount: 10,
  autoCollapseHistory: true,
  maxExpandedLines: 50,
};

export class SettingsStore {
  async getAll(): Promise<AppSettings> {
    const rows = await db.select().from(settings);
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const result: Record<string, any> = {};
    for (const [key, defaultVal] of Object.entries(DEFAULTS)) {
      const stored = map.get(key);
      if (stored !== undefined) {
        result[key] = typeof defaultVal === "number" ? Number(stored) :
                      typeof defaultVal === "boolean" ? stored === "true" :
                      stored;
      } else {
        result[key] = defaultVal;
      }
    }
    return result as AppSettings;
  }

  async get(key: string): Promise<string | null> {
    const rows = await db.select().from(settings).where(eq(settings.key, key));
    return rows[0]?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await db.insert(settings).values({ key, value }).onConflictDoUpdate({
      target: settings.key,
      set: { value },
    });
  }

  async updateAll(partial: Partial<AppSettings>): Promise<AppSettings> {
    for (const [key, value] of Object.entries(partial)) {
      if (key in DEFAULTS) {
        await this.set(key, String(value));
      }
    }
    return this.getAll();
  }
}
