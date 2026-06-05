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

// Types that can expand to show full content inline
const EXPANDABLE_TYPES = new Set(["tool-call", "tool-result", "agent-response", "agent-think"]);

export function TreeNode({ event, children, defaultExpanded = true }: {
  event: StreamEvent;
  children?: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const config = typeConfig[event.type] ?? { icon: "•", color: "text-text-secondary", label: event.type };
  const hasChildren = !!children;
  const canExpand = hasChildren || EXPANDABLE_TYPES.has(event.type);

  // Auto-collapse only agent-think events
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

  // Extract content based on event type
  let fullContent = "";
  let preview = "";
  let detail = "";

  if (event.type === "tool-call") {
    preview = data.toolName ?? "";
    if (data.toolInput) {
      const inputObj = data.toolInput as any;
      fullContent = typeof inputObj === "string" ? inputObj : JSON.stringify(inputObj, null, 2);
      detail = fullContent.length > 80 ? fullContent.slice(0, 80) + "…" : fullContent;
    }
  } else if (event.type === "tool-result") {
    fullContent = data.toolOutput ?? data.error ?? "";
    if (data.error) fullContent = `❌ ${fullContent}`;
    preview = fullContent.length > 100 ? fullContent.slice(0, 100) + "…" : fullContent;
  } else if (event.type === "agent-response") {
    fullContent = data.content ?? "";
    preview = fullContent.length > 120 ? fullContent.slice(0, 120) + "…" : fullContent;
  } else {
    fullContent = data.content ?? data.flag ?? data.error ?? "";
    preview = fullContent.length > 120 ? fullContent.slice(0, 120) + "…" : fullContent;
  }

  const hasExpandableContent = fullContent.length > 0;

  return (
    <div>
      {/* Header row */}
      <div
        className={`flex items-center gap-2 py-0.5 hover:bg-bg-elevated rounded px-1 ${canExpand ? "cursor-pointer" : "cursor-default"}`}
        style={{ paddingLeft: `${event.depth * 20}px` }}
        onClick={() => { if (canExpand) setExpanded(prev => !prev); }}
      >
        {/* Expand/collapse toggle */}
        <span className="w-4 text-text-secondary text-xs flex-shrink-0">
          {canExpand ? (expanded ? "▼" : "▶") : ""}
        </span>

        <span className={config.color}>{config.icon}</span>
        <span className={`${config.color} text-xs font-medium flex-shrink-0`}>{config.label}</span>

        {/* Tool name badge */}
        {event.type === "tool-call" && data.toolName && (
          <span className="bg-accent-blue/20 text-accent-blue px-1.5 py-0.5 rounded text-xs font-mono flex-shrink-0">
            {data.toolName}
          </span>
        )}

        {/* Running indicator */}
        {event.status === "running" && <span className="w-2 h-2 bg-accent-blue rounded-full animate-pulse flex-shrink-0" />}

        {/* Inline preview (truncated, only when collapsed) */}
        {!expanded && preview && (
          <span className={`text-xs truncate max-w-lg ${
            event.type === "tool-result" ? "text-text-secondary font-mono" :
            event.type === "flag-found" ? "text-accent-green font-bold" :
            "text-text-secondary"
          }`}>
            {preview}
          </span>
        )}

        {/* Flag badge */}
        {event.type === "flag-found" && data.flag && (
          <span className="bg-accent-green/20 text-accent-green px-2 py-0.5 rounded text-sm font-bold font-mono select-all">🚩 {data.flag}</span>
        )}
      </div>

      {/* Expanded content block */}
      {expanded && hasExpandableContent && (
        <div className="ml-8 my-1">
          <pre className="text-xs p-2 rounded bg-bg-elevated border border-border overflow-auto max-h-[600px] whitespace-pre-wrap break-words font-mono text-text-secondary">
            {fullContent}
          </pre>
        </div>
      )}

      {/* Children (sub-nodes from parent-child relationships) */}
      {expanded && hasChildren && <div className="border-l border-border ml-4">{children}</div>}
    </div>
  );
}
