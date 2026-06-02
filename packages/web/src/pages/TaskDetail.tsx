import { useParams } from "react-router-dom";
import { useTask } from "../hooks/useTasks.js";
import { useSSE } from "../hooks/useSSE.js";
import { StreamTree } from "../components/task/StreamTree.js";
import { TaskControls } from "../components/task/TaskControls.js";

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const { task, loading, refresh } = useTask(id!);
  useSSE(id);

  if (loading) return <div className="p-6 text-text-secondary">Loading...</div>;
  if (!task) return <div className="p-6 text-accent-red">Task not found</div>;

  const elapsed = task.startedAt
    ? Math.round((Date.now() - new Date(task.startedAt).getTime()) / 1000)
    : 0;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">{task.name}</h1>
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
              task.status === "running" ? "bg-accent-green/20 text-accent-green" :
              task.status === "completed" ? "bg-accent-green/20 text-accent-green" :
              "bg-bg-elevated text-text-secondary"
            }`}>
              {task.status.toUpperCase()}
            </span>
            {task.status === "running" && (
              <span className="text-xs text-text-secondary">{elapsed}s elapsed</span>
            )}
          </div>
          <p className="text-sm text-text-secondary mt-1">{task.challengeDescription}</p>
        </div>
        <TaskControls task={task} onRefresh={refresh} />
      </div>

      {task.flag && (
        <div className="mx-4 mt-4 px-4 py-3 bg-accent-green/10 border border-accent-green/30 rounded-lg">
          <span className="text-accent-green font-bold">{"\u{1F6A9}"} FLAG: </span>
          <span className="text-accent-green font-mono">{task.flag}</span>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        <StreamTree />
      </div>
    </div>
  );
}
