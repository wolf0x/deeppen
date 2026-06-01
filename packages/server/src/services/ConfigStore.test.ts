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
  modelConfigs: {},
  subagentConfigs: {},
}));

const { ConfigStore } = await import("./ConfigStore.js");

describe("ConfigStore", () => {
  it("can be instantiated", () => {
    expect(ConfigStore).toBeDefined();
  });

  it("has listModels method", () => {
    const store = new ConfigStore();
    expect(typeof store.listModels).toBe("function");
  });

  it("has getModel method", () => {
    const store = new ConfigStore();
    expect(typeof store.getModel).toBe("function");
  });

  it("has createModel method", () => {
    const store = new ConfigStore();
    expect(typeof store.createModel).toBe("function");
  });

  it("has deleteModel method", () => {
    const store = new ConfigStore();
    expect(typeof store.deleteModel).toBe("function");
  });

  it("has listSubagents method", () => {
    const store = new ConfigStore();
    expect(typeof store.listSubagents).toBe("function");
  });

  it("has createSubagent method", () => {
    const store = new ConfigStore();
    expect(typeof store.createSubagent).toBe("function");
  });
});
