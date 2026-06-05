import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

export function Writeups() {
  const [writeups, setWriteups] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [w, t] = await Promise.all([api.listWriteups(), api.listTasks()]);
      setWriteups(w);
      setTasks(t);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const handleView = async (id: string) => {
    setSelected(await api.getWriteup(id));
  };

  const handleGenerate = async (taskId: string) => {
    setGenerating(taskId);
    try {
      const w = await api.generateWriteup(taskId);
      setSelected(w);
      refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setGenerating(null);
    }
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

  // Tasks that are completed/stopped/failed and don't have a writeup yet
  const writeupTaskIds = new Set(writeups.map((w: any) => w.taskId));
  const solvableTasks = tasks.filter(
    (t: any) => (t.status === "completed" || t.status === "stopped" || t.status === "failed") && !writeupTaskIds.has(t.id)
  );

  if (loading) return <div className="p-6 text-text-secondary">Loading...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-6 pb-0">
        <h1 className="text-2xl font-bold mb-4">Writeups</h1>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {/* Generate section — tasks without writeups */}
        {solvableTasks.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-text-secondary mb-2">Generate writeup from:</h2>
            <div className="space-y-1">
              {solvableTasks.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between bg-bg-surface border border-border rounded px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium truncate">{t.name}</span>
                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                      t.status === "completed" ? "bg-accent-green/20 text-accent-green" :
                      t.status === "stopped" ? "bg-accent-red/20 text-accent-red" :
                      "bg-bg-elevated text-text-secondary"
                    }`}>{t.status}</span>
                    {t.flag && <span className="ml-2 text-xs text-accent-green font-mono">🚩 {t.flag}</span>}
                  </div>
                  <button
                    onClick={() => handleGenerate(t.id)}
                    disabled={generating === t.id}
                    className="ml-3 px-3 py-1 bg-accent-purple text-bg-primary rounded text-xs font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {generating === t.id ? "Generating..." : "📄 Generate"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Existing writeups */}
        {writeups.length === 0 && solvableTasks.length === 0 ? (
          <div className="text-center py-12 text-text-secondary">
            <p className="text-lg mb-2">No writeups yet</p>
            <p className="text-sm">Complete a task to generate a writeup</p>
          </div>
        ) : writeups.length === 0 ? null : (
          <div className="flex gap-6">
            <div className="w-80 space-y-2 flex-shrink-0">
              {writeups.map((w) => (
                <div key={w.id} className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selected?.id === w.id ? "border-accent-blue bg-bg-elevated" : "border-border bg-bg-surface hover:border-accent-blue"
                }`} onClick={() => handleView(w.id)}>
                  <h3 className="font-semibold text-sm truncate">{w.title}</h3>
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

            <div className="flex-1 min-w-0">
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
    </div>
  );
}
