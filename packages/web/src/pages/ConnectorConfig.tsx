import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

export function ConnectorConfig() {
  const [connectors, setConnectors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [authType, setAuthType] = useState("bearer");
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; error?: string }>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/config/connectors");
      setConnectors(await res.json());
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/config/connectors", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, baseUrl, authType,
        endpoints: { listChallenges: { method: "GET", path: "/challenges" }, submitFlag: { method: "POST", path: "/submit" } },
        responseParsing: { challengeListPath: "data", flagSubmitResultPath: "accepted", flagAcceptedValue: "true" },
      }),
    });
    setShowForm(false); setName(""); setBaseUrl("");
    refresh();
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const res = await fetch(`/api/config/connectors/${id}/test`, { method: "POST" });
      const result = await res.json();
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } finally { setTesting(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete?")) return;
    await fetch(`/api/config/connectors/${id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">API Connectors</h1>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-accent-blue text-bg-primary rounded text-sm font-medium">
          {showForm ? "Cancel" : "+ Add Connector"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 p-4 bg-bg-surface border border-border rounded-lg space-y-3 max-w-xl">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Connector name"
            className="w-full px-3 py-2 bg-bg-elevated border border-border rounded text-text-primary focus:border-accent-blue focus:outline-none" required />
          <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="Base URL (https://api.example.com)"
            className="w-full px-3 py-2 bg-bg-elevated border border-border rounded text-text-primary focus:border-accent-blue focus:outline-none" required />
          <select value={authType} onChange={(e) => setAuthType(e.target.value)}
            className="w-full px-3 py-2 bg-bg-elevated border border-border rounded text-text-primary focus:border-accent-blue focus:outline-none">
            <option value="bearer">Bearer Token</option>
            <option value="api-key">API Key</option>
            <option value="cookie">Cookie</option>
          </select>
          <button type="submit" className="px-4 py-2 bg-accent-blue text-bg-primary rounded font-medium">Save</button>
        </form>
      )}

      {loading ? <p className="text-text-secondary">Loading...</p> : connectors.length === 0 ? (
        <p className="text-text-secondary">No connectors configured.</p>
      ) : (
        <div className="space-y-2">
          {connectors.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-3 bg-bg-surface border border-border rounded-lg">
              <div>
                <span className="font-semibold">{c.name}</span>
                <span className="text-text-secondary text-sm ml-2">{c.baseUrl}</span>
                <span className="text-text-secondary text-xs ml-2">({c.authType})</span>
              </div>
              <div className="flex items-center gap-2">
                {testResults[c.id] && (
                  <span className={`text-xs ${testResults[c.id].ok ? "text-accent-green" : "text-accent-red"}`}>
                    {testResults[c.id].ok ? "OK" : `Error: ${testResults[c.id].error}`}
                  </span>
                )}
                <button onClick={() => handleTest(c.id)} disabled={testing === c.id}
                  className="px-2 py-1 bg-bg-elevated border border-border rounded text-xs hover:border-accent-blue disabled:opacity-50">
                  {testing === c.id ? "Testing..." : "Test"}
                </button>
                <button onClick={() => handleDelete(c.id)}
                  className="px-2 py-1 bg-bg-elevated border border-border rounded text-xs text-accent-red hover:border-accent-red">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
