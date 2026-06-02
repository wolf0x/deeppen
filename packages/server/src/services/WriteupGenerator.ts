import { db } from "../db/index.js";
import { writeups, tasks, streamEvents } from "../db/index.js";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export interface Writeup {
  id: string;
  taskId: string;
  title: string;
  contentMarkdown: string;
  createdAt: Date;
  updatedAt: Date;
}

export class WriteupGenerator {
  /**
   * Generate a writeup from a completed task's execution history.
   * Uses the stream events to build a structured writeup.
   */
  async generate(taskId: string): Promise<Writeup> {
    const taskRows = await db.select().from(tasks).where(eq(tasks.id, taskId));
    const task = taskRows[0];
    if (!task) throw new Error(`Task ${taskId} not found`);

    const events = await db
      .select()
      .from(streamEvents)
      .where(eq(streamEvents.taskId, taskId));

    const content = this.buildWriteup(task, events);

    const id = uuid();
    const now = new Date();
    await db.insert(writeups).values({
      id,
      taskId,
      title: `Writeup: ${task.name}`,
      contentMarkdown: content,
      createdAt: now,
      updatedAt: now,
    });

    // Link writeup to task
    await db.update(tasks).set({ writeupId: id, updatedAt: now }).where(eq(tasks.id, taskId));

    return this.get(id) as Promise<Writeup>;
  }

  async get(id: string): Promise<Writeup | null> {
    const rows = await db.select().from(writeups).where(eq(writeups.id, id));
    return rows[0] ? this.rowToWriteup(rows[0]) : null;
  }

  async getByTaskId(taskId: string): Promise<Writeup | null> {
    const rows = await db.select().from(writeups).where(eq(writeups.taskId, taskId));
    return rows[0] ? this.rowToWriteup(rows[0]) : null;
  }

  async list(): Promise<Writeup[]> {
    const rows = await db.select().from(writeups);
    return rows.map(this.rowToWriteup);
  }

  async update(id: string, content: string): Promise<void> {
    await db.update(writeups).set({ contentMarkdown: content, updatedAt: new Date() }).where(eq(writeups.id, id));
  }

  async delete(id: string): Promise<void> {
    await db.delete(writeups).where(eq(writeups.id, id));
  }

  private buildWriteup(task: any, events: any[]): string {
    const flag = task.flag ?? "Not found";
    const elapsed = task.elapsedMs ? `${Math.round(task.elapsedMs / 1000)}s` : "N/A";

    // Categorize events
    const thinking = events.filter((e) => e.type === "agent-think");
    const toolCalls = events.filter((e) => e.type === "tool-call");
    const flagEvents = events.filter((e) => e.type === "flag-found");
    const escapeEvents = events.filter((e) => e.type === "rabbit-hole-escape");

    // Count tool usage
    const toolCounts: Record<string, number> = {};
    for (const tc of toolCalls) {
      const data = tc.dataJson ? JSON.parse(tc.dataJson) : {};
      const name = data.toolName ?? "unknown";
      toolCounts[name] = (toolCounts[name] ?? 0) + 1;
    }

    let md = `# CTF Writeup: ${task.name}\n\n`;
    md += `## Challenge Info\n`;
    md += `- **Category:** ${task.category}\n`;
    md += `- **Platform:** ${task.platform ?? "N/A"}\n`;
    md += `- **Solved by:** DeepPen (AI)\n`;
    md += `- **Time:** ${elapsed}\n`;
    md += `- **Status:** ${task.status}\n\n`;

    md += `## Challenge Description\n`;
    md += `> ${task.challengeDescription}\n\n`;

    md += `## Approach\n\n`;

    // Build timeline from thinking events
    if (thinking.length > 0) {
      md += `### Analysis\n`;
      for (const t of thinking.slice(0, 5)) {
        const data = t.dataJson ? JSON.parse(t.dataJson) : {};
        if (data.content) {
          md += `- ${data.content.slice(0, 150)}\n`;
        }
      }
      md += `\n`;
    }

    if (escapeEvents.length > 0) {
      md += `### Pivots\n`;
      for (const e of escapeEvents) {
        const data = e.dataJson ? JSON.parse(e.dataJson) : {};
        md += `- ${data.content ?? "Approach changed"}\n`;
      }
      md += `\n`;
    }

    md += `## Flag\n`;
    md += `\`${flag}\`\n\n`;

    md += `## Tools Used\n`;
    md += `| Tool | Count |\n`;
    md += `|------|-------|\n`;
    for (const [name, count] of Object.entries(toolCounts)) {
      md += `| ${name} | ${count} |\n`;
    }
    md += `\n`;

    if (flagEvents.length > 0) {
      md += `## Flag Discovery\n`;
      for (const f of flagEvents) {
        const data = f.dataJson ? JSON.parse(f.dataJson) : {};
        md += `Flag found: \`${data.flag ?? "unknown"}\`\n`;
      }
    }

    return md;
  }

  private rowToWriteup(row: any): Writeup {
    return {
      id: row.id,
      taskId: row.taskId,
      title: row.title,
      contentMarkdown: row.contentMarkdown,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
