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

    // Parse all events
    const parsed = events.map((e) => ({
      type: e.type,
      data: e.dataJson ? JSON.parse(e.dataJson) : {},
      timestamp: e.timestamp,
    }));

    // Extract agent responses (the model's reasoning and findings)
    const responses = parsed.filter((e) => e.type === "agent-response");

    // Extract tool calls and results as pairs
    const toolPairs = this.pairToolCalls(parsed);

    // Extract key findings from tool results
    const findings = this.extractFindings(toolPairs);

    // Build writeup
    let md = "";

    // Header
    md += `# ${task.name}\n\n`;
    md += `| Field | Value |\n|-------|-------|\n`;
    md += `| Category | ${task.category} |\n`;
    md += `| Platform | ${task.platform || "N/A"} |\n`;
    md += `| Status | ${task.status} |\n`;
    md += `| Time | ${elapsed} |\n`;
    md += `| Flag | \`${flag}\` |\n\n`;

    // Challenge description
    md += `## Challenge\n\n`;
    md += `${task.challengeDescription}\n\n`;

    // Approach — from agent responses
    if (responses.length > 0) {
      md += `## Approach\n\n`;
      for (const r of responses) {
        const text = r.data.content ?? "";
        if (text.trim()) {
          md += `${text.trim()}\n\n`;
        }
      }
    }

    // Key findings — extracted from tool outputs
    if (findings.length > 0) {
      md += `## Key Findings\n\n`;
      for (const f of findings) {
        md += `### ${f.title}\n\n`;
        md += `\`\`\`\n${f.content}\n\`\`\`\n\n`;
      }
    }

    // Reconnaissance summary
    const reconTools = toolPairs.filter((p) =>
      ["web_fetch", "execute", "curl"].includes(p.name)
    );
    if (reconTools.length > 0) {
      md += `## Reconnaissance\n\n`;
      for (const t of reconTools.slice(0, 15)) {
        const input = this.formatToolInput(t.name, t.input);
        const output = t.output ? t.output.slice(0, 300) : "(no output)";
        md += `**${t.name}** \`${input}\`\n`;
        md += `\`\`\`\n${output}\n\`\`\`\n\n`;
      }
    }

    // Tools used summary
    const toolCounts: Record<string, number> = {};
    for (const p of toolPairs) {
      toolCounts[p.name] = (toolCounts[p.name] ?? 0) + 1;
    }
    if (Object.keys(toolCounts).length > 0) {
      md += `## Tools Used\n\n`;
      md += `| Tool | Calls |\n|------|-------|\n`;
      for (const [name, count] of Object.entries(toolCounts)) {
        md += `| ${name} | ${count} |\n`;
      }
      md += `\n`;
    }

    // Result
    md += `## Result\n\n`;
    if (task.status === "completed" && flag !== "Not found") {
      md += `Challenge solved successfully. Flag: \`${flag}\`\n`;
    } else if (task.status === "stopped" && task.error) {
      md += `Task stopped: ${task.error}\n`;
    } else {
      md += `Task ended with status: ${task.status}\n`;
    }

    return md;
  }

  /** Pair tool-call events with their tool-result events */
  private pairToolCalls(parsed: any[]): Array<{ name: string; input: any; output: string | null }> {
    const pairs: Array<{ name: string; input: any; output: string | null }> = [];
    const pending = new Map<string, any>();

    for (const e of parsed) {
      if (e.type === "tool-call") {
        // Use a temp key since we don't have toolCall.id in the event
        const key = `${e.data.toolName}-${e.timestamp}`;
        pending.set(key, { name: e.data.toolName, input: e.data.toolInput });
      } else if (e.type === "tool-result") {
        // Find matching tool-call by name and proximity
        const matchKey = [...pending.keys()].find((k) =>
          k.startsWith(e.data.toolName + "-") &&
          Math.abs(parseInt(k.split("-").pop() ?? "0") - e.timestamp) < 10000
        );
        if (matchKey) {
          const call = pending.get(matchKey)!;
          pairs.push({ name: call.name, input: call.input, output: e.data.toolOutput ?? null });
          pending.delete(matchKey);
        } else {
          pairs.push({ name: e.data.toolName, input: null, output: e.data.toolOutput ?? null });
        }
      }
    }

    // Add unmatched calls
    for (const [, call] of pending) {
      pairs.push({ name: call.name, input: call.input, output: null });
    }

    return pairs;
  }

  /** Extract interesting findings from tool results */
  private extractFindings(toolPairs: Array<{ name: string; input: any; output: string | null }>): Array<{ title: string; content: string }> {
    const findings: Array<{ title: string; content: string }> = [];

    for (const t of toolPairs) {
      if (!t.output) continue;

      // Look for interesting patterns in tool output
      const output = t.output;

      // HTTP responses with interesting content
      if (t.name === "web_fetch" && output.length > 50) {
        const input = this.formatToolInput(t.name, t.input);
        findings.push({
          title: `Web: ${input}`,
          content: output.slice(0, 500),
        });
      }

      // Execute commands that returned useful info
      if (t.name === "execute" && t.input?.command) {
        const cmd = t.input.command;
        // Skip trivial commands
        if (cmd.startsWith("ls") || cmd.startsWith("pwd") || cmd.startsWith("echo")) continue;
        if (output.length > 30 && !output.includes("error") && !output.includes("not found")) {
          findings.push({
            title: `Command: ${cmd.slice(0, 60)}`,
            content: output.slice(0, 500),
          });
        }
      }
    }

    // Deduplicate by title
    const seen = new Set<string>();
    return findings.filter((f) => {
      if (seen.has(f.title)) return false;
      seen.add(f.title);
      return true;
    }).slice(0, 10);
  }

  private formatToolInput(name: string, input: any): string {
    if (!input) return "";
    if (typeof input === "string") return input.slice(0, 80);
    if (input.url) return input.url;
    if (input.command) return input.command.slice(0, 80);
    if (input.path) return input.path;
    return JSON.stringify(input).slice(0, 80);
  }

  private formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) return `${minutes}m ${secs}s`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
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
