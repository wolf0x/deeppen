import { useState } from "react";
import { useModels } from "../hooks/useModels.js";
import { api } from "../lib/api.js";
import type { ModelProvider } from "@deeppen/shared";

const providers: { value: ModelProvider; label: string }[] = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "azure-openai", label: "Azure OpenAI" },
  { value: "openai-compatible", label: "OpenAI Compatible" },
  { value: "ollama", label: "Ollama" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "minimax", label: "MiniMax" },
  { value: "xiaomimio", label: "Xiaomi MiMo" },
  { value: "zhipu", label: "Zhipu (GLM)" },
  { value: "openrouter", label: "OpenRouter" },
];

export function ModelConfig() {
  const { models, loading, refresh } = useModels();
  const [showForm, setShowForm] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; latencyMs?: number; error?: string }>>({});
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<ModelProvider>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelId, setModelId] = useState("");

  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createModel({ name, provider, apiKey, baseUrl, modelId });
      setShowForm(false);
      setName(""); setApiKey(""); setBaseUrl(""); setModelId("");
      refresh();
    } catch (err: any) {
      setError(err.message || "Failed to create model");
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const result = await api.testModel(id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } finally {
      setTesting(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this model config?")) return;
    await api.deleteModel(id);
    refresh();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Model Configuration</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 bg-accent-blue text-bg-primary rounded text-sm font-medium">
          {showForm ? "Cancel" : "+ Add Model"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 p-4 bg-bg-surface border border-border rounded-lg space-y-3 max-w-xl">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Display name (e.g., Claude Sonnet)"
            className="w-full px-3 py-2 bg-bg-elevated border border-border rounded text-text-primary focus:border-accent-blue focus:outline-none"
            required />
          <select value={provider} onChange={(e) => setProvider(e.target.value as ModelProvider)}
            className="w-full px-3 py-2 bg-bg-elevated border border-border rounded text-text-primary focus:border-accent-blue focus:outline-none">
            {providers.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder="API Key"
            className="w-full px-3 py-2 bg-bg-elevated border border-border rounded text-text-primary focus:border-accent-blue focus:outline-none" />
          <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="Base URL (optional)"
            className="w-full px-3 py-2 bg-bg-elevated border border-border rounded text-text-primary focus:border-accent-blue focus:outline-none" />
          <input type="text" value={modelId} onChange={(e) => setModelId(e.target.value)}
            placeholder="Model ID (e.g., claude-sonnet-4-6)"
            className="w-full px-3 py-2 bg-bg-elevated border border-border rounded text-text-primary focus:border-accent-blue focus:outline-none"
            required />
          {error && (
            <div className="px-3 py-2 bg-accent-red/10 border border-accent-red/30 rounded text-accent-red text-sm">
              {error}
            </div>
          )}
          <button type="submit" className="px-4 py-2 bg-accent-blue text-bg-primary rounded font-medium">Save</button>
        </form>
      )}

      {loading ? (
        <p className="text-text-secondary">Loading...</p>
      ) : models.length === 0 ? (
        <p className="text-text-secondary">No models configured yet.</p>
      ) : (
        <div className="space-y-2">
          {models.map((m) => (
            <div key={m.id} className="flex items-center justify-between p-3 bg-bg-surface border border-border rounded-lg">
              <div>
                <span className="font-semibold">{m.name}</span>
                <span className="text-text-secondary text-sm ml-2">{m.provider}</span>
                <span className="text-text-secondary text-sm ml-2">{m.modelId}</span>
              </div>
              <div className="flex items-center gap-2">
                {testResults[m.id] && (
                  <span className={`text-xs ${testResults[m.id].ok ? "text-accent-green" : "text-accent-red"}`}>
                    {testResults[m.id].ok ? `✅ ${testResults[m.id].latencyMs}ms` : `❌ ${testResults[m.id].error}`}
                  </span>
                )}
                <button onClick={() => handleTest(m.id)} disabled={testing === m.id}
                  className="px-2 py-1 bg-bg-elevated border border-border rounded text-xs hover:border-accent-blue disabled:opacity-50">
                  {testing === m.id ? "Testing..." : "Test"}
                </button>
                <button onClick={() => handleDelete(m.id)}
                  className="px-2 py-1 bg-bg-elevated border border-border rounded text-xs text-accent-red hover:border-accent-red">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
