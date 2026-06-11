import { db } from "../db/index.js";
import { tasks, streamEvents, settings } from "../db/index.js";
import { eq, and, desc } from "drizzle-orm";
import { createChatModel } from "./AgentRunner.js";
import type { ConfigStore } from "./ConfigStore.js";
import type { TaskManager } from "./TaskManager.js";

interface LoopConfig {
  enabled: boolean;
  intervalMinutes: number;
  maxRetries: number;
  staleThresholdMinutes: number;
  autoOptimize: boolean;
}

interface TaskAnalysis {
  taskId: string;
  taskName: string;
  status: string;
  flagCount: number;
  lastEventTime: string | null;
  minutesSinceLastEvent: number;
  errorPattern: string | null;
  recommendation: "retry" | "optimize" | "skip";
  reason: string;
  optimizedContext?: string;
}

const LOOP_SYSTEM_PROMPT = `You are DeepPen's Loop Agent — a task optimization reviewer.

## Your Job
Analyze CTF task execution data and decide how to handle stopped/failed tasks.

## Analysis
For each task, determine:
1. Why did it stop/fail? (timeout, error, no progress)
2. What was accomplished? (flags found, challenges solved)
3. What should happen next? (retry, optimize prompt, skip)

## Output
Respond with a JSON array of decisions:
[
  {
    "task_id": "...",
    "action": "retry",
    "reason": "Task hit time limit but made progress. Simple retry may succeed.",
    "optimized_context": null
  },
  {
    "task_id": "...",
    "action": "optimize",
    "reason": "Agent was stuck on SQL injection. Suggest trying XSS instead.",
    "optimized_context": "Previous attempt failed on SQL injection. Focus on XSS attacks on the search parameter. Try: <script>alert(1)</script>"
  },
  {
    "task_id": "...",
    "action": "skip",
    "reason": "Task has no flags and no progress after 3 attempts.",
    "optimized_context": null
  }
]

## Rules
- Only recommend "optimize" if you can identify a specific improvement
- Only recommend "retry" if the task made some progress
- Recommend "skip" if the task is hopeless (3+ failures, no progress)
- Keep optimized_context concise and actionable`;

export class LoopAgent {
  private config: LoopConfig = {
    enabled: false,
    intervalMinutes: 10,
    maxRetries: 3,
    staleThresholdMinutes: 10,
    autoOptimize: true,
  };
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private lastRun: Date | null = null;
  private runHistory: Array<{ time: Date; analyzed: number; actions: Record<string, number> }> = [];

  constructor(
    private configStore: ConfigStore,
    private taskManager: TaskManager,
  ) {}

