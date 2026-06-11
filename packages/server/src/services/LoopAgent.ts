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
    const rows = await db.select().from(settings).where(
      eq(settings.key, "loop_enabled")
    );
    const configMap = new Map<string, any>();
    for (const row of rows) {
      try {
        configMap.set(row.key, JSON.parse(row.value));
      } catch {
        configMap.set(row.key, row.value);
      }
    }
    // Load all loop settings
    const allSettings = await db.select().from(settings);
    for (const row of allSettings) {
      if (row.key.startsWith("loop_")) {
        const key = row.key.replace("loop_", "");
        try {
          (this.config as any)[key] = JSON.parse(row.value);
        } catch {
          (this.config as any)[key] = row.value;
        }
      }
    }
  }

  private async findStaleTasks(): Promise<any[]> {
    const threshold = Date.now() - this.config.staleThresholdMinutes * 60 * 1000;
    const allTasks = await db.select().from(tasks);
    return allTasks.filter((t: any) => {
      if (t.status !== "running") return false;
      // Check if last event is older than threshold
      return true; // Will be filtered by event analysis
    });
  }

  private async findFailedTasks(): Promise<any[]> {
    return db.select().from(tasks).where(
      and(
        eq(tasks.status, "stopped"),
        // Only tasks with some flags (partial progress)
      )
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

    // Detect error patterns
    let errorPattern: string | null = null;
    if (task.error) {
      if (task.error.includes("timeout")) errorPattern = "timeout";
      else if (task.error.includes("UNIQUE constraint")) errorPattern = "db_constraint";
      else errorPattern = "unknown_error";
    }

    // Check for stale (no events in threshold)
    const isStale = minutesSinceLastEvent > this.config.staleThresholdMinutes;

    // Determine recommendation
    let recommendation: TaskAnalysis["recommendation"] = "skip";
    let reason = "";

    if (task.status === "running" && isStale) {
      recommendation = "retry";
      reason = `Task stale for ${Math.round(minutesSinceLastEvent)} minutes. No recent activity.`;
    } else if (task.status === "stopped" && flagCount > 0) {
      recommendation = "optimize";
      reason = `Partial progress: ${flagCount} flags found. May benefit from focused retry.`;
    } else if (task.status === "failed" && flagCount === 0) {
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
    // For now, use simple heuristic decisions
    // TODO: Use LLM for more sophisticated analysis
    return analyses.map(analysis => {
      if (analysis.recommendation === "optimize" && this.config.autoOptimize) {
        // Generate optimized context based on analysis
        analysis.optimizedContext = this.generateOptimizedContext(analysis);
      }
      return analysis;
    });
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
          // Inject optimized context
          await this.taskManager.updateUserContext(taskId, optimizedContext);
        }
        // Then retry
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
