import type { Response } from "express";
import type { StreamEvent } from "@deeppen/shared";

/**
 * Manages SSE connections for task streaming.
 * Each task can have multiple connected clients (e.g., multiple browser tabs).
 */
export class StreamBridge {
  private clients = new Map<string, Set<Response>>();

  /**
   * Register a client for a task's stream.
   * Sets SSE headers and sends an initial connected event.
   */
  addClient(taskId: string, res: Response): void {
    if (!this.clients.has(taskId)) {
      this.clients.set(taskId, new Set());
    }
    this.clients.get(taskId)!.add(res);

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Send initial connected event
    res.write(`event: connected\ndata: {"taskId":"${taskId}"}\n\n`);

    // Clean up on disconnect
    res.on("close", () => {
      this.removeClient(taskId, res);
    });
  }

  /**
   * Remove a client connection.
   */
  removeClient(taskId: string, res: Response): void {
    const taskClients = this.clients.get(taskId);
    if (taskClients) {
      taskClients.delete(res);
      if (taskClients.size === 0) {
        this.clients.delete(taskId);
      }
    }
  }

  /**
   * Broadcast a stream event to all clients watching a task.
   */
  broadcast(taskId: string, event: StreamEvent): void {
    const taskClients = this.clients.get(taskId);
    if (!taskClients) return;

    const data = JSON.stringify(event);
    for (const client of taskClients) {
      try {
        client.write(`event: stream\ndata: ${data}\n\n`);
      } catch {
        // Client disconnected
        this.removeClient(taskId, client);
      }
    }
  }

  /**
   * Get the total number of connected clients across all tasks.
   */
  getClientCount(): number {
    let count = 0;
    for (const taskClients of this.clients.values()) {
      count += taskClients.size;
    }
    return count;
  }
}
