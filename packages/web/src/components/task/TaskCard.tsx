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
      className="flex items-center gap-4 bg-bg-surface border border-border rounded-lg px-4 py-3 hover:border-accent-blue transition-colors"
    >
      {/* Category icon */}
      <span className="text-lg flex-shrink-0">{categoryIcons[task.category] ?? "📦"}</span>

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-text-primary text-sm truncate">{task.name}</h3>
        <p className="text-xs text-text-secondary truncate mt-0.5">{task.challengeDescription}</p>
      </div>

      {/* Flag if found */}
      {task.flag && (
        <span className="flex-shrink-0 bg-accent-green/10 text-accent-green px-2 py-0.5 rounded text-xs font-mono truncate max-w-[200px]">
          🚩 {task.flag}
        </span>
      )}

      {/* Status badge */}
      <span className={`flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium ${statusColors[task.status] ?? statusColors.created}`}>
        {task.status}
      </span>
    </Link>
  );
}
