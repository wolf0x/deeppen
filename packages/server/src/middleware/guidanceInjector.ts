import { createMiddleware, SystemMessage } from "langchain";
import type { GuidanceStore } from "../services/GuidanceStore.js";

/**
 * Middleware that injects Loop Agent guidance into the agent's context.
 * Checks for new guidance before each model call and appends it to the system prompt.
 */
export function createGuidanceInjectorMiddleware(
  taskId: string,
  guidanceStore: GuidanceStore
): any {
  let lastGuidanceIteration = -1;

  return createMiddleware({
    name: "GuidanceInjector",
    wrapModelCall: async (request: any, handler: any) => {
      try {
        // Check for new guidance
        const guidance = await guidanceStore.get(taskId);
        if (guidance && guidance.iterationNum > lastGuidanceIteration) {
          lastGuidanceIteration = guidance.iterationNum;

          // Inject guidance as a system message
          const guidanceMessage = new SystemMessage({
            content: `[Loop Agent Guidance]\n${guidance.guidance}\n\nUse this guidance to adjust your approach.`,
          });

          // Append to existing system messages
          request.messages = [
            ...request.messages,
            guidanceMessage,
          ];
        }
      } catch {
        // Ignore errors — don't break the agent
      }

      return handler(request);
    },
  });
}
