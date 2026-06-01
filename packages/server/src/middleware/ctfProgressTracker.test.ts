import { describe, it, expect } from "vitest";
import { createProgressTrackerMiddleware } from "./ctfProgressTracker.js";

describe("createProgressTrackerMiddleware", () => {
  it("creates middleware with correct name", () => {
    const mw = createProgressTrackerMiddleware({ taskId: "test" });
    expect(mw.name).toBe("CtfProgressTracker");
  });

  it("accepts onProgress callback", () => {
    const entries: any[] = [];
    const mw = createProgressTrackerMiddleware({
      taskId: "test",
      onProgress: (entry) => entries.push(entry),
    });
    expect(mw).toBeDefined();
  });

  it("accepts empty options", () => {
    const mw = createProgressTrackerMiddleware({ taskId: "test-123" });
    expect(mw).toBeDefined();
  });
});
