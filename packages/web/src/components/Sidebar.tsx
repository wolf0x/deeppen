import { Link, useLocation } from "react-router-dom";

const nav = [
  { path: "/", label: "Tasks", icon: "📋" },
  { path: "/tasks/new", label: "New Task", icon: "➕" },
  { path: "/config/models", label: "Models", icon: "🤖" },
];

export function Sidebar() {
  const location = useLocation();
  return (
    <aside className="w-56 bg-bg-surface border-r border-border flex flex-col">
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-bold text-accent-blue">🏴‍☠️ DeepPen</h1>
        <p className="text-xs text-text-secondary">CTF Auto-Solver</p>
      </div>
      <nav className="flex-1 p-2">
        {nav.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center gap-2 px-3 py-2 rounded text-sm mb-1 transition-colors ${
              location.pathname === item.path
                ? "bg-bg-elevated text-text-primary"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
