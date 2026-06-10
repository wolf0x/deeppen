const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const maxRetries = 3;
  let lastErr: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}: ${res.statusText}`);
      }
      return res.json();
    } catch (err: any) {
      lastErr = err;
      if (err.name === "AbortError") throw new Error("Request cancelled");
      // Retry on connection refused (server starting up)
      if (attempt < maxRetries - 1 && (err.message?.includes("Failed to fetch") || err.message?.includes("ECONNREFUSED"))) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      break;
    }
  }

  if (lastErr?.message?.includes("Failed to fetch") || lastErr?.message?.includes("ECONNREFUSED")) {
    throw new Error("Cannot connect to server. Make sure the API server is running on port 4000.");
  }
  throw new Error(`Network error: ${lastErr?.message}`);
}

export const api = {
  health: () => request<{ status: string }>("/health"),
  listTasks: () => request<any[]>("/tasks"),
  getTask: (id: string) => request<any>(`/tasks/${id}`),
  createTask: (config: any) => request<{ id: string }>("/tasks", { method: "POST", body: JSON.stringify(config) }),
  startTask: (id: string) => request<{ ok: boolean }>(`/tasks/${id}/start`, { method: "POST" }),
  pauseTask: (id: string) => request<{ ok: boolean }>(`/tasks/${id}/pause`, { method: "POST" }),
  resumeTask: (id: string) => request<{ ok: boolean }>(`/tasks/${id}/resume`, { method: "POST" }),
  stopTask: (id: string) => request<{ ok: boolean }>(`/tasks/${id}/stop`, { method: "POST" }),
  retryTask: (id: string) => request<{ ok: boolean }>(`/tasks/${id}/retry`, { method: "POST" }),
  listModels: () => request<any[]>("/config/models"),
  createModel: (config: any) => request<any>("/config/models", { method: "POST", body: JSON.stringify(config) }),
  updateModel: (id: string, config: any) => request<any>(`/config/models/${id}`, { method: "PUT", body: JSON.stringify(config) }),
  deleteModel: (id: string) => request<{ ok: boolean }>(`/config/models/${id}`, { method: "DELETE" }),
  testModel: (id: string) => request<{ ok: boolean; latencyMs?: number; error?: string }>(`/config/models/${id}/test`, { method: "POST" }),
  listSubagents: () => request<any[]>("/config/agents"),
  createSubagent: (config: any) => request<any>("/config/agents", { method: "POST", body: JSON.stringify(config) }),
  deleteSubagent: (id: string) => request<{ ok: boolean }>(`/config/agents/${id}`, { method: "DELETE" }),

  // MCP
  listMCPs: () => request<any[]>("/config/mcp"),
  createMCP: (config: any) => request<any>("/config/mcp", { method: "POST", body: JSON.stringify(config) }),
  updateMCP: (id: string, config: any) => request<any>(`/config/mcp/${id}`, { method: "PUT", body: JSON.stringify(config) }),
  deleteMCP: (id: string) => request<{ ok: boolean }>(`/config/mcp/${id}`, { method: "DELETE" }),
  testMCP: (id: string) => request<{ ok: boolean; error?: string }>(`/config/mcp/${id}/test`, { method: "POST" }),

  // Skills
  listSkills: () => request<any[]>("/config/skills"),
  createSkill: (config: any) => request<any>("/config/skills", { method: "POST", body: JSON.stringify(config) }),
  toggleSkill: (id: string) => request<{ ok: boolean; enabled: boolean }>(`/config/skills/${id}/toggle`, { method: "POST" }),
  deleteSkill: (id: string) => request<{ ok: boolean }>(`/config/skills/${id}`, { method: "DELETE" }),

  // Container
  getContainerConfig: () => request<any>("/config/container/config"),
  updateContainerConfig: (config: any) => request<any>("/config/container/config", { method: "PUT", body: JSON.stringify(config) }),
  getContainerStatus: () => request<any>("/config/container/status"),
  startContainer: () => request<{ ok: boolean }>("/config/container/start", { method: "POST" }),
  stopContainer: () => request<{ ok: boolean }>("/config/container/stop", { method: "POST" }),
  executeInContainer: (command: string, options?: any) => request<any>("/config/container/execute", { method: "POST", body: JSON.stringify({ command, options }) }),

  // Chat
  listChatSessions: () => request<any[]>("/chat/sessions"),
  createChatSession: (modelConfigId?: string) => request<any>("/chat/sessions", { method: "POST", body: JSON.stringify({ modelConfigId }) }),
  deleteChatSession: (id: string) => request<{ ok: boolean }>(`/chat/sessions/${id}`, { method: "DELETE" }),
  getChatMessages: (sessionId: string) => request<any[]>(`/chat/sessions/${sessionId}/messages`),
  sendChatMessage: (sessionId: string, content: string, modelConfigId?: string, signal?: AbortSignal) =>
    request<{ userMessage: any; assistantMessage: any; taskCreated?: { id: string; name: string } }>(
      `/chat/sessions/${sessionId}/messages`,
      { method: "POST", body: JSON.stringify({ content, modelConfigId }), signal }
    ),

  // Writeups
  listWriteups: () => request<any[]>("/writeups"),
  getWriteup: (id: string) => request<any>(`/writeups/${id}`),
  generateWriteup: (taskId: string) => request<any>(`/writeups/generate/${taskId}`, { method: "POST" }),
  updateWriteup: (id: string, content: string) => request<any>(`/writeups/${id}`, { method: "PUT", body: JSON.stringify({ contentMarkdown: content }) }),
  deleteWriteup: (id: string) => request<{ ok: boolean }>(`/writeups/${id}`, { method: "DELETE" }),

  // Settings
  getSettings: () => request<any>("/settings"),
  updateSettings: (settings: any) => request<any>("/settings", { method: "PUT", body: JSON.stringify(settings) }),
};
