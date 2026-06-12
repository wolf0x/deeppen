import { db, sqlite } from "../db/index.js";
import { guidanceStore } from "../db/index.js";
import { eq } from "drizzle-orm";

/**
 * Shared guidance store for Loop Agent → Main Agent communication.
 * The Loop Agent writes guidance here, and the main agent's middleware reads it.
 */
export class GuidanceStore {
  /**
   * Set guidance for a task (overwrites previous guidance)
   */
  async set(taskId: string, guidance: string, iterationNum: number): Promise<void> {
    await db.insert(guidanceStore)
      .values({ taskId, guidance, iterationNum, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: guidanceStore.taskId,
        set: { guidance, iterationNum, updatedAt: new Date() },
      });
  }

  /**
   * Get guidance for a task (returns null if none)
   */
  async get(taskId: string): Promise<{ guidance: string; iterationNum: number } | null> {
    const rows = await db.select().from(guidanceStore).where(eq(guidanceStore.taskId, taskId));
    if (rows.length === 0) return null;
    return { guidance: rows[0].guidance, iterationNum: rows[0].iterationNum ?? 0 };
  }

  /**
   * Clear guidance for a task
   */
  async clear(taskId: string): Promise<void> {
    await db.delete(guidanceStore).where(eq(guidanceStore.taskId, taskId));
  }

  /**
   * Get and clear guidance (atomic read + delete)
   */
  async consume(taskId: string): Promise<{ guidance: string; iterationNum: number } | null> {
    const result = await this.get(taskId);
    if (result) {
      await this.clear(taskId);
    }
    return result;
  }
}
