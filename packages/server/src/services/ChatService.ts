import { db } from "../db/index.js";
import { chatSessions, chatMessages } from "../db/schema.js";
import { eq, asc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { ConfigStore } from "./ConfigStore.js";
import { createChatModel } from "./AgentRunner.js";
import type { TaskManager } from "./TaskManager.js";

const SYSTEM_PROMPT = `You are DeepPen's task intake. Create tasks immediately — do NOT ask questions.

## Rules
- NEVER solve challenges or give hints.
- NEVER ask clarifying questions — just create the task with what you have.
- If user provides a URL → create task immediately, category=web
- If user says "solve this" or "CTF challenge" → create task immediately
- If user provides partial info → create task anyway, include everything they said
- Only ONE exception: if there is literally no target (no URL, no IP, no description) → ask for target

## How to Create a Task
Output this JSON on its own line:

{"action":"create_task","name":"<short descriptive name>","description":"<everything the user said>","category":"<category>"}

Categories: web, pwn, crypto, forensics, misc, prompt-injection

## Examples
User: "solve http://localhost:3001/" → {"action":"create_task","name":"Web Challenge localhost:3001","description":"Target: http://localhost:3001/","category":"web"}

User: "there's a CTF at example.com, web challenge" → {"action":"create_task","name":"CTF Challenge example.com","description":"Target: https://example.com\nType: web challenge","category":"web"}

User: "104 challenges in /path/to/benchmarks" → {"action":"create_task","name":"Multi-Challenge CTF","description":"104 challenges at /path/to/benchmarks. Run make build to start containers, solve each at http://localhost","category":"web"}

User: "crypto challenge, RSA with small e" → {"action":"create_task","name":"RSA Small e Challenge","description":"RSA encryption challenge with small public exponent e","category":"crypto"}

CREATE THE TASK. Do not ask questions.`;

export interface ChatSession {
  id: string;
  modelConfigId: string | null;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
}

export interface TaskCreation {
  id: string;
  name: string;
  description: string;
  category: string;
}

export class ChatService {
  constructor(
    private configStore: ConfigStore,
    private taskManager?: TaskManager,
  ) {}

  // ─── Sessions ──────────────────────────────────────
  async createSession(modelConfigId?: string): Promise<ChatSession> {
    const id = uuid();
    const now = new Date();
    await db.insert(chatSessions).values({
      id,
      modelConfigId: modelConfigId ?? null,
      title: "New Chat",
      createdAt: now,
      updatedAt: now,
    });
    return { id, modelConfigId: modelConfigId ?? null, title: "New Chat", createdAt: now, updatedAt: now };
  }

  async listSessions(): Promise<ChatSession[]> {
    const rows = await db.select().from(chatSessions).orderBy(chatSessions.updatedAt);
    return rows.map((r) => ({
      id: r.id,
      modelConfigId: r.modelConfigId,
      title: r.title ?? "New Chat",
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async getSession(id: string): Promise<ChatSession | null> {
    const rows = await db.select().from(chatSessions).where(eq(chatSessions.id, id));
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      modelConfigId: rows[0].modelConfigId,
      title: rows[0].title ?? "New Chat",
      createdAt: rows[0].createdAt,
      updatedAt: rows[0].updatedAt,
    };
  }

  async updateSessionTitle(id: string, title: string): Promise<void> {
    await db.update(chatSessions).set({ title, updatedAt: new Date() }).where(eq(chatSessions.id, id));
  }

  async deleteSession(id: string): Promise<void> {
    await db.delete(chatMessages).where(eq(chatMessages.sessionId, id));
    await db.delete(chatSessions).where(eq(chatSessions.id, id));
  }

  // ─── Messages ──────────────────────────────────────
  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(asc(chatMessages.createdAt));
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      role: r.role as ChatMessage["role"],
      content: r.content,
      createdAt: r.createdAt,
    }));
  }

  private async saveMessage(sessionId: string, role: ChatMessage["role"], content: string): Promise<ChatMessage> {
    const id = uuid();
    const now = new Date();
    await db.insert(chatMessages).values({ id, sessionId, role, content, createdAt: now });
    await db.update(chatSessions).set({ updatedAt: now }).where(eq(chatSessions.id, sessionId));
    return { id, sessionId, role, content, createdAt: now };
  }

  // ─── Send Message & Get Response ───────────────────
  async sendMessage(
    sessionId: string,
    content: string,
    modelConfigId?: string,
  ): Promise<{ userMessage: ChatMessage; assistantMessage: ChatMessage; taskCreated?: TaskCreation }> {
    // Save user message
    const userMessage = await this.saveMessage(sessionId, "user", content);

    // Resolve model config
    const session = await this.getSession(sessionId);
    const effectiveModelId = modelConfigId ?? session?.modelConfigId;
    if (!effectiveModelId) {
      throw new Error("No model configured. Please select a model first.");
    }

    // Update session model if changed
    if (session && !session.modelConfigId && modelConfigId) {
      await db.update(chatSessions).set({ modelConfigId, updatedAt: new Date() }).where(eq(chatSessions.id, sessionId));
    }

    const modelConfig = await this.configStore.getModelWithKey(effectiveModelId);
    if (!modelConfig) throw new Error("Model not found.");
    if (!modelConfig.apiKey && modelConfig.provider !== "ollama") {
      throw new Error(`API key is missing for ${modelConfig.provider}.`);
    }

    // Build conversation history for the LLM
    const history = await this.getMessages(sessionId);
    const model = createChatModel(modelConfig);

    // Direct LLM call — no tools, no agent, fast response
    const response = await model.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ]);

    const responseText = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    // Save assistant message
    const assistantMessage = await this.saveMessage(sessionId, "assistant", responseText);

    // Auto-generate title from first user message
    if (history.length <= 1) {
      const title = content.length > 50 ? content.slice(0, 50) + "..." : content;
      await this.updateSessionTitle(sessionId, title);
    }

    // Check for task creation JSON
    const taskCreated = this.tryExtractTask(responseText);

    return { userMessage, assistantMessage, taskCreated };
  }

  private tryExtractTask(text: string): TaskCreation | undefined {
    // Find the start of a create_task JSON block by locating the action key
    const actionIdx = text.indexOf('"action"');
    if (actionIdx === -1) return undefined;

    // Walk backwards to find the opening brace of this JSON object
    let start = actionIdx;
    while (start > 0 && text[start] !== "{") start--;
    if (text[start] !== "{") return undefined;

    // Walk braces from the start to find the balanced closing brace
    let depth = 0;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end === -1) return undefined;

    try {
      const data = JSON.parse(text.slice(start, end + 1));
      if (data.action === "create_task" && data.name && data.description && data.category) {
        return { id: "", name: data.name, description: data.description, category: data.category };
      }
    } catch {
      // Not valid JSON, ignore
    }
    return undefined;
  }

  /** Create a task from chat-extracted data. Returns the task ID. */
  async createTaskFromChat(taskData: { name: string; description: string; category: string }, modelId?: string): Promise<string> {
    if (!this.taskManager) throw new Error("TaskManager not available");
    const taskId = await this.taskManager.create({
      name: taskData.name,
      challenge: {
        description: taskData.description,
        category: taskData.category as any,
      },
      modelId: modelId as any,
      autoSubmit: true,
    });
    return taskId;
  }
}
