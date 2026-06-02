import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

export function SubAgentConfig() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setAgents(await api.listSubagents()); } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createSubagent({ name, description, systemPrompt });
      setShowForm(false); setName(""); setDescription(""); setSystemPrompt("");
      refresh();
    } catch (err: any) {
      setError(err.message || "Failed to create sub-agent");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this subagent?")) return;
    await api.deleteSubagent(id);
    refresh();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Sub-Agent Configuration</h1>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-accent-blue text-bg-primary rounded text-sm font-medium">
          {showForm ? "Cancel" : "+ Add Sub-Agent"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 p-4 bg-bg-surface border border-border rounded-lg space-y-3 max-w-xl">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name (e.g., researcher)"
            className="w-full px-3 py-2 bg-bg-elevated border border-border rounded text-text-primary focus:border-accent-blue focus:outline-none" required />
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description"
            className="w-full px-3 py-2 bg-bg-elevated border border-border rounded text-text-primary focus:border-accent-blue focus:outline-none" required />
          <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="System prompt..." rows={4}
            className="w-full px-3 py-2 bg-bg-elevated border border-border rounded text-text-primary focus:border-accent-blue focus:outline-none font-mono text-sm" required />
          {error && (
            <div className="px-3 py-2 bg-accent-red/10 border border-accent-red/30 rounded text-accent-red text-sm">
              {error}
            </div>
          )}
          <button type="submit" className="px-4 py-2 bg-accent-blue text-bg-primary rounded font-medium">Save</button>
        </form>
      )}

      {loading ? <p className="text-text-secondary">Loading...</p> : agents.length === 0 ? (
        <p className="text-text-secondary">No sub-agents configured.</p>
      ) : (
        <div className="space-y-2">
          {agents.map((a) => (
            <div key={a.id} className="flex items-center justify-between p-3 bg-bg-surface border border-border rounded-lg">
              <div>
                <span className="font-semibold">{a.name}</span>
                <span className="text-text-secondary text-sm ml-2">{a.description}</span>
              </div>
              <button onClick={() => handleDelete(a.id)} className="px-2 py-1 bg-bg-elevated border border-border rounded text-xs text-accent-red hover:border-accent-red">Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
