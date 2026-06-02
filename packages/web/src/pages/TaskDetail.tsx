import { useParams } from "react-router-dom";
import { useTask } from "../hooks/useTasks.js";
import { useSSE } from "../hooks/useSSE.js";
import { StreamTree } from "../components/task/StreamTree.js";
import { TaskControls } from "../components/task/TaskControls.js";
import { api } from "../lib/api.js";

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const { task, loading, refresh } = useTask(id!);
  useSSE(id);

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
    ? Math.round((Date.now() - new Date(task.startedAt).getTime()) / 1000)
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
          <div className="px-4 py-3 bg-accent-green/10 border border-accent-green/30 rounded-lg">
            <span className="text-accent-green font-bold">{"\u{1F6A9}"} FLAG: </span>
            <span className="text-accent-green font-mono">{task.flag}</span>
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
