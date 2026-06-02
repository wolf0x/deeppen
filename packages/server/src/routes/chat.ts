import { Router } from "express";
import { ChatService } from "../services/ChatService.js";
import { StreamBridge } from "../services/StreamBridge.js";

export function createChatRoutes(chatService: ChatService, streamBridge: StreamBridge): Router {
  const router = Router();

  // ─── Sessions ──────────────────────────────────────
  router.get("/sessions", async (_req, res) => {
    try {
      const sessions = await chatService.listSessions();
      res.json(sessions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/sessions", async (req, res) => {
    try {
      const session = await chatService.createSession(req.body.modelConfigId);
      res.status(201).json(session);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete("/sessions/:id", async (req, res) => {
    try {
      await chatService.deleteSession(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── Messages ──────────────────────────────────────
  router.get("/sessions/:id/messages", async (req, res) => {
    try {
      const messages = await chatService.getMessages(req.params.id);
      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post("/sessions/:id/messages", async (req, res) => {
    try {
      const { content, modelConfigId } = req.body;
      if (!content?.trim()) {
        return res.status(400).json({ error: "Message content is required" });
      }

      const result = await chatService.sendMessage(req.params.id, content, modelConfigId);

      // If the LLM produced a task creation, create it
      let taskCreated = result.taskCreated;
      if (taskCreated) {
        const taskId = await chatService.createTaskFromChat(taskCreated as any);
        taskCreated = { ...taskCreated, id: taskId };
      }

      res.json({
        userMessage: result.userMessage,
        assistantMessage: result.assistantMessage,
        taskCreated,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── SSE Stream (for future real-time streaming) ──
  router.get("/sessions/:id/stream", async (req, res) => {
    const sessionId = req.params.id;

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`event: connected\ndata: {"sessionId":"${sessionId}"}\n\n`);

    // Use StreamBridge to manage this connection
    streamBridge.addClient(sessionId, res);
  });

  return router;
}
