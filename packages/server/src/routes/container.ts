import { Router } from "express";
import { ContainerManager } from "../services/ContainerManager.js";

export function createContainerRoutes(manager: ContainerManager): Router {
  const router = Router();

  router.get("/config", (_req, res) => {
    res.json(manager.getConfig());
  });

  router.put("/config", (req, res) => {
    try {
      // Validate: only allow known fields
      const allowed = ["image", "name", "volumes", "networkMode", "resourceLimits", "installedTools"];
      const update: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in req.body) update[key] = req.body[key];
      }
      manager.updateConfig(update);
      res.json(manager.getConfig());
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  router.get("/status", async (_req, res) => {
    try {
      res.json(await manager.getStatus());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/start", async (_req, res) => {
    try {
      await manager.start();
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/stop", async (_req, res) => {
    try {
      await manager.stop();
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/execute", async (req, res) => {
    try {
      if (!req.body.command || typeof req.body.command !== "string") {
        return res.status(400).json({ error: "command is required and must be a string" });
      }
      // Sanitize: limit command length
      if (req.body.command.length > 10000) {
        return res.status(400).json({ error: "command too long (max 10000 chars)" });
      }
      res.json(await manager.execute(req.body.command, req.body.options));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
