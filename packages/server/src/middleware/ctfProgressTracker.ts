import { createMiddleware } from "langchain";
import { v4 as uuid } from "uuid";
import type { ProgressEntry } from "@deeppen/shared";

export interface ProgressTrackerOptions {
  /** Task ID for this tracking session */
  taskId: string;
  /** Callback when a progress entry is generated */
  onProgress?: (entry: ProgressEntry) => void;
}

/**
 * Middleware that tracks agent approaches and tool usage for writeup generation.
 *
 * Monitors tool calls and agent thinking to build a timeline of solving progress.
 * Uses wrapModelCall to observe what tools the model requested, then after the
 * model responds, emits a progress entry summarizing the recent activity.
 */
export function createProgressTrackerMiddleware(options: ProgressTrackerOptions) {
  const { taskId, onProgress } = options;
  const toolCallsBuffer: string[] = [];
  let currentApproach = "initial-analysis";

  return createMiddleware({
    name: "CtfProgressTracker",
    wrapModelCall: async (request, handler) => {
      // Track which tools were called in the previous turn
      const lastMessage = request.messages?.[request.messages.length - 1];
      if (
        lastMessage &&
        "tool_calls" in lastMessage &&
        Array.isArray((lastMessage as any).tool_calls)
      ) {
        for (const tc of (lastMessage as any).tool_calls) {
          if (tc.name && !toolCallsBuffer.includes(tc.name)) {
            toolCallsBuffer.push(tc.name);
          }
        }
      }

      const response = await handler(request);

      // After model responds, emit progress if there's substance
      const content =
        typeof response.content === "string"
          ? response.content
          : Array.isArray(response.content)
            ? response.content
                .map((b: any) => ("text" in b ? b.text : ""))
                .join("")
            : "";

      if (content.length > 50 && toolCallsBuffer.length > 0) {
        const entry: ProgressEntry = {
          id: uuid(),
          taskId,
          timestamp: new Date(),
          approach: currentApproach,
          toolsUsed: [...toolCallsBuffer],
          result: "progress",
          notes: content.slice(0, 200),
        };
        onProgress?.(entry);
        toolCallsBuffer.length = 0;
      }

      return response;
    },
  });
}
