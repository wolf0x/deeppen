import { useState, useEffect } from "react";
import type { StreamEvent } from "@deeppen/shared";

// ─── Tool display config ───────────────────────────────────────
const TOOL_DISPLAY: Record<string, { icon: string; color: string; label: string }> = {
  execute:     { icon: "⌨️", color: "text-accent-orange", label: "Execute" },
  web_fetch:   { icon: "🌐", color: "text-accent-blue",   label: "Fetch" },
  curl:        { icon: "📡", color: "text-accent-blue",   label: "Curl" },
  nmap:        { icon: "🔍", color: "text-accent-purple",  label: "Nmap" },
  read_file:   { icon: "📖", color: "text-accent-blue",   label: "Read" },
  write_file:  { icon: "📝", color: "text-accent-green",  label: "Write" },
  ls:          { icon: "📂", color: "text-text-secondary", label: "List" },
  grep:        { icon: "🔎", color: "text-accent-purple",  label: "Grep" },
  glob:        { icon: "🔎", color: "text-accent-purple",  label: "Glob" },
  task:        { icon: "🤖", color: "text-accent-orange", label: "Task" },
  write_todos: { icon: "📋", color: "text-text-secondary", label: "Plan" },
};

// ─── Build concise tool summary ────────────────────────────────
function toolSummary(name: string, input: any): string {
  if (!input) return name;
  const obj = typeof input === "string" ? {} : input;
  switch (name) {
    case "execute":    return obj.command?.slice(0, 80) ?? "execute";
    case "web_fetch":  return obj.url ?? "fetch";
    case "curl":       return obj.url ?? "curl";
    case "read_file":  return obj.file_path ?? "read";
    case "write_file": return obj.file_path ?? "write";
    case "ls":         return obj.path ?? "ls";
    case "grep":       return `"${obj.pattern ?? ""}" ${obj.path ?? ""}`.trim();
    case "glob":       return obj.pattern ?? "glob";
    case "task":       return obj.description?.slice(0, 60) ?? "subagent";
    case "write_todos": return `${obj.todos?.length ?? 0} tasks`;
    default:           return name;
  }
}

function resultSummary(name: string, output: string): string {
  if (!output) return "";
  const lines = output.split("\n").filter(l => l.trim());
  if (name === "grep" || name === "glob") {
    return `${lines.length} matches`;
  }
  if (lines.length > 3) {
    return `${lines.length} lines`;
  }
  return lines[0]?.slice(0, 100) ?? "";
}

// ─── Status dot ────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  if (status === "running") {
    return (
      <span className="relative flex h-2 w-2 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-blue opacity-60" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-blue" />
      </span>
    );
  }
  if (status === "error") {
    return <span className="w-2 h-2 bg-accent-red rounded-full flex-shrink-0" />;
  }
  return null;
}

