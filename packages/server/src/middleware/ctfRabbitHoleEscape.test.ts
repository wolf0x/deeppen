import { describe, it, expect } from "vitest";
import { createRabbitHoleEscapeMiddleware } from "./ctfRabbitHoleEscape.js";

describe("createRabbitHoleEscapeMiddleware", () => {
  it("creates middleware with correct name", () => {
    const mw = createRabbitHoleEscapeMiddleware({
      maxIterations: 50,
      maxTimeMinutes: 30,
      pivotStrategy: "different-approach",
    });
    expect(mw.name).toBe("CtfRabbitHoleEscape");
  });

  it("accepts custom thresholds", () => {
    const mw = createRabbitHoleEscapeMiddleware({
      maxIterations: 10,
      maxTimeMinutes: 5,
      pivotStrategy: "stop",
    });
    expect(mw).toBeDefined();
  });

  it("accepts onEscape callback", () => {
    const reasons: string[] = [];
    const mw = createRabbitHoleEscapeMiddleware({
      maxIterations: 5,
      maxTimeMinutes: 1,
      pivotStrategy: "different-approach",
      onEscape: (reason) => reasons.push(reason),
    });
    expect(mw).toBeDefined();
  });
});
