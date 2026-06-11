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
  modelConfigId: string;
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

const LOOP_SYSTEM_PROMPT = `You are DeepPen's Loop Agent — a CTF task optimization expert.

## Your Job
Analyze CTF task execution data, understand what the agent was doing, what went wrong, and provide specific guidance to help it succeed.

## Analysis Steps
1. **Understand the challenge**: Read the challenge description and goal
2. **Review agent activity**: What tools were called? What results were returned?
3. **Identify the problem**: Why did the agent stop/fail/loop?
4. **Provide specific guidance**: Based on the actual execution data, suggest concrete next steps

## Problem Patterns to Detect
- **Loop**: Agent repeating same commands → suggest different approach
- **Wrong tool**: Agent using wrong tool → suggest correct tool
- **Missing step**: Agent skipped a step → point out what's missing
- **Wrong target**: Agent hitting wrong endpoint → suggest correct target
- **Authentication**: Agent failing auth → suggest how to get credentials
- **Dead end**: Agent exhausted current approach → suggest alternative attack vector

## Output
Respond with a JSON array:
[
  {
    "task_id": "...",
    "action": "optimize",
    "reason": "Clear explanation of what went wrong",
    "optimized_context": "Specific, actionable guidance for the next attempt. Include: what to try, what to avoid, specific commands or techniques."
  }
]

## Rules
- Be SPECIFIC — reference actual tool calls and results from the data
- Be ACTIONABLE — provide concrete commands, URLs, techniques
- Be CONCISE — optimized_context should be 2-5 sentences max
- If the agent made good progress but timed out, recommend "retry" with null context
- If the agent is completely stuck, recommend "optimize" with detailed guidance
- If the task has been retried 3+ times with no progress, recommend "skip"`;

export class LoopAgent {
  private config: LoopConfig = {
    enabled: false,
    intervalMinutes: 5,
    maxRetries: 3,
    staleThresholdMinutes: 10,
    autoOptimize: true,
    modelConfigId: "",
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
        .orderBy(desc(streamEvents.timestamp))
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

    // Extract detailed context from events
    const recentToolCalls = events.filter((e: any) => e.type === "tool-call").slice(0, 10);
    const recentResults = events.filter((e: any) => e.type === "tool-result").slice(0, 10);
    const recentResponses = events.filter((e: any) => e.type === "agent-response").slice(0, 3);
    const recentErrors = events.filter((e: any) => {
      if (e.type !== "tool-result") return false;
      try { const d = JSON.parse(e.dataJson); return d.error || (d.toolOutput && d.toolOutput.includes("Error")); } catch { return false; }
    }).slice(0, 5);

    // Build context summary for LLM
    const toolCallsSummary = recentToolCalls.map((e: any) => {
      try {
        const d = JSON.parse(e.dataJson);
        const input = d.toolInput?.command || d.toolInput?.url || JSON.stringify(d.toolInput ?? {}).slice(0, 100);
        return `${d.toolName}: ${input}`;
      } catch { return "unknown"; }
    });

    const resultsSummary = recentResults.map((e: any) => {
      try {
        const d = JSON.parse(e.dataJson);
        return `${d.toolName}: ${(d.toolOutput ?? "").slice(0, 200)}`;
      } catch { return "unknown"; }
    });

    const responsesSummary = recentResponses.map((e: any) => {
      try { return JSON.parse(e.dataJson).content?.slice(0, 300) ?? ""; } catch { return ""; }
    }).filter(Boolean);

    const errorsSummary = recentErrors.map((e: any) => {
      try {
        const d = JSON.parse(e.dataJson);
        return `${d.toolName}: ${(d.toolOutput ?? d.error ?? "").slice(0, 200)}`;
      } catch { return ""; }
    }).filter(Boolean);

    // Detect error patterns
    let errorPattern: string | null = null;
    if (task.error) {
      if (task.error.includes("timeout")) errorPattern = "timeout";
      else if (task.error.includes("UNIQUE constraint")) errorPattern = "db_constraint";
      else errorPattern = "unknown_error";
    } else if (recentErrors.length > 0) {
      errorPattern = "tool_errors";
    }

    // Check for repeated tool calls (potential loop)
    const toolNames = recentToolCalls.map((e: any) => {
      try { return JSON.parse(e.dataJson).toolName; } catch { return ""; }
    });
    const uniqueTools = new Set(toolNames);
    const isLooping = toolNames.length >= 5 && uniqueTools.size <= 2;

    // Check for stale
    const isStale = minutesSinceLastEvent > this.config.staleThresholdMinutes;

    // Determine recommendation
    let recommendation: TaskAnalysis["recommendation"] = "skip";
    let reason = "";

    if (task.status === "running" && isStale) {
      recommendation = "retry";
      reason = `Task stale for ${Math.round(minutesSinceLastEvent)} minutes.`;
    } else if (task.status === "running" && isLooping) {
      recommendation = "optimize";
      reason = `Agent stuck in loop. Tools: ${[...uniqueTools].join(", ")}`;
    } else if (task.status === "stopped" && flagCount > 0) {
      recommendation = "optimize";
      reason = `Partial progress: ${flagCount} flags found.`;
    } else if ((task.status === "error" || task.status === "stopped") && flagCount === 0) {
      recommendation = "retry";
      reason = "No flags found.";
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
      // Extra context for LLM analysis
      _context: {
        challengeDescription: task.challengeDescription,
        toolCalls: toolCallsSummary,
        results: resultsSummary,
        responses: responsesSummary,
        errors: errorsSummary,
        isLooping,
        uniqueTools: [...uniqueTools],
      },
    } as TaskAnalysis;
  }

