import { Router } from "express";

export function createHealthRoutes(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "deeppen",
    });
  });

  return router;
}
