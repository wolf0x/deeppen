import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useTask } from "../hooks/useTasks.js";
import { useSSE } from "../hooks/useSSE.js";
import { StreamTree } from "../components/task/StreamTree.js";
import { TaskControls } from "../components/task/TaskControls.js";
import { api } from "../lib/api.js";

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const { task, loading, refresh } = useTask(id!);
  useSSE(id);
  const [now, setNow] = useState(Date.now());

  // Tick elapsed timer every second while task is running
  useEffect(() => {
    if (task?.status !== "running") return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [task?.status]);

  const handleGenerateWriteup = async () => {
    try {
      await api.generateWriteup(id!);
      window.location.href = "/writeups";
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div className="p-6 text-text-secondary">Loading...</div>;
  if (!task) return <div className="p-6 text-accent-red">Task not found</div>;

  const elapsed = task.startedAt
    ? Math.round((now - new Date(task.startedAt).getTime()) / 1000)
    : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Fixed header */}
      <div className="flex-shrink-0 p-4 border-b border-border">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold truncate">{task.name}</h1>
              <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded ${
                task.status === "running" ? "bg-accent-green/20 text-accent-green" :
                task.status === "completed" ? "bg-accent-green/20 text-accent-green" :
                task.status === "stopped" || task.status === "failed" ? "bg-accent-red/20 text-accent-red" :
                "bg-bg-elevated text-text-secondary"
              }`}>
                {task.status.toUpperCase()}
              </span>
              {task.status === "running" && (
                <span className="flex-shrink-0 text-xs text-text-secondary">{elapsed}s elapsed</span>
              )}
            </div>
            <p className="text-sm text-text-secondary mt-1 line-clamp-2">{task.challengeDescription}</p>
          </div>
          <div className="flex-shrink-0 flex items-center gap-2">
            <TaskControls task={task} onRefresh={refresh} />
            {task.status === "completed" && (
              <button onClick={handleGenerateWriteup}
                className="px-3 py-1.5 bg-accent-purple text-bg-primary rounded text-sm font-medium">
                📄 Generate Writeup
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {task.flag && (
          <div className="px-5 py-4 bg-accent-green/15 border-2 border-accent-green/40 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-accent-green text-lg">{"\u{1F6A9}"}</span>
              <span className="text-accent-green font-bold text-sm uppercase tracking-wide">
                {task.flag.includes(",") ? `${task.flag.split(",").length} Flags Found` : "Flag Found"}
              </span>
            </div>
            {task.flag.includes(",") ? (
              <div className="space-y-1">
                {task.flag.split(",").map((f: string, i: number) => (
                  <p key={i} className="text-accent-green font-mono text-sm break-all select-all">
                    {i + 1}. {f.trim()}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-accent-green font-mono text-lg break-all select-all">{task.flag}</p>
            )}
          </div>
        )}

        {task.error && (
          <div className="px-4 py-3 bg-accent-red/10 border border-accent-red/30 rounded-lg">
            <span className="text-accent-red font-bold">{"\u{26A0}\u{FE0F}"} Error: </span>
            <span className="text-accent-red text-sm">{task.error}</span>
          </div>
        )}

        <StreamTree />
      </div>
    </div>
  );
}
