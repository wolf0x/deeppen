import { useState, useEffect } from "react";
import type { StreamEvent } from "@deeppen/shared";

const typeConfig: Record<string, { icon: string; color: string; label: string }> = {
  "agent-start": { icon: "▶", color: "text-accent-blue", label: "Agent" },
  "agent-think": { icon: "🧠", color: "text-accent-purple", label: "Thinking" },
  "agent-response": { icon: "💬", color: "text-text-primary", label: "Response" },
  "tool-call": { icon: "🔧", color: "text-accent-blue", label: "Tool" },
  "tool-result": { icon: "✅", color: "text-accent-green", label: "Result" },
  "subagent-spawn": { icon: "📁", color: "text-accent-orange", label: "Subagent" },
  "subagent-return": { icon: "↩", color: "text-accent-purple", label: "Return" },
  "flag-found": { icon: "🚩", color: "text-accent-green", label: "FLAG" },
  "flag-submitted": { icon: "📤", color: "text-accent-blue", label: "Submitted" },
  "flag-accepted": { icon: "✅", color: "text-accent-green", label: "ACCEPTED" },
  "flag-rejected": { icon: "❌", color: "text-accent-red", label: "REJECTED" },
  "rabbit-hole-escape": { icon: "🐰", color: "text-accent-orange", label: "Pivot" },
  "task-complete": { icon: "✅", color: "text-accent-green", label: "Complete" },
  "task-error": { icon: "❌", color: "text-accent-red", label: "Error" },
};

export function TreeNode({ event, children, defaultExpanded = true }: {
  event: StreamEvent;
  children?: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const config = typeConfig[event.type] ?? { icon: "•", color: "text-text-secondary", label: event.type };
  const hasChildren = !!children;

  useEffect(() => {
    if (event.status === "complete" && event.depth > 1) {
      const timer = setTimeout(() => setExpanded(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [event.status, event.depth]);

  useEffect(() => {
    if (event.type.startsWith("flag-") || event.type === "task-error" || event.type === "rabbit-hole-escape") {
      setExpanded(true);
    }
  }, [event.type]);

  const content = event.data.content ?? event.data.flag ?? event.data.error ?? "";
  const toolInfo = event.type === "tool-call" ? `: ${event.data.toolName}` : event.type === "tool-result" ? ` (${event.data.toolName})` : "";

  return (
    <div>
      <div
        className="flex items-center gap-2 py-0.5 hover:bg-bg-elevated rounded px-1 cursor-default"
        style={{ paddingLeft: `${event.depth * 20}px` }}
      >
        {hasChildren ? (
          <button onClick={() => setExpanded(!expanded)} className="w-4 text-text-secondary text-xs">
            {expanded ? "▼" : "▶"}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className={config.color}>{config.icon}</span>
        <span className={`${config.color} text-xs font-medium`}>{config.label}</span>
        <span className="text-text-secondary text-xs">{toolInfo}</span>
        {event.status === "running" && <span className="w-2 h-2 bg-accent-blue rounded-full animate-pulse" />}
        {content && (
          <span className="text-text-secondary text-xs truncate max-w-md">
            {typeof content === "string" ? content.slice(0, 120) : JSON.stringify(content).slice(0, 120)}
          </span>
        )}
        {event.type === "flag-found" && event.data.flag && (
          <span className="bg-accent-green/20 text-accent-green px-2 py-0.5 rounded text-xs font-bold">{event.data.flag}</span>
        )}
      </div>
      {expanded && hasChildren && <div className="border-l border-border ml-4">{children}</div>}
    </div>
  );
}
