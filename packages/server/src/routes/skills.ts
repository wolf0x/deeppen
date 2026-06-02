import { Router } from "express";
import { db } from "../db/index.js";
import { skills } from "../db/index.js";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export function createSkillRoutes(): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    const all = await db.select().from(skills);
    res.json(all);
  });

  router.post("/", async (req, res) => {
    try {
      const id = uuid();
      await db.insert(skills).values({
        id, name: req.body.name, description: req.body.description,
        path: req.body.path, source: req.body.source ?? "user",
        enabled: true, createdAt: new Date(),
      });
      res.status(201).json({ id });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  router.post("/:id/toggle", async (req, res) => {
    const rows = await db.select().from(skills).where(eq(skills.id, req.params.id));
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    await db.update(skills).set({ enabled: !rows[0].enabled }).where(eq(skills.id, req.params.id));
    res.json({ ok: true, enabled: !rows[0].enabled });
  });

  router.delete("/:id", async (req, res) => {
    await db.delete(skills).where(eq(skills.id, req.params.id));
    res.json({ ok: true });
  });

  return router;
}
