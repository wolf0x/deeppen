import { db } from "../db/index.js";
import { chatSessions, chatMessages } from "../db/schema.js";
import { eq, asc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { ConfigStore } from "./ConfigStore.js";
import { createChatModel } from "./AgentRunner.js";
import type { TaskManager } from "./TaskManager.js";
import { TaskConfigSchema } from "@deeppen/shared";

const SYSTEM_PROMPT = `You are DeepPen's quick task intake. Your job is to understand CTF challenges and create tasks — fast.

## Rules
- NEVER solve the challenge, provide exploits, or give hints.
- NEVER output tool calls, function calls, or </tool_call> tags. You have NO tools.
- Respond ONLY with plain text and the task JSON block below.
- If the user provides enough info, create the task IMMEDIATELY.
- If something critical is missing (no target URL/IP, or unclear category), ask ONE short question.
- Keep responses under 2 sentences when creating a task.

## Task Creation
As soon as you have enough info, output this JSON block on its own line:

{"action":"create_task","name":"<short name>","description":"<everything the user provided — URLs, IPs, ports, challenge text, platform, flag format>","category":"<category>"}

Valid categories: web, pwn, crypto, forensics, misc, prompt-injection

Do NOT wait for user confirmation. Create the task as soon as you can categorize it.`;

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

    // Direct LLM call — fast and reliable
    const response = await model.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ]);

    let responseText = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    // Strip any tool call patterns the model might output (mimo-v2.5-pro quirk)
    responseText = responseText
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
      .replace(/\{[\s]*"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\}/g, "")
      .trim();

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
    const config = TaskConfigSchema.parse({
      name: taskData.name,
      challenge: {
        description: taskData.description,
        category: taskData.category,
      },
      modelId,
      autoSubmit: true,
    });
    const taskId = await this.taskManager.create(config);
    return taskId;
  }
}
