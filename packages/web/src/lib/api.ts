const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
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
  listModels: () => request<any[]>("/config/models"),
  createModel: (config: any) => request<any>("/config/models", { method: "POST", body: JSON.stringify(config) }),
  updateModel: (id: string, config: any) => request<any>(`/config/models/${id}`, { method: "PUT", body: JSON.stringify(config) }),
  deleteModel: (id: string) => request<{ ok: boolean }>(`/config/models/${id}`, { method: "DELETE" }),
  testModel: (id: string) => request<{ ok: boolean; latencyMs?: number; error?: string }>(`/config/models/${id}/test`, { method: "POST" }),
  listSubagents: () => request<any[]>("/config/agents"),
  createSubagent: (config: any) => request<any>("/config/agents", { method: "POST", body: JSON.stringify(config) }),
  deleteSubagent: (id: string) => request<{ ok: boolean }>(`/config/agents/${id}`, { method: "DELETE" }),
};
