import { createMiddleware } from "langchain";

/**
 * Fix tool calls that are embedded in the content field instead of the tool_calls field.
 * Some OpenAI-compatible models (like mimo-v2.5-pro) return tool calls as text in content:
 *   {"content": "<tool_call>{\"name\":\"execute\",...}</tool_call>"}
 * instead of the proper format:
 *   {"tool_calls": [{...}], "content": ""}
 *
 * This middleware detects and fixes this before the agent processes the response.
 */
export function createFixToolCallFormatMiddleware(): any {
  return createMiddleware({
    name: "FixToolCallFormat",
    wrapModelCall: async (request: any, handler: any) => {
      const response = await handler(request);

      // Check if content contains tool_call markers
      const content = typeof response.content === "string" ? response.content : "";

      // Pattern 1: <tool_call>{"name":"...","arguments":{...}}</tool_call>
      // Pattern 2: {"name":"...","arguments":{...}} (JSON in content)
      // Pattern 3: <tool_call>{"function":{"name":"...","arguments":{...}}}</tool_call>

      const toolCallPattern = /<tool_call>([\s\S]*?)<\/tool_call>/g;
      const matches = [...content.matchAll(toolCallPattern)];

      if (matches.length > 0) {
        // Extract tool calls from content
        const toolCalls = [];
        for (const match of matches) {
          try {
            const parsed = JSON.parse(match[1].trim());
            // Handle different formats
            if (parsed.name && parsed.arguments) {
              toolCalls.push({
                id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                type: "function",
                function: {
                  name: parsed.name,
                  arguments: typeof parsed.arguments === "string" ? parsed.arguments : JSON.stringify(parsed.arguments),
                },
              });
            } else if (parsed.function?.name) {
              toolCalls.push({
                id: parsed.id ?? `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                type: "function",
                function: parsed.function,
              });
            }
          } catch {
            // Not valid JSON, skip
          }
        }

        if (toolCalls.length > 0) {
          // Remove tool_call markers from content
          const cleanContent = content.replace(toolCallPattern, "").trim();

          // Update response to use proper tool_calls format
          response.content = cleanContent;
          response.tool_calls = toolCalls;
          response.additional_kwargs = {
            ...response.additional_kwargs,
            tool_calls: toolCalls,
          };
        }
      }

      // Pattern 2: Check for JSON objects that look like tool calls in content
      // This handles cases where the model outputs raw JSON without markers
      if (!response.tool_calls?.length && content.includes('"name"') && content.includes('"arguments"')) {
        try {
          // Try to find JSON objects with name+arguments pattern
          const jsonPattern = /\{[^{}]*"name"\s*:\s*"[^"]+?"\s*,\s*"arguments"\s*:\s*\{[^}]*\}[^{}]*\}/g;
          const jsonMatches = [...content.matchAll(jsonPattern)];

          if (jsonMatches.length > 0) {
            const toolCalls = [];
            for (const match of jsonMatches) {
              try {
                const parsed = JSON.parse(match[0]);
                if (parsed.name && parsed.arguments) {
                  toolCalls.push({
                    id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    type: "function",
                    function: {
                      name: parsed.name,
                      arguments: typeof parsed.arguments === "string" ? parsed.arguments : JSON.stringify(parsed.arguments),
                    },
                  });
                }
              } catch {
                // Not valid JSON
              }
            }

            if (toolCalls.length > 0) {
              // Remove matched JSON from content
              let cleanContent = content;
              for (const match of jsonMatches) {
                cleanContent = cleanContent.replace(match[0], "").trim();
              }

              response.content = cleanContent;
              response.tool_calls = toolCalls;
              response.additional_kwargs = {
                ...response.additional_kwargs,
                tool_calls: toolCalls,
              };
            }
          }
        } catch {
          // Ignore parsing errors
        }
      }

      return response;
    },
  });
}
