import { Router } from "express";
import { TaskManager } from "../services/TaskManager.js";
import { TaskConfigSchema } from "@deeppen/shared";

export function createTaskRoutes(taskManager: TaskManager): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    const taskList = await taskManager.listTasks();
    res.json(taskList);
  });

  router.post("/", async (req, res) => {
    try {
      const config = TaskConfigSchema.parse(req.body);
      const id = await taskManager.create(config);
      res.status(201).json({ id });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get("/:id", async (req, res) => {
    const task = await taskManager.getTask(req.params.id);
    if (!task) return res.status(404).json({ error: "Not found" });
    res.json(task);
  });

  router.post("/:id/start", async (req, res) => {
    try {
      await taskManager.start(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post("/:id/pause", async (req, res) => {
    try {
      await taskManager.pause(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post("/:id/resume", async (req, res) => {
    try {
      await taskManager.resume(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post("/:id/stop", async (req, res) => {
    try {
      await taskManager.stop(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post("/:id/retry", async (req, res) => {
    try {
      await taskManager.retry(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
