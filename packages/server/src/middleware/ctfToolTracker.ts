import { createMiddleware } from "deepagents";
import type { StreamEvent } from "@deeppen/shared";
import { extractFlags } from "./ctfFlagExtractor.js";

export interface ToolTrackerOptions {
  onStreamEvent?: (event: StreamEvent) => void;
  onFlagFound?: (flag: string) => void;
}

/**
 * Middleware that emits tool-call and tool-result stream events,
 * and scans tool outputs for flags.
 */
export function createToolTrackerMiddleware(options: ToolTrackerOptions) {
  const { onStreamEvent, onFlagFound } = options;

  return createMiddleware({
    name: "CtfToolTracker",
    wrapModelCall: async (request, handler) => {
      // Emit tool-call events for any tool calls in the request
      const lastMessage = request.messages?.[request.messages.length - 1];
      if (
        lastMessage &&
        "tool_calls" in lastMessage &&
        Array.isArray((lastMessage as any).tool_calls)
      ) {
        for (const tc of (lastMessage as any).tool_calls) {
          onStreamEvent?.({
            id: `tool-${tc.id ?? Date.now()}`,
            parentId: null,
            type: "tool-call",
            timestamp: Date.now(),
            data: {
              toolName: tc.name,
              toolInput: tc.args,
            },
            status: "running",
            depth: 2,
          });
        }
      }

      const response = await handler(request);

      // Emit tool-result events and scan for flags
      if (
        lastMessage &&
        "tool_calls" in lastMessage &&
        Array.isArray((lastMessage as any).tool_calls)
      ) {
        for (const tc of (lastMessage as any).tool_calls) {
          const toolOutput =
            typeof response.content === "string"
              ? response.content.slice(0, 500)
              : "(complex output)";

          onStreamEvent?.({
            id: `result-${tc.id ?? Date.now()}`,
            parentId: `tool-${tc.id ?? Date.now()}`,
            type: "tool-result",
            timestamp: Date.now(),
            data: {
              toolName: tc.name,
              toolOutput,
            },
            status: "complete",
            depth: 3,
          });

          // Scan tool output for flags
          const fullOutput =
            typeof response.content === "string" ? response.content : "";
          const flags = extractFlags(fullOutput);
          for (const flag of flags) {
            onStreamEvent?.({
              id: `flag-tool-${Date.now()}`,
              parentId: `result-${tc.id ?? Date.now()}`,
              type: "flag-found",
              timestamp: Date.now(),
              data: { flag, source: "tool-output" },
              status: "complete",
              depth: 4,
            });
            onFlagFound?.(flag);
          }
        }
      }

      return response;
    },
  });
}
