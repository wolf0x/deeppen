import { createMiddleware, SystemMessage } from "langchain";

export interface RabbitHoleEscapeOptions {
  /** Maximum number of model calls before forcing a pivot */
  maxIterations: number;
  /** Maximum wall-clock time in minutes before forcing stop */
  maxTimeMinutes: number;
  /** What to do when limits are hit */
  pivotStrategy: "different-approach" | "ask-user" | "stop";
  /** Callback when escape is triggered */
  onEscape?: (reason: string, iterations: number) => void;
}

/**
 * Middleware that enforces iteration and time limits for CTF solving.
 *
 * When the agent exceeds the configured thresholds, injects system messages
 * instructing it to pivot to a different approach or stop entirely.
 * This prevents the agent from going down unproductive rabbit holes.
 */
export function createRabbitHoleEscapeMiddleware(options: RabbitHoleEscapeOptions) {
  const { maxIterations, maxTimeMinutes, pivotStrategy, onEscape } = options;
  let iterationCount = 0;
  const startTime = Date.now();
  let pivotInjected = false;
  let pivotCount = 0;

  return createMiddleware({
    name: "CtfRabbitHoleEscape",
    wrapModelCall: async (request, handler) => {
      iterationCount++;
      const elapsedMinutes = (Date.now() - startTime) / 60_000;

      // Check time limit — always force stop regardless of strategy
      if (elapsedMinutes >= maxTimeMinutes) {
        onEscape?.(`Time limit exceeded (${maxTimeMinutes}min)`, iterationCount);

        return handler({
          ...request,
          systemMessage: request.systemMessage.concat(
            new SystemMessage({
              content: `TIME LIMIT REACHED: You have been working for ${Math.round(elapsedMinutes)} minutes. Stop all work immediately and summarize what you've found so far. Return your final findings.`
            })
          ),
        });
      }

      // Check iteration limit
      if (iterationCount >= maxIterations && !pivotInjected) {
        pivotInjected = true;
        pivotCount++;
        onEscape?.(`Iteration limit reached (${maxIterations})`, iterationCount);

        return handler({
          ...request,
          systemMessage: request.systemMessage.concat(
            new SystemMessage({
              content: `RABBIT HOLE ALERT: You have been working for ${iterationCount} iterations without finding the flag. Your current approach is not working. You MUST try a fundamentally different strategy now. Analyze what you've tried, identify what you haven't tried, and pivot to a completely different approach.`
            })
          ),
        });
      }

      // Second pivot attempt — escalate
      if (pivotInjected && pivotCount < 3 && iterationCount >= maxIterations + 3) {
        pivotCount++;
        onEscape?.(`Pivot attempt ${pivotCount} failed`, iterationCount);

        if (pivotStrategy === "stop" || pivotCount >= 3) {
          return handler({
            ...request,
            systemMessage: request.systemMessage.concat(
              new SystemMessage({
                content: `ESCALATION: Multiple pivot attempts failed. Stop working and return your complete findings so far.`
              })
            ),
          });
        }
      }

      return handler(request);
    },
  });
}
