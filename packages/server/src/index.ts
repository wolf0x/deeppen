import express from "express";
import { TaskManager } from "./services/TaskManager.js";
import { ConfigStore } from "./services/ConfigStore.js";
import { StreamBridge } from "./services/StreamBridge.js";
import { createTaskRoutes } from "./routes/tasks.js";
import { createConfigRoutes } from "./routes/config.js";
import { createStreamRoutes } from "./routes/stream.js";
import { createHealthRoutes } from "./routes/health.js";

const PORT = parseInt(process.env.PORT ?? "4000");
const app = express();

app.use(express.json());

// Services
const taskManager = new TaskManager();
const configStore = new ConfigStore();
const streamBridge = new StreamBridge();

// Wire TaskManager stream events to StreamBridge
taskManager.on("stream", (taskId: string, event: any) => {
  streamBridge.broadcast(taskId, event);
});

// Routes
app.use("/api/tasks", createTaskRoutes(taskManager));
app.use("/api/config", createConfigRoutes(configStore));
app.use("/api/tasks", createStreamRoutes(taskManager, streamBridge));
app.use("/api/health", createHealthRoutes());

// Start server
app.listen(PORT, () => {
  console.log(`DeepPen server running on port ${PORT}`);
});

export { app, taskManager, configStore, streamBridge };
