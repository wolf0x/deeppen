import { EventEmitter } from "node:events";
import { v4 as uuid } from "uuid";
import { db, sqlite } from "../db/index.js";
import { tasks, streamEvents } from "../db/index.js";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { TaskConfig, TaskStatus, StreamEvent } from "@deeppen/shared";
import { isValidFlag } from "@deeppen/shared";
import { runCTFAgent } from "./AgentRunner.js";
import { ConfigStore } from "./ConfigStore.js";
import { ContainerManager } from "./ContainerManager.js";

export class TaskManager extends EventEmitter {
  private abortControllers = new Map<string, AbortController>();
  private configStore = new ConfigStore();
  private containerManager = new ContainerManager();

  constructor() {
    super();
    this.recoverOrphanedRunningTasks();
  }

  /**
   * Create a new task from config.
   */
  async create(config: TaskConfig): Promise<string> {
    const id = uuid();
    const now = new Date();

    await db.insert(tasks).values({
      id,
      name: config.name,
      status: "created",
      category: config.challenge.category,
      challengeDescription: config.challenge.description,
      platform: config.challenge.platform ?? null,
      challengeId: config.challenge.challengeId ?? null,
      attachmentsJson: config.challenge.attachments
        ? JSON.stringify(config.challenge.attachments)
        : null,
      modelConfigId: config.modelId,
      subagentsJson: config.subagentIds
        ? JSON.stringify(config.subagentIds)
        : null,
      skillsJson: config.skills ? JSON.stringify(config.skills) : null,
      connectorId: config.connectorId ?? null,
      rabbitHoleConfigJson: config.rabbitHole
        ? JSON.stringify(config.rabbitHole)
        : null,
      autoSubmit: config.autoSubmit ?? true,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  }

  /**
   * Start a task — spawns the agent and begins solving.
   */
  async start(taskId: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    // Only allow starting from created or paused state
    if (task.status !== "created" && task.status !== "paused" && task.status !== "stopped") {
      throw new Error(`Task ${taskId} cannot be started from status '${task.status}'`);
    }

    // Resolve model: use task's configured model, or fall back to first available
    let modelConfig = task.modelConfigId
      ? await this.configStore.getModelWithKey(task.modelConfigId)
      : null;
    if (!modelConfig) {
      const allModels = await this.configStore.listModels();
      if (allModels.length === 0)
        throw new Error("No model configured. Please add a model config first.");
      modelConfig = await this.configStore.getModelWithKey(allModels[0].id);
      if (!modelConfig)
        throw new Error("Could not load any model config");
      // Persist the resolved model on the task so it's consistent on resume
      await db.update(tasks).set({ modelConfigId: allModels[0].id }).where(eq(tasks.id, taskId));
    }

    // Atomic status transition — prevents double-start race
    const startedAt = new Date();
    const startableStatuses: TaskStatus[] = ["created", "paused", "stopped"];
    const result = db
      .update(tasks)
      .set({
        status: "running",
        startedAt,
        completedAt: null,
        elapsedMs: null,
        error: null,
        updatedAt: startedAt,
      })
      .where(and(eq(tasks.id, taskId), inArray(tasks.status, startableStatuses)))
      .run();

    if (result.changes === 0) {
      throw new Error(`Task ${taskId} could not be started (concurrent modification)`);
    }

    const abortController = new AbortController();
    this.abortControllers.set(taskId, abortController);

    this.emitStreamEvent(taskId, {
      id: uuid(),
      parentId: null,
      type: "agent-start",
      timestamp: Date.now(),
      data: {},
      status: "complete",
      depth: 0,
    });

    // Run agent in background
    this.runAgentBackground(
      taskId,
      { ...task, status: "running", startedAt, completedAt: null, elapsedMs: null, error: null },
      modelConfig,
      abortController.signal,
    )
      .catch((err) => {
        this.handleTaskError(taskId, err);
      });
  }

  /**
   * Pause a running task.
   */
  async pause(taskId: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task || task.status !== "running")
      throw new Error(`Task ${taskId} is not running`);

    const controller = this.abortControllers.get(taskId);
    controller?.abort();
    this.abortControllers.delete(taskId);

    await db
      .update(tasks)
      .set({ status: "paused", updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    this.emit("task-paused", taskId);
  }

  /**
   * Resume a paused task.
   */
  async resume(taskId: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task || task.status !== "paused")
      throw new Error(`Task ${taskId} is not paused`);

    await this.start(taskId);
  }

  /**
   * Retry a failed/stopped task — resets to created state and starts again.
   */
  async retry(taskId: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.status !== "failed" && task.status !== "stopped" && task.status !== "completed") {
      throw new Error(`Task ${taskId} cannot be retried from status '${task.status}'`);
    }

    // Reset task to created state, clear previous run data
    await db
      .update(tasks)
      .set({
        status: "created",
        flag: null,
        flagAccepted: null,
        error: null,
        startedAt: null,
        completedAt: null,
        elapsedMs: null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    // Clear old stream events for a fresh start
    await db.delete(streamEvents).where(eq(streamEvents.taskId, taskId));

    // Auto-start
    await this.start(taskId);
  }

  /**
   * Stop a task permanently.
   */
  async stop(taskId: string): Promise<void> {
    const controller = this.abortControllers.get(taskId);
    controller?.abort();
    this.abortControllers.delete(taskId);

    const task = await this.getTask(taskId);
    const elapsedMs = task?.startedAt
      ? Date.now() - task.startedAt.getTime()
      : 0;

    await db
      .update(tasks)
      .set({
        status: "stopped",
        completedAt: new Date(),
        elapsedMs,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    this.emit("task-stopped", taskId);
  }

  /**
   * Get a task by ID.
   */
  async getTask(taskId: string): Promise<any | null> {
    const rows = await db.select().from(tasks).where(eq(tasks.id, taskId));
    return rows[0] ?? null;
  }

  /**
   * List all tasks.
   */
  async listTasks(): Promise<any[]> {
    return db.select().from(tasks).orderBy(desc(tasks.createdAt));
  }

  /**
   * Update user context for a task (background info, hints, etc.)
   */
  async updateUserContext(taskId: string, context: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    await db.update(tasks).set({ userContext: context, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  }

  /**
   * Get stream events for a task.
   */
  async getStreamEvents(taskId: string): Promise<StreamEvent[]> {
    const rows = await db
      .select()
      .from(streamEvents)
      .where(eq(streamEvents.taskId, taskId));
    return rows.map((row: any) => ({
      id: row.id,
      parentId: row.parentId,
      type: row.type as StreamEvent["type"],
      timestamp: row.timestamp,
      data: row.dataJson ? JSON.parse(row.dataJson) : {},
      status: row.status as StreamEvent["status"],
      depth: row.depth,
    }));
  }

  // ─── Private ───────────────────────────────────────
  private async runAgentBackground(
    taskId: string,
    task: any,
    modelConfig: any,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      // Ensure container is running (fall back to local if Docker unavailable)
      let useContainer = false;
      if (this.containerManager) {
        try {
          const status = await this.containerManager.getStatus();
          if (!status.running) {
            this.emitStreamEvent(taskId, {
              id: uuid(),
              parentId: null,
              type: "agent-think",
              timestamp: Date.now(),
              data: { content: "Starting CTF tools container..." },
              status: "complete",
              depth: 1,
            });
            await this.containerManager.start();
          }
          useContainer = true;
        } catch (err: any) {
          this.emitStreamEvent(taskId, {
            id: uuid(),
            parentId: null,
            type: "agent-think",
            timestamp: Date.now(),
            data: { content: `Docker unavailable (${err.code ?? err.message}), using local execution` },
            status: "complete",
            depth: 1,
          });
        }
      }

      const rabbitHole = task.rabbitHoleConfigJson
        ? JSON.parse(task.rabbitHoleConfigJson)
        : undefined;
      const skills = task.skillsJson
        ? JSON.parse(task.skillsJson)
        : undefined;
      const attachments = task.attachmentsJson
        ? JSON.parse(task.attachmentsJson)
        : undefined;

      // Download attachments to container workspace if Docker is available
      if (attachments && attachments.length > 0 && useContainer && this.containerManager) {
        for (const url of attachments) {
          try {
            const filename = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "attachment";
            const outputPath = `/workspace/attachments/${filename}`;
            const result = await this.containerManager.execute(
              `mkdir -p /workspace/attachments && curl -fsSL ${JSON.stringify(url)} -o ${JSON.stringify(outputPath)}`,
            );
            if (result.exitCode !== 0) {
              this.emitStreamEvent(taskId, {
                id: uuid(),
                parentId: null,
                type: "agent-think",
                timestamp: Date.now(),
                data: { content: `Attachment download failed for ${url}: ${result.stderr || result.stdout}` },
                status: "complete",
                depth: 1,
              });
            }
          } catch (err: any) {
            this.emitStreamEvent(taskId, {
              id: uuid(),
              parentId: null,
              type: "agent-think",
              timestamp: Date.now(),
              data: { content: `Attachment download skipped for ${url}: ${err.message}` },
              status: "complete",
              depth: 1,
            });
          }
        }
      }

      // Include user context in challenge description if provided
      let challenge = task.challengeDescription || "";
      if (task.userContext) {
        challenge += `\n\n## User-Provided Context\n${task.userContext}`;
      }

      const result = await runCTFAgent({
        modelConfig,
        challenge,
        category: task.category,
        skills,
        attachments,
        containerManager: useContainer ? this.containerManager : undefined,
        rabbitHole,
        abortSignal: signal,
        onStreamEvent: (event) => this.emitStreamEvent(taskId, event),
        onFlagFound: (flag) => this.handleFlagFound(taskId, flag),
      });

      const finalTask = await this.getTask(taskId);
      const elapsedMs = finalTask?.startedAt
        ? Date.now() - finalTask.startedAt.getTime()
        : 0;

      // Get actual flags from DB (validated by isValidFlag)
      const finalFlags = finalTask?.flag ? finalTask.flag.split(",").filter(Boolean) : [];
      const actualFlagCount = finalFlags.length;

      // Check if agent hit time/iteration limits (rabbit hole escape)
      const hitLimit = result.messages.some((m: any) =>
        typeof m.content === "string" && (
          m.content.includes("TIME LIMIT REACHED") ||
          m.content.includes("RABBIT HOLE ALERT") ||
          m.content.includes("ESCALATION:")
        )
      );

      // Check if agent explicitly confirmed all challenges solved
      const agentConfirmedComplete = result.messages.some((m: any) =>
        typeof m.content === "string" && m.content.includes("ALL_CHALLENGES_SOLVED")
      );

      // Determine final status:
      // 1. Time/iteration limit hit → stopped (regardless of flags)
      // 2. Agent confirmed ALL_CHALLENGES_SOLVED + has flags → completed
      // 3. Has flags but no confirmation → stopped (partial, can retry)
      // 4. No flags → failed
      let status: TaskStatus;
      let eventMsg: string;
      if (hitLimit) {
        status = "stopped";
        eventMsg = `Limit reached. ${actualFlagCount} flag(s) found: ${finalFlags.join(", ")}`;
      } else if (agentConfirmedComplete && actualFlagCount > 0) {
        status = "completed";
        eventMsg = `All challenges solved! ${actualFlagCount} flag(s): ${finalFlags.join(", ")}`;
      } else if (actualFlagCount > 0) {
        status = "stopped";
        eventMsg = `Agent stopped. ${actualFlagCount} flag(s) found: ${finalFlags.join(", ")}`;
      } else {
        status = "failed";
        eventMsg = "No flags found";
      }

      await db
        .update(tasks)
        .set({ status, completedAt: new Date(), elapsedMs, updatedAt: new Date() })
        .where(eq(tasks.id, taskId));

      this.emitStreamEvent(taskId, {
        id: uuid(),
        parentId: null,
        type: status === "completed" ? "task-complete" : "task-error",
        timestamp: Date.now(),
        data: { content: eventMsg },
        status: "complete",
        depth: 0,
      });

      if (status === "completed") {
        this.emit("task-complete", taskId, finalFlags[0]);
      } else {
        this.emit("task-error", taskId, new Error(eventMsg));
      }
    } catch (err: any) {
      if (signal.aborted) return;
      this.handleTaskError(taskId, err);
    } finally {
      this.abortControllers.delete(taskId);
    }
  }

  private async handleTaskError(
    taskId: string,
    err: Error,
  ): Promise<void> {
    const task = await this.getTask(taskId);
    const completedAt = new Date();
    const elapsedMs = task?.startedAt
      ? completedAt.getTime() - task.startedAt.getTime()
      : 0;

    await db
      .update(tasks)
      .set({
        status: "stopped",
        error: err.message,
        completedAt,
        elapsedMs,
        updatedAt: completedAt,
      })
      .where(eq(tasks.id, taskId));

    this.emitStreamEvent(taskId, {
      id: uuid(),
      parentId: null,
      type: "task-error",
      timestamp: Date.now(),
      data: { error: err.message },
      status: "error",
      depth: 0,
    });

    this.emit("task-error", taskId, err);
  }

  private async handleFlagFound(
    taskId: string,
    flag: string,
  ): Promise<void> {
    // Validate flag — reject garbage/code
    if (!isValidFlag(flag)) return;

    // Append flag to existing flags (multi-flag support)
    const task = await this.getTask(taskId);
    if (!task) return;
    const existingFlags = task?.flag ? task.flag.split(",").map((f: string) => f.trim()).filter(Boolean) : [];
    if (!existingFlags.includes(flag)) {
      existingFlags.push(flag);
      await db
        .update(tasks)
        .set({ flag: existingFlags.join(","), updatedAt: new Date() })
        .where(eq(tasks.id, taskId));
    }

    // Auto-submit if configured
    const taskForSubmit = await this.getTask(taskId);
    if (taskForSubmit?.autoSubmit && taskForSubmit?.connectorId) {
      try {
        // TODO: resolve connector and submit flag
        // For now, emit the event
        this.emitStreamEvent(taskId, {
          id: uuid(),
          parentId: null,
          type: "flag-submitted",
          timestamp: Date.now(),
          data: { flag },
          status: "complete",
          depth: 0,
        });
      } catch (err: any) {
        this.emitStreamEvent(taskId, {
          id: uuid(),
          parentId: null,
          type: "flag-rejected",
          timestamp: Date.now(),
          data: { flag, error: err.message },
          status: "error",
          depth: 0,
        });
      }
    }
  }

  private recoverOrphanedRunningTasks(): void {
    const rows = sqlite.prepare(
      "SELECT id, started_at FROM tasks WHERE status = 'running'"
    ).all() as Array<{ id: string; started_at: number | null }>;

    const orphanedRows = rows.filter((row) => !this.abortControllers.has(row.id));
    if (orphanedRows.length === 0) return;

    const now = new Date();
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const nowMs = now.getTime();
    const error = "Task was interrupted before the server started; retry to continue.";
    const updateTask = sqlite.prepare(
      `UPDATE tasks
       SET status = 'stopped',
           error = ?,
           completed_at = ?,
           elapsed_ms = ?,
           updated_at = ?
       WHERE id = ? AND status = 'running'`
    );
    const insertEvent = sqlite.prepare(
      `INSERT INTO stream_events (id, task_id, parent_id, type, timestamp, data_json, status, depth)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const recover = sqlite.transaction((tasksToRecover: typeof orphanedRows) => {
      for (const task of tasksToRecover) {
        const startedMs = this.timestampToMs(task.started_at);
        const elapsedMs = Math.max(0, nowMs - (startedMs ?? nowMs));
        const result = updateTask.run(error, nowSeconds, elapsedMs, nowSeconds, task.id);

        if (result.changes > 0) {
          insertEvent.run(
            uuid(),
            task.id,
            null,
            "task-error",
            nowMs,
            JSON.stringify({ error }),
            "error",
            0
          );
        }
      }
    });

    recover(orphanedRows);
  }

  private timestampToMs(timestamp: number | null): number | null {
    if (timestamp === null) return null;
    return timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  }

  private emitStreamEvent(taskId: string, event: StreamEvent): void {
    // Check if task is still running — skip events for stopped/completed/failed tasks
    const taskRow = sqlite.prepare("SELECT status FROM tasks WHERE id = ?").get(taskId) as any;
    if (!taskRow || taskRow.status !== "running") return;

    try {
      sqlite.prepare(
        `INSERT OR IGNORE INTO stream_events (id, task_id, parent_id, type, timestamp, data_json, status, depth)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        event.id,
        taskId,
        event.parentId,
        event.type,
        event.timestamp,
        JSON.stringify(event.data),
        event.status,
        event.depth
      );
    } catch {
      // Ignore any insert errors
    }

    this.emit("stream", taskId, event);
  }
}
