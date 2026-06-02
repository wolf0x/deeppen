import { Router } from "express";
import { MCPManager } from "../services/MCPManager.js";

export function createMCPRoutes(manager: MCPManager): Router {
  const router = Router();
  router.get("/", async (_req, res) => { res.json(await manager.list()); });
  router.post("/", async (req, res) => { try { res.status(201).json(await manager.create(req.body)); } catch (e: any) { res.status(400).json({ error: e.message }); } });
  router.put("/:id", async (req, res) => { const r = await manager.update(req.params.id, req.body); if (!r) return res.status(404).json({ error: "Not found" }); res.json(r); });
  router.delete("/:id", async (req, res) => { await manager.delete(req.params.id); res.json({ ok: true }); });
  router.post("/:id/test", async (req, res) => { res.json(await manager.test(req.params.id)); });
  return router;
}
