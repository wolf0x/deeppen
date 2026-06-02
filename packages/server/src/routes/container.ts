import { Router } from "express";
import { ContainerManager } from "../services/ContainerManager.js";

export function createContainerRoutes(manager: ContainerManager): Router {
  const router = Router();
  router.get("/config", (_req, res) => { res.json(manager.getConfig()); });
  router.put("/config", (req, res) => { manager.updateConfig(req.body); res.json(manager.getConfig()); });
  router.get("/status", async (_req, res) => { res.json(await manager.getStatus()); });
  router.post("/start", async (_req, res) => { try { await manager.start(); res.json({ ok: true }); } catch (e: any) { res.status(500).json({ error: e.message }); } });
  router.post("/stop", async (_req, res) => { try { await manager.stop(); res.json({ ok: true }); } catch (e: any) { res.status(500).json({ error: e.message }); } });
  router.post("/execute", async (req, res) => { try { res.json(await manager.execute(req.body.command, req.body.options)); } catch (e: any) { res.status(500).json({ error: e.message }); } });
  return router;
}
