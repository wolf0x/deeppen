import { Router } from "express";
import type { SettingsStore } from "../services/SettingsStore.js";

export function createSettingsRoutes(store: SettingsStore): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      res.json(await store.getAll());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put("/", async (req, res) => {
    try {
      const updated = await store.updateAll(req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
