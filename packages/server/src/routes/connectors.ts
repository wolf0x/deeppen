import { Router } from "express";
import { APIConnector } from "../services/APIConnector.js";

export function createConnectorRoutes(connector: APIConnector): Router {
  const router = Router();
  router.get("/", async (_req, res) => { res.json(await connector.list()); });
  router.post("/", async (req, res) => { try { res.status(201).json(await connector.create(req.body)); } catch (e: any) { res.status(400).json({ error: e.message }); } });
  router.delete("/:id", async (req, res) => { await connector.delete(req.params.id); res.json({ ok: true }); });
  router.post("/:id/test", async (req, res) => { res.json(await connector.test(req.params.id)); });
  return router;
}
