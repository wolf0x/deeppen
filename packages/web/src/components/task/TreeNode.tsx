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

  // Auto-collapse only agent-think events (not tool events)
  useEffect(() => {
    if (event.status === "complete" && event.type === "agent-think") {
      const timer = setTimeout(() => setExpanded(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [event.status, event.type]);

  // Always expand important events
  useEffect(() => {
    if (event.type.startsWith("flag-") || event.type === "task-error" || event.type === "rabbit-hole-escape") {
      setExpanded(true);
    }
  }, [event.type]);

  const data = event.data ?? {};

  // Build display content based on event type
  let content = "";
  let detail = "";

  if (event.type === "tool-call") {
    // Show tool name and input
    content = data.toolName ?? "";
    if (data.toolInput) {
      const inputObj = data.toolInput as any;
      const input = typeof inputObj === "string"
        ? inputObj
        : inputObj.command ?? inputObj.url ?? JSON.stringify(inputObj);
      detail = input.slice(0, 200);
    }
  } else if (event.type === "tool-result") {
    // Show tool output
    content = data.toolOutput ?? data.error ?? "";
    if (data.error) content = `❌ ${content}`;
  } else {
    // agent-response, agent-think, flag-found, etc.
    content = data.content ?? data.flag ?? data.error ?? "";
  }

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

        {/* Tool name badge for tool-call */}
        {event.type === "tool-call" && data.toolName && (
          <span className="bg-accent-blue/20 text-accent-blue px-1.5 py-0.5 rounded text-xs font-mono">
            {data.toolName}
          </span>
        )}

        {/* Running indicator */}
        {event.status === "running" && <span className="w-2 h-2 bg-accent-blue rounded-full animate-pulse" />}

        {/* Detail (tool input, etc.) */}
        {detail && (
          <span className="text-text-secondary/70 text-xs font-mono truncate max-w-sm">
            {detail}
          </span>
        )}

        {/* Content (tool output, response text, etc.) */}
        {content && (
          <span className={`text-xs truncate max-w-md ${
            event.type === "tool-result" ? "text-text-secondary font-mono" :
            event.type === "flag-found" ? "text-accent-green font-bold" :
            "text-text-secondary"
          }`}>
            {typeof content === "string" ? content.slice(0, 200) : JSON.stringify(content).slice(0, 200)}
          </span>
        )}

        {/* Flag badge */}
        {event.type === "flag-found" && data.flag && (
          <span className="bg-accent-green/20 text-accent-green px-2 py-0.5 rounded text-xs font-bold">{data.flag}</span>
        )}
      </div>
      {expanded && hasChildren && <div className="border-l border-border ml-4">{children}</div>}
    </div>
  );
}
