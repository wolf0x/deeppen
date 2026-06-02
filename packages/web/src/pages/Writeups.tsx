import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

export function Writeups() {
  const [writeups, setWriteups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setWriteups(await api.listWriteups());
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const handleView = async (id: string) => {
    setSelected(await api.getWriteup(id));
  };

  const handleExport = (id: string, title: string) => {
    const a = document.createElement("a");
    a.href = `/api/writeups/${id}/export`;
    a.download = `${title}.md`;
    a.click();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this writeup?")) return;
    await api.deleteWriteup(id);
    if (selected?.id === id) setSelected(null);
    refresh();
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Writeups</h1>

      {loading ? <p className="text-text-secondary">Loading...</p> : writeups.length === 0 ? (
        <p className="text-text-secondary">No writeups yet. Complete a task to generate one.</p>
      ) : (
        <div className="flex gap-6">
          <div className="w-80 space-y-2">
            {writeups.map((w) => (
              <div key={w.id} className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                selected?.id === w.id ? "border-accent-blue bg-bg-elevated" : "border-border bg-bg-surface hover:border-accent-blue"
              }`} onClick={() => handleView(w.id)}>
                <h3 className="font-semibold text-sm">{w.title}</h3>
                <p className="text-text-secondary text-xs">{new Date(w.createdAt).toLocaleString()}</p>
                <div className="flex gap-1 mt-2">
                  <button onClick={(e) => { e.stopPropagation(); handleExport(w.id, w.title); }}
                    className="px-2 py-0.5 bg-bg-elevated border border-border rounded text-xs hover:border-accent-blue">Export</button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(w.id); }}
                    className="px-2 py-0.5 bg-bg-elevated border border-border rounded text-xs text-accent-red hover:border-accent-red">Delete</button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex-1">
            {selected ? (
              <div className="bg-bg-surface border border-border rounded-lg p-6">
                <h2 className="text-lg font-bold mb-4">{selected.title}</h2>
                <div className="prose prose-invert max-w-none font-mono text-sm whitespace-pre-wrap">
                  {selected.contentMarkdown}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-text-secondary">
                Select a writeup to view
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
