import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { Dashboard } from "./pages/Dashboard.js";
import { TaskDetail } from "./pages/TaskDetail.js";
import { TaskCreate } from "./pages/TaskCreate.js";
import { ModelConfig } from "./pages/ModelConfig.js";
import { SubAgentConfig } from "./pages/SubAgentConfig.js";
import { MCPConfig } from "./pages/MCPConfig.js";
import { SkillsManager } from "./pages/SkillsManager.js";
import { ContainerConfig } from "./pages/ContainerConfig.js";
import { ConnectorConfig } from "./pages/ConnectorConfig.js";
import { Writeups } from "./pages/Writeups.js";
import { Chat } from "./pages/Chat.js";
import { Settings } from "./pages/Settings.js";
import { Kanban } from "./pages/Kanban.js";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/kanban" element={<Kanban />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/tasks/new" element={<TaskCreate />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />
          <Route path="/writeups" element={<Writeups />} />
          <Route path="/config/models" element={<ModelConfig />} />
          <Route path="/config/agents" element={<SubAgentConfig />} />
          <Route path="/config/mcp" element={<MCPConfig />} />
          <Route path="/config/skills" element={<SkillsManager />} />
          <Route path="/config/container" element={<ContainerConfig />} />
          <Route path="/config/connectors" element={<ConnectorConfig />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
