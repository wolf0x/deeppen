import { Router } from "express";
import type { LoopAgent } from "../services/LoopAgent.js";

export function createLoopRoutes(loopAgent: LoopAgent): Router {
  const router = Router();

  // Get loop status and config
  router.get("/status", async (_req, res) => {
    try {
      const config = await loopAgent.getConfig();
      const status = loopAgent.getStatus();
      res.json({ config, ...status });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update loop config
  router.put("/config", async (req, res) => {
    try {
      const config = await loopAgent.updateConfig(req.body);
      res.json(config);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Trigger manual run
  router.post("/run", async (_req, res) => {
    try {
      // Run async, return immediately
      loopAgent.run();
      res.json({ ok: true, message: "Loop analysis started" });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
