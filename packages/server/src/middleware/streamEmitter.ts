import { createMiddleware } from "langchain";
import { v4 as uuid } from "uuid";
import type { StreamEvent } from "@deeppen/shared";
import { extractFlags } from "./ctfFlagExtractor.js";

export interface StreamEmitterOptions {
  onStreamEvent?: (event: StreamEvent) => void;
  onFlagFound?: (flag: string) => void;
}

/**
 * Single middleware that emits ALL stream events from the agent:
 * - agent-response: model text output after each LLM call
 * - tool-call: before each tool execution (name + args)
 * - tool-result: after each tool execution (output)
 * - flag-found: when a flag pattern is detected
 *
 * This is the ONLY source of stream events for agent activity.
 * No other component should emit tool/model events.
 */
export function createStreamEmitterMiddleware(options: StreamEmitterOptions): any {
  const { onStreamEvent, onFlagFound } = options;

  const emit = (event: StreamEvent) => {
    try { onStreamEvent?.(event); } catch (err: any) {
      console.error("[StreamEmitter] Failed to emit event:", event.type, err.message);
    }
  };

  return createMiddleware({
    name: "StreamEmitter",

    // Fires for each LLM invocation
    wrapModelCall: async (request: any, handler: any) => {
      const response = await handler(request);

      const text = extractText(response);
      if (text.trim()) {
        emit({
          id: uuid(),
          parentId: null,
          type: "agent-response",
          timestamp: Date.now(),
          data: { content: text },
          status: "complete",
          depth: 1,
        });

        for (const flag of extractFlags(text)) {
          emit({
            id: uuid(),
            parentId: null,
            type: "flag-found",
            timestamp: Date.now(),
            data: { flag },
            status: "complete",
            depth: 2,
          });
          onFlagFound?.(flag);
        }
      }

      return response;
    },

    // Fires for each tool execution
    wrapToolCall: async (request: any, handler: any) => {
      const { toolCall } = request;
      const callId = uuid();

      emit({
        id: callId,
        parentId: null,
        type: "tool-call",
        timestamp: Date.now(),
        data: { toolName: toolCall.name, toolInput: toolCall.args },
        status: "running",
        depth: 2,
      });

      try {
        const result = await handler(request);
        const output = extractToolOutput(result);

        emit({
          id: uuid(),
          parentId: callId,
          type: "tool-result",
          timestamp: Date.now(),
          data: { toolName: toolCall.name, toolOutput: output },
          status: "complete",
          depth: 3,
        });

        for (const flag of extractFlags(output)) {
          emit({
            id: uuid(),
            parentId: callId,
            type: "flag-found",
            timestamp: Date.now(),
            data: { flag },
            status: "complete",
            depth: 4,
          });
          onFlagFound?.(flag);
        }

        return result;
      } catch (err: any) {
        emit({
          id: uuid(),
          parentId: callId,
          type: "tool-result",
          timestamp: Date.now(),
          data: { toolName: toolCall.name, toolOutput: `Error: ${err.message}`, error: err.message },
          status: "error",
          depth: 3,
        });
        throw err;
      }
    },
  });
}

/** Extract text from an LLM response */
function extractText(response: any): string {
  if (typeof response?.content === "string") return response.content;
  if (Array.isArray(response?.content)) {
    return response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
  }
  return "";
}

/** Extract output string from a tool result */
function extractToolOutput(result: any): string {
  if (typeof result === "string") return result;
  if (typeof result?.output === "string") return result.output;       // ExecuteResponse
  if (typeof result?.content === "string") return result.content;     // AIMessage-like
  if (Array.isArray(result?.content)) {                               // Content blocks
    return result.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
  }
  try { return JSON.stringify(result); } catch { return String(result); }
}