  private async getDecisions(analyses: TaskAnalysis[]): Promise<TaskAnalysis[]> {
    // Use LLM to analyze failures and generate optimized prompts
    let modelConfig = null;
    if (this.config.modelConfigId) {
      modelConfig = await this.configStore.getModelWithKey(this.config.modelConfigId).catch(() => null);
    }
    if (!modelConfig) {
      modelConfig = await this.configStore.listModels().then(models => models[0]).catch(() => null);
    }
    if (!modelConfig) {
      console.log("[LoopAgent] No model configured, using heuristic decisions");
      return this.getHeuristicDecisions(analyses);
    }

    try {
      const { createChatModel } = await import("./AgentRunner.js");
      const model = createChatModel(modelConfig);

      // Build detailed analysis for LLM
      const analysisSummary = analyses.map(a => {
        const ctx = (a as any)._context;
        let summary = `
## Task: ${a.taskName} (${a.taskId})
- Status: ${a.status}
- Flags found: ${a.flagCount}
- Last activity: ${a.minutesSinceLastEvent} min ago
- Error pattern: ${a.errorPattern ?? "none"}
- Recommendation: ${a.recommendation}
- Reason: ${a.reason}`;

        if (ctx) {
          summary += `\n- Challenge: ${ctx.challengeDescription?.slice(0, 200) ?? "N/A"}`;

          if (ctx.toolCalls?.length > 0) {
            summary += `\n\n### Recent Tool Calls:`;
            ctx.toolCalls.slice(0, 5).forEach((t: string) => { summary += `\n- ${t}`; });
          }

          if (ctx.results?.length > 0) {
            summary += `\n\n### Recent Results:`;
            ctx.results.slice(0, 3).forEach((r: string) => { summary += `\n- ${r.slice(0, 150)}`; });
          }

          if (ctx.responses?.length > 0) {
            summary += `\n\n### Agent Thinking:`;
            ctx.responses.slice(0, 2).forEach((r: string) => { summary += `\n- ${r.slice(0, 200)}`; });
          }

          if (ctx.errors?.length > 0) {
            summary += `\n\n### Errors:`;
            ctx.errors.slice(0, 3).forEach((e: string) => { summary += `\n- ${e.slice(0, 150)}`; });
          }

          if (ctx.isLooping) {
            summary += `\n\n### ⚠️ LOOP DETECTED: Agent repeating: ${ctx.uniqueTools.join(", ")}`;
          }
        }
        return summary;
      }).join("\n\n---\n\n");

      const response = await model.invoke([
        { role: "system", content: LOOP_SYSTEM_PROMPT },
        { role: "user", content: analysisSummary },
      ]);

      const responseText = typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

      const decisions = this.parseDecisions(responseText, analyses);
      if (decisions.length > 0) {
        return decisions;
      }
    } catch (err: any) {
      console.error("[LoopAgent] LLM analysis failed:", err.message);
    }

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
