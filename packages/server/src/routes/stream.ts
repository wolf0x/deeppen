import { Router } from "express";
import { TaskManager } from "../services/TaskManager.js";
import { StreamBridge } from "../services/StreamBridge.js";

export function createStreamRoutes(
  taskManager: TaskManager,
  streamBridge: StreamBridge,
): Router {
  const router = Router();

  router.get("/:id/stream", async (req, res) => {
    const taskId = req.params.id;
    const task = await taskManager.getTask(taskId);
    if (!task) return res.status(404).json({ error: "Not found" });

    // Register SSE client
    streamBridge.addClient(taskId, res);

    // Replay existing events with error handling
    try {
      const events = await taskManager.getStreamEvents(taskId);
      for (const event of events) {
        if (res.writableEnded) break;
        try {
          res.write(`event: stream\ndata: ${JSON.stringify(event)}\n\n`);
        } catch {
          break; // Client disconnected
        }
      }
    } catch {
      // Ignore replay errors
    }
  });

  return router;
}
