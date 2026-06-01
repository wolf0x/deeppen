import { describe, it, expect, vi } from "vitest";

// Mock the db module to avoid loading native better-sqlite3 bindings
vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  },
  tasks: {},
  streamEvents: {},
  progressEntries: {},
}));

// Mock the AgentRunner module
vi.mock("./AgentRunner.js", () => ({
  runCTFAgent: vi.fn().mockResolvedValue({
    flag: null,
    messages: [],
    events: [],
  }),
}));

// Mock the ConfigStore module
vi.mock("./ConfigStore.js", () => ({
  ConfigStore: vi.fn().mockImplementation(() => ({
    getModel: vi.fn().mockResolvedValue({
      id: "test-model",
      name: "Test Model",
      provider: "anthropic",
      modelId: "claude-3-sonnet",
      maxTokens: 4096,
      temperature: 0,
    }),
  })),
}));

const { TaskManager } = await import("./TaskManager.js");

describe("TaskManager", () => {
  it("can be instantiated", () => {
    const tm = new TaskManager();
    expect(tm).toBeDefined();
  });

  it("has create method", () => {
    const tm = new TaskManager();
    expect(typeof tm.create).toBe("function");
  });

  it("has start method", () => {
    const tm = new TaskManager();
    expect(typeof tm.start).toBe("function");
  });

  it("has pause method", () => {
    const tm = new TaskManager();
    expect(typeof tm.pause).toBe("function");
  });

  it("has resume method", () => {
    const tm = new TaskManager();
    expect(typeof tm.resume).toBe("function");
  });

  it("has stop method", () => {
    const tm = new TaskManager();
    expect(typeof tm.stop).toBe("function");
  });

  it("has getTask method", () => {
    const tm = new TaskManager();
    expect(typeof tm.getTask).toBe("function");
  });

  it("has listTasks method", () => {
    const tm = new TaskManager();
    expect(typeof tm.listTasks).toBe("function");
  });

  it("has getStreamEvents method", () => {
    const tm = new TaskManager();
    expect(typeof tm.getStreamEvents).toBe("function");
  });

  it("extends EventEmitter", () => {
    const tm = new TaskManager();
    expect(typeof tm.on).toBe("function");
    expect(typeof tm.emit).toBe("function");
  });
});
