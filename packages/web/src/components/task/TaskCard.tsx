import { Link } from "react-router-dom";

const statusColors: Record<string, string> = {
  created: "bg-bg-elevated text-text-secondary",
  running: "bg-accent-green/20 text-accent-green",
  paused: "bg-accent-orange/20 text-accent-orange",
  stopped: "bg-accent-red/20 text-accent-red",
  completed: "bg-accent-green/20 text-accent-green",
  failed: "bg-accent-red/20 text-accent-red",
};

const categoryIcons: Record<string, string> = {
  web: "🌐", pwn: "💀", crypto: "🔐", forensics: "🔍", misc: "📦", "prompt-injection": "💉",
};

export function TaskCard({ task }: { task: any }) {
  return (
    <Link
      to={`/tasks/${task.id}`}
      className="block bg-bg-surface border border-border rounded-lg p-4 hover:border-accent-blue transition-colors"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span>{categoryIcons[task.category] ?? "📦"}</span>
          <h3 className="font-semibold text-text-primary">{task.name}</h3>
        </div>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[task.status] ?? statusColors.created}`}>
          {task.status}
        </span>
      </div>
      <p className="text-sm text-text-secondary truncate">{task.challengeDescription}</p>
      {task.flag && (
        <div className="mt-2 px-2 py-1 bg-accent-green/10 rounded text-xs text-accent-green">
          🚩 {task.flag}
        </div>
      )}
    </Link>
  );
}
