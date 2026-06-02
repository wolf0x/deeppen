import { EventEmitter } from "node:events";
import { v4 as uuid } from "uuid";
import { db } from "../db/index.js";
import { tasks, streamEvents } from "../db/index.js";
import { eq } from "drizzle-orm";
import type { TaskConfig, TaskStatus, StreamEvent } from "@deeppen/shared";
import { runCTFAgent } from "./AgentRunner.js";
import { ConfigStore } from "./ConfigStore.js";
import { ContainerManager } from "./ContainerManager.js";

export class TaskManager extends EventEmitter {
  private abortControllers = new Map<string, AbortController>();
  private configStore = new ConfigStore();
  private containerManager = new ContainerManager();

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
    if (task.status === "running")
      throw new Error(`Task ${taskId} is already running`);
    // Only allow starting from created or paused state
    if (task.status !== "created" && task.status !== "paused") {
      throw new Error(`Task ${taskId} cannot be started from status '${task.status}'`);
    }

    const modelConfig = await this.configStore.getModelWithKey(
      task.modelConfigId!,
    );
    if (!modelConfig)
      throw new Error(`Model config ${task.modelConfigId} not found`);

    await db
      .update(tasks)
      .set({
        status: "running",
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

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
    this.runAgentBackground(taskId, task, modelConfig, abortController.signal)
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
    return db.select().from(tasks);
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
      // Ensure container is running
      if (this.containerManager) {
        const status = await this.containerManager.getStatus();
        if (!status.running) {
          this.emitStreamEvent(taskId, {
            id: `container-${Date.now()}`,
            parentId: null,
            type: "agent-think",
            timestamp: Date.now(),
            data: { content: "Starting CTF tools container..." },
            status: "complete",
            depth: 1,
          });
          await this.containerManager.start();
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

      // Download attachments to container workspace if they exist
      if (attachments && attachments.length > 0 && this.containerManager) {
        for (const url of attachments) {
          try {
            const filename = url.split("/").pop() ?? "attachment";
            await this.containerManager.execute(
              `curl -sL "${url}" -o /workspace/attachments/${filename}`,
            );
          } catch {
            // Log but continue
          }
        }
      }

      const result = await runCTFAgent({
        modelConfig,
        challenge: task.challengeDescription,
        category: task.category,
        skills,
        attachments,
        containerManager: this.containerManager,
        rabbitHole,
        abortSignal: signal,
        onStreamEvent: (event) => this.emitStreamEvent(taskId, event),
        onFlagFound: (flag) => this.handleFlagFound(taskId, flag),
      });

      const elapsedMs = task.startedAt
        ? Date.now() - task.startedAt.getTime()
        : 0;
      await db
        .update(tasks)
        .set({
          status: result.flag ? "completed" : "failed",
          flag: result.flag,
          completedAt: new Date(),
          elapsedMs,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));

      this.emitStreamEvent(taskId, {
        id: uuid(),
        parentId: null,
        type: result.flag ? "task-complete" : "task-error",
        timestamp: Date.now(),
        data: result.flag
          ? { content: `Flag found: ${result.flag}` }
          : { error: "No flag found" },
        status: "complete",
        depth: 0,
      });

      this.emit("task-complete", taskId, result.flag);
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
    await db
      .update(tasks)
      .set({
        status: "failed",
        error: err.message,
        completedAt: new Date(),
        updatedAt: new Date(),
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
    // Update task with flag
    await db
      .update(tasks)
      .set({ flag, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    // Auto-submit if configured
    const task = await this.getTask(taskId);
    if (task?.autoSubmit && task?.connectorId) {
      try {
        // TODO: resolve connector and submit flag
        // For now, emit the event
        this.emitStreamEvent(taskId, {
          id: `submit-${Date.now()}`,
          parentId: null,
          type: "flag-submitted",
          timestamp: Date.now(),
          data: { flag },
          status: "complete",
          depth: 0,
        });
      } catch (err: any) {
        this.emitStreamEvent(taskId, {
          id: `submit-err-${Date.now()}`,
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

  private emitStreamEvent(taskId: string, event: StreamEvent): void {
    db.insert(streamEvents)
      .values({
        id: event.id,
        taskId,
        parentId: event.parentId,
        type: event.type,
        timestamp: event.timestamp,
        dataJson: JSON.stringify(event.data),
        status: event.status,
        depth: event.depth,
      })
      .run();

    this.emit("stream", taskId, event);
  }
}