// ─── Main TreeNode ─────────────────────────────────────────────
export function TreeNode({ event, children, defaultExpanded = true, isLatest = false }: {
  event: StreamEvent;
  children?: React.ReactNode;
  defaultExpanded?: boolean;
  isLatest?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const data = event.data ?? {};
  const hasChildren = !!children;
  const isRunning = event.status === "running";
  const showPulse = isLatest && isRunning;

  useEffect(() => { setExpanded(defaultExpanded); }, [defaultExpanded]);
  useEffect(() => {
    if (event.type.startsWith("flag-") || event.type === "task-error" || event.type === "task-complete") {
      setExpanded(true);
    }
  }, [event.type]);

  // ─── Render by event type ──────────────────────────────────

  // Agent Thinking / Response — inline text block
  if (event.type === "agent-response" || event.type === "agent-think") {
    const text = data.content ?? "";
    return (
      <div className={`my-2 ${showPulse ? "animate-pulse-subtle" : ""}`}>
        <div className="flex items-start gap-2" style={{ paddingLeft: `${event.depth * 16}px` }}>
          <span className="text-accent-purple flex-shrink-0 mt-0.5">🧠</span>
          <p className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap">
            {text.slice(0, 500)}{text.length > 500 ? "…" : ""}
          </p>
        </div>
      </div>
    );
  }

  // Agent Start
  if (event.type === "agent-start") {
    return (
      <div className="my-2 flex items-center gap-2" style={{ paddingLeft: `${event.depth * 16}px` }}>
        <span className="text-accent-blue">▶</span>
        <span className="text-xs text-accent-blue font-medium">Agent started</span>
        {isRunning && <StatusDot status="running" />}
      </div>
    );
  }

  // Tool Call — single line with tool name and params
  if (event.type === "tool-call") {
    const toolName = data.toolName ?? "unknown";
    const tool = TOOL_DISPLAY[toolName] ?? { icon: "🔧", color: "text-accent-blue", label: toolName };
    const summary = toolSummary(toolName, data.toolInput);

    return (
      <div className={`my-1 ${showPulse ? "animate-pulse-subtle" : ""}`}>
        <div
          className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-bg-elevated transition-colors ${
            isRunning ? "bg-accent-blue/5 border-l-2 border-accent-blue" : ""
          }`}
          style={{ paddingLeft: `${event.depth * 16 + 4}px` }}
          onClick={() => setExpanded(prev => !prev)}
        >
          <span className="text-xs text-text-secondary/40 w-3">{expanded ? "▾" : "▸"}</span>
          <span className="text-sm flex-shrink-0">{tool.icon}</span>
          <span className={`text-xs font-medium ${tool.color}`}>{tool.label}:</span>
          <span className="text-xs text-text-secondary truncate font-mono">{summary}</span>
          <StatusDot status={event.status} />
        </div>
        {expanded && (
          <div className="ml-8 my-1">
            <pre className="text-xs p-2 rounded bg-bg-elevated border border-border overflow-auto max-h-[400px] whitespace-pre-wrap break-words font-mono text-text-secondary">
              {typeof data.toolInput === "string" ? data.toolInput : JSON.stringify(data.toolInput ?? {}, null, 2)}
            </pre>
          </div>
        )}
        {expanded && hasChildren && (
          <div className="border-l border-border/20 ml-6">{children}</div>
        )}
      </div>
    );
  }

  // Tool Result — concise summary line
  if (event.type === "tool-result") {
    const toolName = data.toolName ?? "unknown";
    const output = data.toolOutput ?? data.error ?? "";
    const isError = !!data.error;
    const summary = isError ? `❌ ${data.error}` : resultSummary(toolName, output);

    return (
      <div className="my-0.5">
        <div
          className="flex items-center gap-2 py-0.5 px-2 rounded cursor-pointer hover:bg-bg-elevated transition-colors"
          style={{ paddingLeft: `${event.depth * 16 + 4}px` }}
          onClick={() => setExpanded(prev => !prev)}
        >
          <span className="text-xs text-text-secondary/40 w-3">{expanded ? "▾" : "▸"}</span>
          <span className="text-sm flex-shrink-0">{isError ? "❌" : "✅"}</span>
          <span className={`text-xs ${isError ? "text-accent-red" : "text-accent-green"}`}>
            {summary}
          </span>
        </div>
        {expanded && (
          <div className="ml-8 my-1">
            <pre className="text-xs p-2 rounded bg-bg-elevated border border-border overflow-auto max-h-[400px] whitespace-pre-wrap break-words font-mono text-text-secondary">
              {output}
            </pre>
          </div>
        )}
      </div>
    );
  }

  // Flag Found — highlighted banner
  if (event.type === "flag-found") {
    return (
      <div className="my-2 mx-2 px-3 py-2 bg-accent-green/10 border border-accent-green/30 rounded-lg"
        style={{ marginLeft: `${event.depth * 16}px` }}>
        <div className="flex items-center gap-2">
          <span className="text-lg">🏁</span>
          <span className="text-accent-green font-bold text-sm">Flag Found!</span>
        </div>
        <p className="text-accent-green font-mono text-sm mt-1 select-all break-all">{data.flag}</p>
      </div>
    );
  }

  // Task Complete / Error
  if (event.type === "task-complete" || event.type === "task-error") {
    const isComplete = event.type === "task-complete";
    return (
      <div className={`my-2 mx-2 px-3 py-2 rounded-lg ${
        isComplete ? "bg-accent-green/10 border border-accent-green/30" : "bg-accent-red/10 border border-accent-red/30"
      }`} style={{ marginLeft: `${event.depth * 16}px` }}>
        <div className="flex items-center gap-2">
          <span className="text-lg">{isComplete ? "🎉" : "💥"}</span>
          <span className={`font-bold text-sm ${isComplete ? "text-accent-green" : "text-accent-red"}`}>
            {isComplete ? "Task Complete" : "Task Failed"}
          </span>
        </div>
        {(data.content || data.error) && (
          <p className={`text-xs mt-1 ${isComplete ? "text-accent-green" : "text-accent-red"}`}>
            {data.content ?? data.error}
          </p>
        )}
      </div>
    );
  }

  // Rabbit Hole Escape
  if (event.type === "rabbit-hole-escape") {
    return (
      <div className="my-2 mx-2 px-3 py-2 bg-accent-orange/10 border border-accent-orange/30 rounded-lg"
        style={{ marginLeft: `${event.depth * 16}px` }}>
        <div className="flex items-center gap-2">
          <span>🐰</span>
          <span className="text-accent-orange font-medium text-xs">Pivot</span>
        </div>
        <p className="text-text-secondary text-xs mt-1">{data.content}</p>
      </div>
    );
  }

  // Default fallback
  const text = data.content ?? data.error ?? "";
  if (!text && !hasChildren) return null;

  return (
    <div className="my-0.5" style={{ paddingLeft: `${event.depth * 16}px` }}>
      {text && (
        <div className="flex items-start gap-2 py-0.5 px-2">
          <span className="text-xs text-text-secondary">•</span>
          <span className="text-xs text-text-secondary">{text.slice(0, 150)}</span>
        </div>
      )}
      {hasChildren && (
        <div className="border-l border-border/20 ml-3">{children}</div>
      )}
    </div>
  );
}
