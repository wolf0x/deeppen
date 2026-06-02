import { Link } from "react-router-dom";
import { useTasks } from "../hooks/useTasks.js";
import { TaskCard } from "../components/task/TaskCard.js";

export function Dashboard() {
  const { tasks, loading, refresh } = useTasks();

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-text-secondary text-sm">
            {tasks.length} task{tasks.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="px-3 py-1.5 bg-bg-surface border border-border rounded text-sm hover:border-accent-blue transition-colors"
          >
            Refresh
          </button>
          <Link
            to="/tasks/new"
            className="px-3 py-1.5 bg-accent-blue text-bg-primary rounded text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + New Task
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-text-secondary">Loading...</p>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-text-secondary mb-4">No tasks yet</p>
          <Link
            to="/tasks/new"
            className="px-4 py-2 bg-accent-blue text-bg-primary rounded font-medium"
          >
            Create your first task
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
