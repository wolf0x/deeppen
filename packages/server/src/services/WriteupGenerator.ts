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
  async generate(taskId: string): Promise<Writeup> {
    const taskRows = await db.select().from(tasks).where(eq(tasks.id, taskId));
    const task = taskRows[0];
    if (!task) throw new Error(`Task ${taskId} not found`);

    const events = await db
      .select()
      .from(streamEvents)
      .where(eq(streamEvents.taskId, taskId))
      .orderBy(streamEvents.timestamp);

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
    const elapsed = task.elapsedMs ? this.formatTime(task.elapsedMs) : "N/A";

    // Parse events
    const parsed = events.map((e) => ({
      type: e.type,
      data: e.dataJson ? JSON.parse(e.dataJson) : {},
    }));

    // Extract agent responses — the solver's reasoning and findings
    const responses = parsed
      .filter((e) => e.type === "agent-response")
      .map((e) => e.data.content ?? "")
      .filter((t) => t.trim().length > 0);

    // Extract tool result outputs — the actual data discovered
    const toolOutputs = parsed
      .filter((e) => e.type === "tool-result" && e.data.toolOutput)
      .map((e) => e.data.toolOutput as string);

    let md = "";

    // Title
    md += `# ${task.name}\n\n`;

    // Challenge info
    md += `## 题目信息\n\n`;
    md += `- **分类:** ${task.category}\n`;
    md += `- **平台:** ${task.platform || "N/A"}\n`;
    md += `- **用时:** ${elapsed}\n\n`;

    // Challenge description
    md += `## 题目描述\n\n`;
    md += `${task.challengeDescription}\n\n`;

    // Solution approach — what the solver was thinking
    md += `## 解题思路\n\n`;
    if (responses.length > 0) {
      for (const text of responses) {
        md += `${text.trim()}\n\n`;
      }
    } else {
      md += `(No solving steps recorded)\n\n`;
    }

    // Key data discovered — actual content found during solving
    const interestingOutputs = this.extractInterestingOutputs(toolOutputs);
    if (interestingOutputs.length > 0) {
      md += `## 关键发现\n\n`;
      for (const output of interestingOutputs) {
        md += `\`\`\`\n${output}\n\`\`\`\n\n`;
      }
    }

    // Result
    md += `## 结果\n\n`;
    if (task.status === "completed" && flag !== "Not found") {
      md += `**Flag:** \`${flag}\`\n`;
    } else if (task.status === "stopped" && task.error) {
      md += `任务终止: ${task.error}\n`;
    } else {
      md += `任务状态: ${task.status}\n`;
    }

    return md;
  }

  /** Extract interesting outputs — skip trivial ones */
  private extractInterestingOutputs(outputs: string[]): string[] {
    const seen = new Set<string>();
    const results: string[] = [];

    for (const output of outputs) {
      const trimmed = output.trim();
      if (trimmed.length < 20) continue;

      // Skip trivial outputs
      if (trimmed.startsWith("total ") && trimmed.includes("drwx")) continue; // ls output
      if (trimmed.match(/^(ok|done|success|yes|no)$/i)) continue;
      if (trimmed.includes("Command succeeded with exit code 0") && trimmed.length < 50) continue;

      // Deduplicate
      const key = trimmed.slice(0, 100);
      if (seen.has(key)) continue;
      seen.add(key);

      results.push(trimmed.slice(0, 800));
    }

    return results.slice(0, 10);
  }

  private formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) return `${minutes}分${secs}秒`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}小时${mins}分`;
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
