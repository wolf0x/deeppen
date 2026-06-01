import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

// ─── In-memory stores (hoisted so mock factories can use them) ───
const { stores, getStore, mockTables } = vi.hoisted(() => {
  const stores = {
    modelConfigs: [] as any[],
    subagentConfigs: [] as any[],
    tasks: [] as any[],
    streamEvents: [] as any[],
    progressEntries: [] as any[],
  };

  function createMockTable(_name: string) {
    return new Proxy(
      {},
      {
        get(_, prop) {
          return { __column: true, field: String(prop) };
        },
      },
    );
  }

  const mockTables = {
    modelConfigs: createMockTable("modelConfigs"),
    subagentConfigs: createMockTable("subagentConfigs"),
    tasks: createMockTable("tasks"),
    streamEvents: createMockTable("streamEvents"),
    progressEntries: createMockTable("progressEntries"),
  };

  const tableMap = new Map<any, any[]>();
  tableMap.set(mockTables.modelConfigs, stores.modelConfigs);
  tableMap.set(mockTables.subagentConfigs, stores.subagentConfigs);
  tableMap.set(mockTables.tasks, stores.tasks);
  tableMap.set(mockTables.streamEvents, stores.streamEvents);
  tableMap.set(mockTables.progressEntries, stores.progressEntries);

  function getStore(table: any): any[] {
    return tableMap.get(table) ?? [];
  }

  return { stores, getStore, mockTables };
});

// ─── Mock drizzle-orm ────────────────────────────────────────────
vi.mock("drizzle-orm", () => ({
  eq: (col: any, value: any) => ({
    __eq: true,
    field: col?.field,
    value,
  }),
}));

// ─── Mock database module (in-memory implementation) ─────────────
vi.mock("../db/index.js", () => {
  function filterRows(rows: any[], condition: any): any[] {
    if (condition?.__eq && condition.field) {
      return rows.filter((r) => r[condition.field] === condition.value);
    }
    return rows;
  }

  return {
    db: {
      select: () => ({
        from: (table: any) => {
          const store = getStore(table);
          const rows = [...store];
          return {
            where: (condition: any) => {
              return Promise.resolve(filterRows(rows, condition));
            },
            then: (resolve: any, reject: any) =>
              Promise.resolve(rows).then(resolve, reject),
          };
        },
      }),
      insert: (table: any) => ({
        values: (data: any) => {
          getStore(table).push(data);
          return {
            run: () => {},
            then: (resolve: any, reject: any) =>
              Promise.resolve(undefined).then(resolve, reject),
          };
        },
      }),
      update: (table: any) => ({
        set: (data: any) => ({
          where: (condition: any) => {
            const store = getStore(table);
            for (const row of store) {
              if (
                condition?.__eq &&
                condition.field &&
                row[condition.field] === condition.value
              ) {
                Object.assign(row, data);
              }
            }
            return {
              then: (resolve: any, reject: any) =>
                Promise.resolve(undefined).then(resolve, reject),
            };
          },
        }),
      }),
      delete: (table: any) => ({
        where: (condition: any) => {
          const store = getStore(table);
          if (condition?.__eq && condition.field) {
            const idx = store.findIndex(
              (r) => r[condition.field] === condition.value,
            );
            if (idx >= 0) store.splice(idx, 1);
          }
          return {
            then: (resolve: any, reject: any) =>
              Promise.resolve(undefined).then(resolve, reject),
          };
        },
      }),
    },
    modelConfigs: mockTables.modelConfigs,
    subagentConfigs: mockTables.subagentConfigs,
    tasks: mockTables.tasks,
    streamEvents: mockTables.streamEvents,
    progressEntries: mockTables.progressEntries,
  };
});

// ─── Mock AgentRunner (avoids loading LangChain / native deps) ───
vi.mock("../services/AgentRunner.js", () => ({
  createChatModel: vi.fn(),
  runCTFAgent: vi.fn().mockResolvedValue({
    flag: null,
    messages: [],
    events: [],
  }),
}));

// ─── Imports (resolved after mocks are registered) ───────────────
import { TaskManager } from "../services/TaskManager.js";
import { ConfigStore } from "../services/ConfigStore.js";
import { StreamBridge } from "../services/StreamBridge.js";
import { createTaskRoutes } from "../routes/tasks.js";
import { createConfigRoutes } from "../routes/config.js";
import { createStreamRoutes } from "../routes/stream.js";
import { createHealthRoutes } from "../routes/health.js";

// ─── Test app factory (same wiring as index.ts, no listen) ───────
function createTestApp() {
  const app = express();
  app.use(express.json());

  const taskManager = new TaskManager();
  const configStore = new ConfigStore();
  const streamBridge = new StreamBridge();

  taskManager.on("stream", (taskId: string, event: any) => {
    streamBridge.broadcast(taskId, event);
  });

  app.use("/api/tasks", createTaskRoutes(taskManager));
  app.use("/api/config", createConfigRoutes(configStore));
  app.use("/api/tasks", createStreamRoutes(taskManager, streamBridge));
  app.use("/api/health", createHealthRoutes());

  return { app, taskManager, configStore };
}

// ─── Tests ───────────────────────────────────────────────────────
describe("Integration: API Endpoints", () => {
  beforeEach(() => {
    // Clear all in-memory stores between tests
    stores.modelConfigs.length = 0;
    stores.subagentConfigs.length = 0;
    stores.tasks.length = 0;
    stores.streamEvents.length = 0;
    stores.progressEntries.length = 0;
  });

  it("GET /api/health returns ok", async () => {
    const { app } = createTestApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("deeppen");
  });

  it("GET /api/tasks returns empty array initially", async () => {
    const { app } = createTestApp();
    const res = await request(app).get("/api/tasks");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/config/models creates a model config", async () => {
    const { app } = createTestApp();
    const res = await request(app)
      .post("/api/config/models")
      .send({
        name: "Test Model",
        provider: "anthropic",
        apiKey: "test-key",
        modelId: "claude-sonnet-4-6",
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe("Test Model");
  });

  it("POST /api/tasks creates a task", async () => {
    const { app, configStore } = createTestApp();

    // First create a model config
    const model = await configStore.createModel({
      name: "Test Model",
      provider: "anthropic",
      apiKey: "test-key",
      modelId: "claude-sonnet-4-6",
      maxTokens: 4096,
      temperature: 0,
    });

    // Then create a task
    const res = await request(app)
      .post("/api/tasks")
      .send({
        name: "Test CTF Challenge",
        challenge: {
          description: "Find the flag: flag{test123}",
          category: "misc",
        },
        modelId: model.id,
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  it("POST /api/tasks rejects invalid config", async () => {
    const { app } = createTestApp();
    const res = await request(app)
      .post("/api/tasks")
      .send({ name: "" }); // Missing required fields
    expect(res.status).toBe(400);
  });

  it("GET /api/tasks/:id returns 404 for nonexistent task", async () => {
    const { app } = createTestApp();
    const res = await request(app).get("/api/tasks/nonexistent");
    expect(res.status).toBe(404);
  });

  it("POST /api/tasks/:id/start returns 400 for nonexistent task", async () => {
    const { app } = createTestApp();
    const res = await request(app).post("/api/tasks/nonexistent/start");
    expect(res.status).toBe(400);
  });

  it("GET /api/config/models returns empty array initially", async () => {
    const { app } = createTestApp();
    const res = await request(app).get("/api/config/models");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/config/agents returns empty array initially", async () => {
    const { app } = createTestApp();
    const res = await request(app).get("/api/config/agents");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
