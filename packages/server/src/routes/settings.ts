import { Router } from "express";
import { db, sqlite } from "../db/index.js";
import { settings } from "../db/index.js";
import { eq } from "drizzle-orm";

export function createSettingsRoutes(): Router {
  const router = Router();

  // Get all settings
  router.get("/", async (_req, res) => {
    try {
      const rows = await db.select().from(settings);
      const result: Record<string, any> = {};
      for (const row of rows) {
        try {
          result[row.key] = JSON.parse(row.value);
        } catch {
          result[row.key] = row.value;
        }
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update settings
  router.put("/", async (req, res) => {
    try {
      const updates = req.body;
      for (const [key, value] of Object.entries(updates)) {
        const serialized = typeof value === "string" ? value : JSON.stringify(value);
        await db.insert(settings)
          .values({ key, value: serialized })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value: serialized },
          });
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
