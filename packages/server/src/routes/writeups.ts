import { Router } from "express";
import { WriteupGenerator } from "../services/WriteupGenerator.js";

export function createWriteupRoutes(generator: WriteupGenerator): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    res.json(await generator.list());
  });

  router.post("/generate/:taskId", async (req, res) => {
    try {
      const w = await generator.generate(req.params.taskId);
      res.status(201).json(w);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  router.get("/:id/export", async (req, res) => {
    const w = await generator.get(req.params.id);
    if (!w) return res.status(404).json({ error: "Not found" });
    res.setHeader("Content-Type", "text/markdown");
    res.setHeader("Content-Disposition", `attachment; filename="${w.title}.md"`);
    res.send(w.contentMarkdown);
  });

  router.get("/:id", async (req, res) => {
    const w = await generator.get(req.params.id);
    if (!w) return res.status(404).json({ error: "Not found" });
    res.json(w);
  });

  router.put("/:id", async (req, res) => {
    await generator.update(req.params.id, req.body.contentMarkdown);
    res.json({ ok: true });
  });

  router.delete("/:id", async (req, res) => {
    await generator.delete(req.params.id);
    res.json({ ok: true });
  });

  return router;
}
