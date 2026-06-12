import { db, sqlite } from "../db/index.js";
import { tasks, streamEvents, settings, loopSessions, loopIterations, guidanceStore } from "../db/index.js";
import { eq, desc, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { createChatModel } from "./AgentRunner.js";
import type { ConfigStore } from "./ConfigStore.js";
import type { TaskManager } from "./TaskManager.js";
import type { GuidanceStore } from "./GuidanceStore.js";

interface LoopConfig {
  enabled: boolean;
  intervalMinutes: number;
  maxIterations: number;
  convergenceThreshold: number;
  staleThresholdMinutes: number;
  modelConfigId: string;
}

interface TaskState {
  taskId: string;
  taskName: string;
  status: string;
  flagCount: number;
  flags: string[];
  recentToolCalls: string[];
  recentResults: string[];
  recentThinking: string[];
  errors: string[];
  minutesSinceLastEvent: number;
  isLooping: boolean;
  challengeDescription: string;
}

interface LoopDecision {
  assessment: string;
  progress: string;
  direction: "correct" | "wrong" | "stuck" | "unknown";
  action: "none" | "guide" | "redirect" | "stop";
  guidance: string;
  reason: string;
}

const LOOP_SYSTEM_PROMPT = `You are DeepPen's Loop Agent — an autonomous task optimizer.

## Your Role
You are NOT solving the CTF challenge. You are ensuring the main agent stays on track and converges toward the goal.

## Your Job
1. **Assess**: Compare the goal with current progress
2. **Judge**: Is the agent moving in the right direction?
3. **Guide**: If stuck or off-track, provide specific guidance
4. **Verify**: On next iteration, check if your guidance helped

## Decision Rules
- **Direction correct + progressing** → action: "none" (let agent work)
- **Direction correct but stuck** → action: "guide" (provide specific hints)
- **Direction wrong** → action: "redirect" (suggest new approach)
- **Repeated failures** → action: "stop" (don't waste resources)

## When Agent is Stuck
If the agent seems stuck or is trying random approaches, suggest reading a skill:
- "Read /skills/ctf-web/SKILL.md for web exploitation methodology"
- "Read /skills/ctf-pwn/SKILL.md for binary exploitation techniques"
Skills contain proven step-by-step methodologies that can unblock the agent.

## Output Format (JSON only)
{
  "assessment": "Agent is [doing X]. [Observation about progress].",
  "progress": "[N/M] challenges solved, [K] flags found",
  "direction": "correct|wrong|stuck|unknown",
  "action": "none|guide|redirect|stop",
  "guidance": "Specific, actionable guidance (only if action != none). Include: what to try, what to avoid. If stuck, suggest reading a relevant SKILL.md.",
  "reason": "Why this decision"
}`;

export class LoopAgent {
  private config: LoopConfig = {
    enabled: false,
    intervalMinutes: 5,
    maxIterations: 20,
    convergenceThreshold: 3,
    staleThresholdMinutes: 10,
    modelConfigId: "",
  };
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private runHistory: Array<{ time: Date; analyzed: number; actions: Record<string, number> }> = [];

  constructor(
    private configStore: ConfigStore,
    private taskManager: TaskManager,
    private guidanceStore: GuidanceStore,
  ) {}

  async start(): Promise<void> {
    await this.loadConfig();
    if (!this.config.enabled) {
      console.log("[LoopAgent] Disabled");
      return;
    }
    console.log(`[LoopAgent] Starting with ${this.config.intervalMinutes}min interval`);
    this.timer = setInterval(() => this.run().catch(console.error), this.config.intervalMinutes * 60 * 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log("[LoopAgent] Stopped");
  }

  async getConfig(): Promise<LoopConfig> {
    await this.loadConfig();
    return { ...this.config };
  }

  getStatus(): { running: boolean; lastRun: Date | null; history: Array<{ time: Date; analyzed: number; actions: Record<string, number> }> } {
    return {
      running: this.isRunning,
      lastRun: this.runHistory.length > 0 ? this.runHistory[this.runHistory.length - 1].time : null,
      history: this.runHistory.slice(-10),
    };
  }

  async updateConfig(update: Partial<LoopConfig>): Promise<LoopConfig> {
    Object.assign(this.config, update);
    for (const [key, value] of Object.entries(update)) {
      if (key in this.config) {
        await db.insert(settings)
          .values({ key: `loop_${key}`, value: JSON.stringify(value) })
          .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value) } });
      }
    }
    if (update.enabled !== undefined) {
      this.stop();
      if (this.config.enabled) await this.start();
    }
    return { ...this.config };
  }

  async run(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      // Step 1: Find active tasks
      const activeTasks = await this.findActiveTasks();
      if (activeTasks.length === 0) {
        console.log("[LoopAgent] No active tasks");
        this.recordRun(0, {});
        return;
      }

      console.log(`[LoopAgent] Analyzing ${activeTasks.length} tasks`);

      // Step 2: Process each task
      const actions: Record<string, number> = { none: 0, guide: 0, redirect: 0, stop: 0 };
      for (const task of activeTasks) {
        const action = await this.processTask(task);
        if (action) actions[action] = (actions[action] || 0) + 1;
      }

      this.recordRun(activeTasks.length, actions);
    } catch (err: any) {
      console.error("[LoopAgent] Error:", err.message);
    } finally {
      this.isRunning = false;
    }
  }

  private recordRun(analyzed: number, actions: Record<string, number>): void {
    this.runHistory.push({ time: new Date(), analyzed, actions });
    if (this.runHistory.length > 20) {
      this.runHistory = this.runHistory.slice(-20);
    }
  }

  private async findActiveTasks(): Promise<any[]> {
    const allTasks = await db.select().from(tasks);
    return allTasks.filter((t: any) =>
      t.status === "running" || t.status === "stopped" || t.status === "error"
    );
  }

  private async processTask(task: any): Promise<string | null> {
    const taskId = task.id;

    // Step 1: Read current state
    const state = await this.readTaskState(task);
    if (!state) return null;

    // Step 2: Get or create loop session
    let session = await this.getLoopSession(taskId);
    if (!session) {
      session = await this.createLoopSession(taskId, task.challengeDescription);
    }

    // Step 3: Check convergence
    const convergence = await this.checkConvergence(session, state);
    if (convergence === "completed") {
      console.log(`[LoopAgent] Task ${taskId} converged — goal achieved`);
      await this.updateSessionStatus(session.id, "completed");
      return null;
    }
    if (convergence === "stalled") {
      console.log(`[LoopAgent] Task ${taskId} stalled — no progress after ${this.config.convergenceThreshold} iterations`);
      await this.updateSessionStatus(session.id, "stopped");
      return null;
    }

    // Step 4: Get previous iteration result
    const lastIteration = await this.getLastIteration(session.id);

    // Step 5: LLM analysis and decision
    const decision = await this.analyzeAndDecide(session, state, lastIteration);

    // Step 6: Execute decision
    await this.executeDecision(session, state, decision);

    return decision.action;
  }

  private async readTaskState(task: any): Promise<TaskState | null> {
    const events = await db.select().from(streamEvents)
      .where(eq(streamEvents.taskId, task.id))
      .orderBy(desc(streamEvents.timestamp))
      .limit(50);

    if (events.length === 0) return null;

    const flagCount = task.flag ? task.flag.split(",").filter(Boolean).length : 0;
    const flags = task.flag ? task.flag.split(",").filter(Boolean) : [];
    const lastEvent = events[0];
    const minutesSince = (Date.now() - lastEvent.timestamp) / 60000;

    const toolCalls = events.filter((e: any) => e.type === "tool-call")
      .map((e: any) => { try { return JSON.parse(e.dataJson).toolName; } catch { return ""; } })
      .filter(Boolean);
    const uniqueTools = new Set(toolCalls);

    return {
      taskId: task.id,
      taskName: task.name,
      status: task.status,
      flagCount,
      flags,
      recentToolCalls: toolCalls.slice(0, 10),
      recentResults: events.filter((e: any) => e.type === "tool-result")
        .slice(0, 5)
        .map((e: any) => { try { return (JSON.parse(e.dataJson).toolOutput ?? "").slice(0, 200); } catch { return ""; } }),
      recentThinking: events.filter((e: any) => e.type === "agent-response")
        .slice(0, 3)
        .map((e: any) => { try { return (JSON.parse(e.dataJson).content ?? "").slice(0, 300); } catch { return ""; } }),
      errors: events.filter((e: any) => e.type === "tool-result" && (e.dataJson ?? "").includes('"error"'))
        .slice(0, 3)
        .map((e: any) => { try { return (JSON.parse(e.dataJson).toolOutput ?? "").slice(0, 200); } catch { return ""; } }),
      minutesSinceLastEvent: Math.round(minutesSince),
      isLooping: toolCalls.length >= 5 && uniqueTools.size <= 2,
      challengeDescription: task.challengeDescription ?? "",
    };
  }

  private async getLoopSession(taskId: string): Promise<any | null> {
    const rows = await db.select().from(loopSessions)
      .where(and(eq(loopSessions.taskId, taskId), eq(loopSessions.status, "active")));
    return rows[0] ?? null;
  }

  private async createLoopSession(taskId: string, goal: string): Promise<any> {
    const id = uuid();
    const now = new Date();
    await db.insert(loopSessions).values({
      id,
      taskId,
      goal: goal.slice(0, 500),
      status: "active",
      convergenceScore: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { id, taskId, goal, status: "active", convergenceScore: 0 };
  }

  private async updateSessionStatus(sessionId: string, status: string): Promise<void> {
    await db.update(loopSessions)
      .set({ status, updatedAt: new Date() })
      .where(eq(loopSessions.id, sessionId));
  }

  private async getLastIteration(sessionId: string): Promise<any | null> {
    const rows = await db.select().from(loopIterations)
      .where(eq(loopIterations.sessionId, sessionId))
      .orderBy(desc(loopIterations.iterationNum))
      .limit(1);
    return rows[0] ?? null;
  }

  private async checkConvergence(session: any, state: TaskState): Promise<"active" | "completed" | "stalled"> {
    // Get all iterations for this session
    const iterations = await db.select().from(loopIterations)
      .where(eq(loopIterations.sessionId, session.id))
      .orderBy(desc(loopIterations.iterationNum));

    // Check if goal is achieved (based on flag count vs expected)
    if (state.flagCount > 0 && state.status === "completed") {
      return "completed";
    }

    // Check if stalled (no progress after N iterations)
    if (iterations.length >= this.config.convergenceThreshold) {
      const recentFlags = iterations.slice(0, this.config.convergenceThreshold)
        .map((i: any) => { try { return JSON.parse(i.stateJson ?? "{}").flagCount; } catch { return 0; } });
      const allSame = recentFlags.every((f: number) => f === state.flagCount);
      if (allSame && state.flagCount > 0) {
        return "stalled";
      }
    }

    return "active";
  }

  private async analyzeAndDecide(session: any, state: TaskState, lastIteration: any): Promise<LoopDecision> {
    // Get model for LLM analysis
    let modelConfig = null;
    if (this.config.modelConfigId) {
      modelConfig = await this.configStore.getModelWithKey(this.config.modelConfigId).catch(() => null);
    }
    if (!modelConfig) {
      modelConfig = await this.configStore.listModels().then(m => m[0]).catch(() => null);
    }
    if (!modelConfig) {
      return { assessment: "No model configured", progress: "", direction: "unknown", action: "none", guidance: "", reason: "No model" };
    }

    try {
      const model = createChatModel(modelConfig);

      const iterationNum = lastIteration ? (lastIteration.iterationNum ?? 0) + 1 : 1;

      // Build context for LLM
      const context = `
## Goal
${session.goal}

## Current State
- Status: ${state.status}
- Flags found: ${state.flagCount} (${state.flags.join(", ")})
- Minutes since last activity: ${state.minutesSinceLastEvent}
- Looping: ${state.isLooping ? "YES" : "no"}

## Expected Methodology
The agent should follow the CTF skill methodology:
1. Reconnaissance: Map the application, identify inputs, check robots.txt/sitemap
2. Analysis: Test for SQL injection, XSS, SSRF, auth bypass, IDOR
3. Exploitation: Use discovered vulnerabilities
4. Flag Extraction: Search for flag patterns

## Recent Tool Calls
${state.recentToolCalls.map(t => "- " + t).join("\n")}

## Recent Thinking
${state.recentThinking.map(t => "- " + t.slice(0, 200)).join("\n")}

## Recent Results
${state.recentResults.map(r => "- " + r.slice(0, 150)).join("\n")}

## Errors
${state.errors.length > 0 ? state.errors.map(e => "- " + e.slice(0, 150)).join("\n") : "None"}

## Previous Iteration
${lastIteration ? `Decision: ${lastIteration.decision}\nGuidance: ${lastIteration.guidance}\nResult: ${lastIteration.result ?? "pending"}` : "First iteration"}
`;

      const response = await model.invoke([
        { role: "system", content: LOOP_SYSTEM_PROMPT },
        { role: "user", content: context },
      ]);

      const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      return this.parseDecision(text, iterationNum);
    } catch (err: any) {
      console.error("[LoopAgent] LLM error:", err.message);
      return { assessment: "LLM error", progress: "", direction: "unknown", action: "none", guidance: "", reason: err.message };
    }
  }

  private parseDecision(text: string, iterationNum: number): LoopDecision {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          assessment: parsed.assessment ?? "",
          progress: parsed.progress ?? "",
          direction: parsed.direction ?? "unknown",
          action: parsed.action ?? "none",
          guidance: parsed.guidance ?? "",
          reason: parsed.reason ?? "",
        };
      }
    } catch {}
    return { assessment: text.slice(0, 200), progress: "", direction: "unknown", action: "none", guidance: "", reason: "Parse failed" };
  }

  private async executeDecision(session: any, state: TaskState, decision: LoopDecision): Promise<void> {
    const iterationNum = (await this.getLastIteration(session.id))?.iterationNum ?? 0 + 1;

    console.log(`[LoopAgent] Task ${state.taskId}: ${decision.direction} → ${decision.action}`);

    // Record iteration
    await db.insert(loopIterations).values({
      id: uuid(),
      sessionId: session.id,
      iterationNum,
      stateJson: JSON.stringify({
        flagCount: state.flagCount,
        status: state.status,
        toolCalls: state.recentToolCalls.slice(0, 5),
      }),
      decision: decision.direction,
      action: decision.action,
      guidance: decision.guidance,
      result: null, // filled in next iteration
      createdAt: new Date(),
    });

    // Update session
    await db.update(loopSessions).set({
      currentStrategy: decision.direction,
      convergenceScore: this.calculateConvergence(decision, state),
      updatedAt: new Date(),
    }).where(eq(loopSessions.id, session.id));

    // Execute action
    switch (decision.action) {
      case "guide":
      case "redirect":
        if (decision.guidance) {
          console.log(`[LoopAgent] Injecting guidance: ${decision.guidance.slice(0, 100)}...`);
          await this.guidanceStore.set(state.taskId, decision.guidance, iterationNum);
        }
        break;
      case "stop":
        console.log(`[LoopAgent] Stopping task: ${decision.reason}`);
        try {
          await this.taskManager.stop(state.taskId);
        } catch {}
        break;
      case "none":
        console.log(`[LoopAgent] No action needed: ${decision.assessment}`);
        break;
    }
  }

  private calculateConvergence(decision: LoopDecision, state: TaskState): number {
    let score = 0;
    if (state.flagCount > 0) score += 30;
    if (decision.direction === "correct") score += 40;
    if (decision.direction === "stuck") score += 10;
    if (decision.action === "none") score += 20;
    return Math.min(100, score);
  }

  private async loadConfig(): Promise<void> {
    const allSettings = await db.select().from(settings);
    const knownKeys = new Set(Object.keys(this.config));
    for (const row of allSettings) {
      if (row.key.startsWith("loop_")) {
        const key = row.key.replace("loop_", "");
        if (knownKeys.has(key)) {
          try {
            (this.config as any)[key] = JSON.parse(row.value);
          } catch {
            (this.config as any)[key] = row.value;
          }
        }
      }
    }
  }
}