  async start(): Promise<void> {
    // Load config from database
    await this.loadConfig();

    if (!this.config.enabled) {
      console.log("[LoopAgent] Disabled");
      return;
    }

    console.log(`[LoopAgent] Starting with ${this.config.intervalMinutes}min interval`);
    this.timer = setInterval(() => this.run(), this.config.intervalMinutes * 60 * 1000);
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

  async updateConfig(update: Partial<LoopConfig>): Promise<LoopConfig> {
    Object.assign(this.config, update);
    // Save to database
    for (const [key, value] of Object.entries(update)) {
      const serialized = JSON.stringify(value);
      await db.insert(settings)
        .values({ key: `loop_${key}`, value: serialized })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: serialized },
        });
    }
    // Restart if enabled changed
    if (update.enabled !== undefined) {
      this.stop();
      if (this.config.enabled) {
        await this.start();
      }
    }
    return { ...this.config };
  }

  getStatus(): { running: boolean; lastRun: Date | null; history: Array<{ time: Date; analyzed: number; actions: Record<string, number> }> } {
    return {
      running: this.isRunning,
      lastRun: this.lastRun,
      history: this.runHistory.slice(-10),
    };
  }

  async run(): Promise<void> {
    if (this.isRunning) {
      console.log("[LoopAgent] Already running, skipping");
      return;
    }

    this.isRunning = true;
    this.lastRun = new Date();
    console.log("[LoopAgent] Starting analysis...");

    try {
      // 1. Find tasks that need attention
      const staleTasks = await this.findStaleTasks();
      const failedTasks = await this.findFailedTasks();

      const tasksToAnalyze = [...staleTasks, ...failedTasks];

      if (tasksToAnalyze.length === 0) {
        console.log("[LoopAgent] No tasks need attention");
        this.recordRun(0, {});
        return;
      }

      console.log(`[LoopAgent] Analyzing ${tasksToAnalyze.length} tasks`);

      // 2. Analyze each task
      const analyses: TaskAnalysis[] = [];
      for (const task of tasksToAnalyze) {
        const analysis = await this.analyzeTask(task);
        analyses.push(analysis);
      }

      // 3. Get LLM decisions (batch)
      const decisions = await this.getDecisions(analyses);

      // 4. Execute decisions
      const actions: Record<string, number> = { retry: 0, optimize: 0, skip: 0 };
      for (const decision of decisions) {
        await this.executeDecision(decision);
        actions[decision.recommendation] = (actions[decision.recommendation] || 0) + 1;
      }

      this.recordRun(analyses.length, actions);
      console.log(`[LoopAgent] Complete: ${JSON.stringify(actions)}`);
    } catch (err: any) {
      console.error("[LoopAgent] Error:", err.message);
    } finally {
      this.isRunning = false;
    }
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

  private async findStaleTasks(): Promise<any[]> {
    const allTasks = await db.select().from(tasks);
    const staleTasks: any[] = [];
    for (const task of allTasks) {
      if (task.status !== "running") continue;
      // Check last event time
      const lastEvent = await db.select().from(streamEvents)
        .where(eq(streamEvents.taskId, task.id))
        .orderBy(streamEvents.timestamp)
        .limit(1);
      if (lastEvent.length > 0) {
        const minutesSince = (Date.now() - lastEvent[0].timestamp) / 60000;
        if (minutesSince >= this.config.staleThresholdMinutes) {
          staleTasks.push(task);
        }
      }
    }
    return staleTasks;
  }

  private async findFailedTasks(): Promise<any[]> {
    const allTasks = await db.select().from(tasks);
    return allTasks.filter((t: any) =>
      t.status === "stopped" || t.status === "error"
    );
  }

  private async analyzeTask(task: any): Promise<TaskAnalysis> {
    // Get recent events
    const events = await db
      .select()
      .from(streamEvents)
      .where(eq(streamEvents.taskId, task.id))
      .orderBy(desc(streamEvents.timestamp))
      .limit(50);

    const flagCount = task.flag ? task.flag.split(",").filter(Boolean).length : 0;
    const lastEvent = events[0];
    const minutesSinceLastEvent = lastEvent
      ? (Date.now() - lastEvent.timestamp) / 60000
      : 999;

    // Detect error patterns from events
    let errorPattern: string | null = null;
    const recentErrors = events
      .filter((e: any) => e.type === "tool-result" && e.dataJson?.includes('"error"'))
      .slice(0, 3);

    if (task.error) {
      if (task.error.includes("timeout")) errorPattern = "timeout";
      else if (task.error.includes("UNIQUE constraint")) errorPattern = "db_constraint";
      else errorPattern = "unknown_error";
    } else if (recentErrors.length > 0) {
      errorPattern = "tool_errors";
    }

    // Check for repeated tool calls (potential loop)
    const recentToolCalls = events
      .filter((e: any) => e.type === "tool-call")
      .slice(0, 10);
    const toolNames = recentToolCalls.map((e: any) => {
      try { return JSON.parse(e.dataJson).toolName; } catch { return ""; }
    });
    const uniqueTools = new Set(toolNames);
    const isLooping = toolNames.length >= 5 && uniqueTools.size <= 2;

    // Check for stale (no events in threshold)
    const isStale = minutesSinceLastEvent > this.config.staleThresholdMinutes;

    // Determine recommendation
    let recommendation: TaskAnalysis["recommendation"] = "skip";
    let reason = "";

    if (task.status === "running" && isStale) {
      recommendation = "retry";
      reason = `Task stale for ${Math.round(minutesSinceLastEvent)} minutes. No recent activity.`;
    } else if (task.status === "running" && isLooping) {
      recommendation = "optimize";
      reason = `Agent appears stuck in a loop. Last 10 tool calls: ${[...uniqueTools].join(", ")}`;
    } else if (task.status === "stopped" && flagCount > 0) {
      recommendation = "optimize";
      reason = `Partial progress: ${flagCount} flags found. May benefit from focused retry.`;
    } else if ((task.status === "error" || task.status === "stopped") && flagCount === 0) {
      recommendation = "retry";
      reason = "No flags found. Simple retry may succeed with different approach.";
    }

    return {
      taskId: task.id,
      taskName: task.name,
      status: task.status,
      flagCount,
      lastEventTime: lastEvent ? new Date(lastEvent.timestamp).toISOString() : null,
      minutesSinceLastEvent: Math.round(minutesSinceLastEvent),
      errorPattern,
      recommendation,
      reason,
    };
  }

  private async getDecisions(analyses: TaskAnalysis[]): Promise<TaskAnalysis[]> {
    // Use LLM to analyze failures and generate optimized prompts
    const modelConfig = await this.configStore.listModels().then(models => models[0]).catch(() => null);
    if (!modelConfig) {
      console.log("[LoopAgent] No model configured, using heuristic decisions");
      return this.getHeuristicDecisions(analyses);
    }

    try {
      const { createChatModel } = await import("./AgentRunner.js");
      const model = createChatModel(modelConfig);

      // Build analysis summary for LLM
      const analysisSummary = analyses.map(a => `
Task: ${a.taskName} (${a.taskId})
Status: ${a.status}
Flags: ${a.flagCount}
Last activity: ${a.minutesSinceLastEvent} min ago
Error: ${a.errorPattern ?? "none"}
Current recommendation: ${a.recommendation}
Reason: ${a.reason}
`).join("\n---\n");

      const prompt = `${LOOP_SYSTEM_PROMPT}

## Tasks to Analyze
${analysisSummary}

Respond with a JSON array of decisions. Each decision must have: task_id, action (retry/optimize/skip), reason, optimized_context (if action=optimize).`;

      const response = await model.invoke([
        { role: "system", content: LOOP_SYSTEM_PROMPT },
        { role: "user", content: analysisSummary },
      ]);

      const responseText = typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

      // Parse LLM response
      const decisions = this.parseDecisions(responseText, analyses);
      if (decisions.length > 0) {
        return decisions;
      }
    } catch (err: any) {
      console.error("[LoopAgent] LLM analysis failed:", err.message);
    }

    // Fallback to heuristic decisions
    return this.getHeuristicDecisions(analyses);
  }

  private getHeuristicDecisions(analyses: TaskAnalysis[]): TaskAnalysis[] {
    return analyses.map(analysis => {
      if (analysis.recommendation === "optimize" && this.config.autoOptimize) {
        analysis.optimizedContext = this.generateOptimizedContext(analysis);
      }
      return analysis;
    });
  }

  private parseDecisions(responseText: string, analyses: TaskAnalysis[]): TaskAnalysis[] {
    try {
      // Extract JSON array from response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const decisions = JSON.parse(jsonMatch[0]);
      return analyses.map(analysis => {
        const decision = decisions.find((d: any) => d.task_id === analysis.taskId);
        if (decision) {
          return {
            ...analysis,
            recommendation: decision.action ?? analysis.recommendation,
            reason: decision.reason ?? analysis.reason,
            optimizedContext: decision.optimized_context ?? undefined,
          };
        }
        return analysis;
      });
    } catch {
      return [];
    }
  }

  private generateOptimizedContext(analysis: TaskAnalysis): string {
    let context = `## Previous Attempt Summary\n`;
    context += `- Status: ${analysis.status}\n`;
    context += `- Flags found: ${analysis.flagCount}\n`;
    context += `- Time elapsed: ${analysis.minutesSinceLastEvent} minutes\n`;

    if (analysis.errorPattern === "timeout") {
      context += `\n## Optimization\n`;
      context += `- Previous attempt timed out. Focus on high-value targets.\n`;
      context += `- Skip low-difficulty challenges, focus on medium/high difficulty.\n`;
    }

    if (analysis.flagCount > 0) {
      context += `\n## Continue From\n`;
      context += `- Already solved ${analysis.flagCount} challenges.\n`;
      context += `- Focus on unsolved challenges only.\n`;
    }

    return context;
  }

  private async executeDecision(analysis: TaskAnalysis): Promise<void> {
    const { taskId, recommendation, optimizedContext } = analysis;

    // For stale running tasks, stop them first before retry
    if (analysis.status === "running" && (recommendation === "retry" || recommendation === "optimize")) {
      try {
        await this.taskManager.stop(taskId);
      } catch {
        // Already stopped
      }
    }

    switch (recommendation) {
      case "retry":
        console.log(`[LoopAgent] Retrying task ${taskId}: ${analysis.reason}`);
        try {
          await this.taskManager.retry(taskId);
        } catch (err: any) {
          console.error(`[LoopAgent] Retry failed: ${err.message}`);
        }
        break;

      case "optimize":
        console.log(`[LoopAgent] Optimizing task ${taskId}: ${analysis.reason}`);
        if (optimizedContext) {
          await this.taskManager.updateUserContext(taskId, optimizedContext);
        }
        try {
          await this.taskManager.retry(taskId);
        } catch (err: any) {
          console.error(`[LoopAgent] Optimize retry failed: ${err.message}`);
        }
        break;

      case "skip":
        console.log(`[LoopAgent] Skipping task ${taskId}: ${analysis.reason}`);
        break;
    }
  }

  private recordRun(analyzed: number, actions: Record<string, number>): void {
    this.runHistory.push({
      time: new Date(),
      analyzed,
      actions,
    });
    // Keep only last 20 runs
    if (this.runHistory.length > 20) {
      this.runHistory = this.runHistory.slice(-20);
    }
  }
}
