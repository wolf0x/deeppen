import express from "express";
import { TaskManager } from "./services/TaskManager.js";
import { ConfigStore } from "./services/ConfigStore.js";
import { StreamBridge } from "./services/StreamBridge.js";
import { MCPManager } from "./services/MCPManager.js";
import { APIConnector } from "./services/APIConnector.js";
import { ContainerManager } from "./services/ContainerManager.js";
import { createTaskRoutes } from "./routes/tasks.js";
import { createConfigRoutes } from "./routes/config.js";
import { createStreamRoutes } from "./routes/stream.js";
import { createHealthRoutes } from "./routes/health.js";
import { createMCPRoutes } from "./routes/mcp.js";
import { createConnectorRoutes } from "./routes/connectors.js";
import { createSkillRoutes } from "./routes/skills.js";
import { createContainerRoutes } from "./routes/container.js";
import { WriteupGenerator } from "./services/WriteupGenerator.js";
import { createWriteupRoutes } from "./routes/writeups.js";
import { ChatService } from "./services/ChatService.js";
import { createChatRoutes } from "./routes/chat.js";
import { createSettingsRoutes } from "./routes/settings.js";

const PORT = parseInt(process.env.PORT ?? "4000");
const app: any = express();

app.use(express.json());

// Services
const taskManager = new TaskManager();
const configStore = new ConfigStore();
const streamBridge = new StreamBridge();
const mcpManager = new MCPManager();
const apiConnector = new APIConnector();
const containerManager = new ContainerManager();
const writeupGenerator = new WriteupGenerator();
const chatService = new ChatService(configStore, taskManager);

// Wire TaskManager stream events to StreamBridge
taskManager.on("stream", (taskId: string, event: any) => {
  streamBridge.broadcast(taskId, event);
});

// Routes
app.use("/api/tasks", createTaskRoutes(taskManager));
app.use("/api/config", createConfigRoutes(configStore));
app.use("/api/tasks", createStreamRoutes(taskManager, streamBridge));
app.use("/api/health", createHealthRoutes());
app.use("/api/config/mcp", createMCPRoutes(mcpManager));
app.use("/api/config/connectors", createConnectorRoutes(apiConnector));
app.use("/api/config/skills", createSkillRoutes());
app.use("/api/config/container", createContainerRoutes(containerManager));
app.use("/api/writeups", createWriteupRoutes(writeupGenerator));
app.use("/api/chat", createChatRoutes(chatService));
app.use("/api/settings", createSettingsRoutes());

// Start server
app.listen(PORT, () => {
  console.log(`DeepPen server running on port ${PORT}`);
});

export { app, taskManager, configStore, streamBridge, mcpManager, apiConnector, containerManager, writeupGenerator, chatService };
