import { createMiddleware } from "langchain";
import type { StreamEvent } from "@deeppen/shared";
import { extractFlags } from "./ctfFlagExtractor.js";

export interface ToolTrackerOptions {
  onStreamEvent?: (event: StreamEvent) => void;
  onFlagFound?: (flag: string) => void;
}

/**
 * Middleware that emits real-time stream events for:
 * - Model text responses (agent-response)
 * - Tool calls (tool-call) and results (tool-result)
 * - Flags found in tool output
 */
export function createToolTrackerMiddleware(options: ToolTrackerOptions): any {
  const { onStreamEvent, onFlagFound } = options;
  let callCounter = 0;

  return createMiddleware({
    name: "CtfToolTracker",

    // Fires for each model invocation — capture text responses
    wrapModelCall: async (request: any, handler: any) => {
      const response = await handler(request);

      // Emit the model's text response as an agent-response event
      const text =
        typeof response.content === "string"
          ? response.content
          : Array.isArray(response.content)
            ? response.content
                .filter((b: any) => b.type === "text")
                .map((b: any) => b.text)
                .join("")
            : "";

      if (text.trim()) {
        onStreamEvent?.({
          id: `resp-${++callCounter}`,
          parentId: null,
          type: "agent-response",
          timestamp: Date.now(),
          data: { content: text.slice(0, 2000) },
          status: "complete",
          depth: 1,
        });

        // Scan model response for flags
        const flags = extractFlags(text);
        for (const flag of flags) {
          onStreamEvent?.({
            id: `flag-model-${Date.now()}`,
            parentId: null,
            type: "flag-found",
            timestamp: Date.now(),
            data: { flag, content: "Found in agent response" },
            status: "complete",
            depth: 2,
          });
          onFlagFound?.(flag);
        }
      }

      return response;
    },

    // Fires for each individual tool execution — track calls and results
    wrapToolCall: async (request: any, handler: any) => {
      const { toolCall } = request;
      const toolCallId = `tool-${toolCall.id ?? ++callCounter}`;

      // Emit tool-call event
      onStreamEvent?.({
        id: toolCallId,
        parentId: null,
        type: "tool-call",
        timestamp: Date.now(),
        data: {
          toolName: toolCall.name,
          toolInput: toolCall.args,
        },
        status: "running",
        depth: 2,
      });

      try {
        const result = await handler(request);

        // Extract output text
        const output =
          typeof result === "string"
            ? result
            : result?.content
              ? typeof result.content === "string"
                ? result.content
                : JSON.stringify(result.content)
              : JSON.stringify(result);

        // Emit tool-result event
        onStreamEvent?.({
          id: `result-${toolCall.id ?? callCounter}`,
          parentId: toolCallId,
          type: "tool-result",
          timestamp: Date.now(),
          data: {
            toolName: toolCall.name,
            toolOutput: output.slice(0, 500),
          },
          status: "complete",
          depth: 3,
        });

        // Scan tool output for flags
        const flags = extractFlags(output);
        for (const flag of flags) {
          onStreamEvent?.({
            id: `flag-tool-${Date.now()}`,
            parentId: `result-${toolCall.id ?? callCounter}`,
            type: "flag-found",
            timestamp: Date.now(),
            data: { flag, content: "Found in tool output" },
            status: "complete",
            depth: 4,
          });
          onFlagFound?.(flag);
        }

        return result;
      } catch (err: any) {
        // Emit tool error as tool-result with error status
        onStreamEvent?.({
          id: `result-${toolCall.id ?? callCounter}`,
          parentId: toolCallId,
          type: "tool-result",
          timestamp: Date.now(),
          data: {
            toolName: toolCall.name,
            toolOutput: `Error: ${err.message}`,
            error: err.message,
          },
          status: "error",
          depth: 3,
        });
        throw err;
      }
    },
  });
}
