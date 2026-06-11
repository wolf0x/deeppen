import { db } from "../db/index.js";
import { writeups, tasks, streamEvents, modelConfigs } from "../db/index.js";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { createChatModel } from "./AgentRunner.js";

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

    // Try LLM-based writeup generation with ctf-writeup skill
    const content = await this.generateWithLLM(task, events);

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

  private async generateWithLLM(task: any, events: any[]): Promise<string> {
    // Try to get a model config
    const models = await db.select().from(modelConfigs).limit(1);
    if (models.length === 0) {
      return this.buildWriteup(task, events);
    }

    try {
      const model = createChatModel(models[0] as any);

      // Extract key information from events
      const agentResponses = events
        .filter((e: any) => e.type === "agent-response")
        .map((e: any) => { try { return JSON.parse(e.dataJson).content; } catch { return ""; } })
        .filter(Boolean);

      const toolCalls = events
        .filter((e: any) => e.type === "tool-call")
        .map((e: any) => {
          try {
            const d = JSON.parse(e.dataJson);
            return `${d.toolName}: ${d.toolInput?.command || d.toolInput?.url || JSON.stringify(d.toolInput).slice(0, 100)}`;
          } catch { return ""; }
        })
        .filter(Boolean);

      const toolResults = events
        .filter((e: any) => e.type === "tool-result")
        .map((e: any) => {
          try {
            const d = JSON.parse(e.dataJson);
            return `${d.toolName}: ${(d.toolOutput || "").slice(0, 300)}`;
          } catch { return ""; }
        })
        .filter(Boolean);

      const flags = task.flag ? task.flag.split(",").filter(Boolean) : [];

      const prompt = `Generate a CTF writeup for the following challenge. Follow the ctf-writeup skill format.

## Challenge Info
- Name: ${task.name}
- Category: ${task.category}
- Status: ${task.status}
- Description: ${task.challengeDescription}

## Flags Found
${flags.length > 0 ? flags.map((f: string) => `- ${f}`).join("\n") : "None"}

## Agent Reasoning (key insights)
${agentResponses.slice(-5).map((r: string) => `- ${r.slice(0, 200)}`).join("\n")}

## Tools Used
${toolCalls.slice(0, 20).map((t: string) => `- ${t}`).join("\n")}

## Key Results
${toolResults.slice(0, 10).map((r: string) => `- ${r}`).join("\n")}

Generate a complete writeup in markdown format. Include:
1. Challenge overview
2. Approach and methodology
3. Step-by-step solution
4. Key findings and techniques used
5. Flag(s) found

Keep it concise but complete. Focus on the solving process, not tool execution details.`;

      const response = await model.invoke([
        { role: "system", content: "You are a CTF writeup generator. Generate clear, concise writeups that focus on the solving methodology and key findings." },
        { role: "user", content: prompt },
      ]);

      const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      if (text.trim().length > 100) {
        return text;
      }
    } catch (err: any) {
      console.error("[WriteupGenerator] LLM generation failed:", err.message);
    }

    // Fallback to template-based writeup
    return this.buildWriteup(task, events);
  }

  private buildWriteup(task: any, events: any[]): string {
    const flag = task.flag ?? "Not found";
    const elapsed = task.elapsedMs ? this.formatTime(task.elapsedMs) : "N/A";

    const parsed = events.map((e: any) => ({
      type: e.type,
      data: e.dataJson ? JSON.parse(e.dataJson) : {},
    }));

    const responses = parsed.filter((e: any) => e.type === "agent-response");
    const toolPairs = this.pairToolCalls(parsed);
    const findings = this.extractFindings(toolPairs);

    let md = "";

    md += `# ${task.name}\n\n`;
    md += `| Field | Value |\n|-------|-------|\n`;
    md += `| Category | ${task.category} |\n`;
    md += `| Platform | ${task.platform || "N/A"} |\n`;
    md += `| Status | ${task.status} |\n`;
    md += `| Time | ${elapsed} |\n`;
    md += `| Flag | \`${flag}\` |\n\n`;

    md += `## Challenge\n\n`;
    md += `${task.challengeDescription}\n\n`;

    if (responses.length > 0) {
      md += `## Approach\n\n`;
      for (const r of responses) {
        const text = r.data.content ?? "";
        if (text.trim()) {
          md += `${text.trim()}\n\n`;
        }
      }
    }

    if (findings.length > 0) {
      md += `## Key Findings\n\n`;
      for (const f of findings) {
        md += `### ${f.title}\n\n`;
        md += `\`\`\`\n${f.content}\n\`\`\`\n\n`;
      }
    }

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

  private pairToolCalls(parsed: any[]): Array<{ name: string; input: any; output: string | null }> {
    const pairs: Array<{ name: string; input: any; output: string | null }> = [];
    const pending = new Map<string, any>();

    for (const e of parsed) {
      if (e.type === "tool-call") {
        const key = `${e.data.toolName}-${e.timestamp}`;
        pending.set(key, { name: e.data.toolName, input: e.data.toolInput });
      } else if (e.type === "tool-result") {
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

    for (const [, call] of pending) {
      pairs.push({ name: call.name, input: call.input, output: null });
    }

    return pairs;
  }

  private extractFindings(toolPairs: Array<{ name: string; input: any; output: string | null }>): Array<{ title: string; content: string }> {
    const findings: Array<{ title: string; content: string }> = [];
    const seen = new Set<string>();

    for (const t of toolPairs) {
      if (!t.output) continue;
      const output = t.output;

      if (t.name === "web_fetch" && output.length > 50) {
        const input = t.input?.url ?? "fetch";
        const title = `Web: ${input}`.slice(0, 60);
        if (!seen.has(title)) {
          seen.add(title);
          findings.push({ title, content: output.slice(0, 500) });
        }
      }

      if (t.name === "execute" && t.input?.command) {
        const cmd = t.input.command;
        if (cmd.startsWith("ls") || cmd.startsWith("pwd") || cmd.startsWith("echo")) continue;
        if (output.length > 30 && !output.includes("error")) {
          const title = `Command: ${cmd.slice(0, 50)}`;
          if (!seen.has(title)) {
            seen.add(title);
            findings.push({ title, content: output.slice(0, 500) });
          }
        }
      }
    }

    return findings.slice(0, 10);
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
