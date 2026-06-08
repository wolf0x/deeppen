import { useState, useEffect } from "react";
import type { StreamEvent } from "@deeppen/shared";

// ─── Tool icons & colors ───────────────────────────────────────
const TOOL_ICONS: Record<string, { icon: string; color: string }> = {
  execute: { icon: "⌨️", color: "text-accent-orange" },
  web_fetch: { icon: "🌐", color: "text-accent-blue" },
  curl: { icon: "📡", color: "text-accent-blue" },
  nmap: { icon: "🔍", color: "text-accent-purple" },
  read_file: { icon: "📖", color: "text-text-secondary" },
  write_file: { icon: "📝", color: "text-accent-green" },
  ls: { icon: "📂", color: "text-text-secondary" },
  grep: { icon: "🔎", color: "text-accent-purple" },
  glob: { icon: "🔎", color: "text-accent-purple" },
  task: { icon: "🤖", color: "text-accent-orange" },
  write_todos: { icon: "📋", color: "text-text-secondary" },
};

// ─── Event type config ─────────────────────────────────────────
const TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  "agent-start":          { icon: "▶",  color: "text-accent-blue",   label: "Agent Start" },
  "agent-think":          { icon: "🧠", color: "text-accent-purple", label: "Thinking" },
  "agent-response":       { icon: "💬", color: "text-text-primary",  label: "Analysis" },
  "tool-call":            { icon: "🔧", color: "text-accent-blue",   label: "Tool" },
  "tool-result":          { icon: "✅", color: "text-accent-green",  label: "Result" },
  "subagent-spawn":       { icon: "🤖", color: "text-accent-orange", label: "Subagent" },
  "subagent-return":      { icon: "↩️", color: "text-accent-purple", label: "Return" },
  "flag-found":           { icon: "🏁", color: "text-accent-green",  label: "FLAG" },
  "flag-submitted":       { icon: "📤", color: "text-accent-blue",   label: "Submitted" },
  "flag-accepted":        { icon: "✅", color: "text-accent-green",  label: "ACCEPTED" },
  "flag-rejected":        { icon: "❌", color: "text-accent-red",    label: "REJECTED" },
  "rabbit-hole-escape":   { icon: "🐰", color: "text-accent-orange", label: "Pivot" },
  "task-complete":        { icon: "🎉", color: "text-accent-green",  label: "Complete" },
  "task-error":           { icon: "💥", color: "text-accent-red",    label: "Error" },
};

const EXPANDABLE = new Set(["tool-call", "tool-result", "agent-response", "agent-think"]);

// ─── Build a human-readable summary for a tool call ────────────
function describeToolCall(name: string, input: any): string {
  if (!input) return name;
  const obj = typeof input === "string" ? {} : input;

  switch (name) {
    case "execute":
      return obj.command ? `execute: ${obj.command.slice(0, 100)}` : "execute";
    case "web_fetch":
      return obj.url ? `fetch: ${obj.url}` : "web_fetch";
    case "curl":
      return obj.url ? `curl: ${obj.url}` : "curl";
    case "read_file":
      return obj.file_path ? `read: ${obj.file_path}` : "read_file";
    case "write_file":
      return obj.file_path ? `write: ${obj.file_path}` : "write_file";
    case "ls":
      return obj.path ? `ls: ${obj.path}` : "ls";
    case "grep":
      return obj.pattern ? `grep: "${obj.pattern}"` : "grep";
    case "glob":
      return obj.pattern ? `glob: ${obj.pattern}` : "glob";
    case "task":
      return obj.description ? `delegate: ${obj.description.slice(0, 80)}` : "subagent";
    case "write_todos":
      return obj.todos ? `plan: ${obj.todos.length} tasks` : "write_todos";
    default:
      return name;
  }
}

// ─── Build a short preview for tool result ──────────────────────
function describeToolResult(name: string, output: string): string {
  if (!output) return "";
  const firstLine = output.split("\n")[0].trim();
  if (firstLine.length <= 120) return firstLine;
  return firstLine.slice(0, 120) + "…";
}

// ─── Status indicator with animation ───────────────────────────
function StatusIndicator({ status }: { status: string }) {
  if (status === "running") {
    return (
      <span className="flex-shrink-0 flex items-center gap-1">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-blue opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-blue" />
        </span>
        <span className="text-[10px] text-accent-blue animate-pulse">running</span>
      </span>
    );
  }
  if (status === "error") {
    return <span className="w-2 h-2 bg-accent-red rounded-full flex-shrink-0" />;
  }
  return null;
}

// ─── Main TreeNode component ───────────────────────────────────
export function TreeNode({ event, children, defaultExpanded = true }: {
  event: StreamEvent;
  children?: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const config = TYPE_CONFIG[event.type] ?? { icon: "•", color: "text-text-secondary", label: event.type };
  const hasChildren = !!children;
  const canExpand = hasChildren || EXPANDABLE.has(event.type);
  const data = event.data ?? {};

  // Auto-collapse thinking events
  useEffect(() => {
    if (event.status === "complete" && event.type === "agent-think") {
      const timer = setTimeout(() => setExpanded(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [event.status, event.type]);

  // Always expand flags and errors
  useEffect(() => {
    if (event.type.startsWith("flag-") || event.type === "task-error" || event.type === "task-complete") {
      setExpanded(true);
    }
  }, [event.type]);

  // ─── Build display content ─────────────────────────────────
  let nodeTitle = "";
  let nodeDetail = "";
  let fullContent = "";

  if (event.type === "tool-call") {
    const toolName = data.toolName ?? "unknown";
    const toolIcon = TOOL_ICONS[toolName] ?? { icon: "🔧", color: "text-accent-blue" };
    nodeTitle = describeToolCall(toolName, data.toolInput);
    fullContent = typeof data.toolInput === "string"
      ? data.toolInput
      : JSON.stringify(data.toolInput ?? {}, null, 2);
  } else if (event.type === "tool-result") {
    const toolName = data.toolName ?? "unknown";
    const output = data.toolOutput ?? data.error ?? "";
    const isError = !!data.error;
    nodeTitle = isError ? `❌ ${data.error}` : describeToolResult(toolName, output);
    fullContent = output;
  } else if (event.type === "agent-response") {
    const text = data.content ?? "";
    nodeTitle = text.length > 150 ? text.slice(0, 150) + "…" : text;
    fullContent = text;
  } else if (event.type === "flag-found") {
    nodeTitle = data.flag ?? "";
    fullContent = data.flag ?? "";
  } else {
    const text = data.content ?? data.error ?? "";
    nodeTitle = text.length > 150 ? text.slice(0, 150) + "…" : text;
    fullContent = text;
  }

  const hasExpandableContent = fullContent.length > 0 && fullContent !== nodeTitle;

  // ─── Tool-specific icon ────────────────────────────────────
  const toolIcon = event.type === "tool-call" || event.type === "tool-result"
    ? TOOL_ICONS[data.toolName ?? ""] ?? null
    : null;

  const isRunning = event.status === "running";

  return (
    <div className={`my-0.5 ${isRunning ? "animate-pulse-subtle" : ""}`}>
      {/* ── Header row ── */}
      <div
        className={`flex items-center gap-2 py-1 px-2 rounded transition-colors ${
          canExpand ? "cursor-pointer hover:bg-bg-elevated" : "cursor-default"
        } ${event.type === "flag-found" ? "bg-accent-green/10 border border-accent-green/20" : ""}
        ${isRunning ? "bg-accent-blue/5 border-l-2 border-accent-blue" : ""}`}
        style={{ paddingLeft: `${event.depth * 16 + 8}px` }}
        onClick={() => { if (canExpand) setExpanded(prev => !prev); }}
      >
        {/* Toggle arrow */}
        <span className="w-4 text-text-secondary/50 text-xs flex-shrink-0 text-center">
          {canExpand ? (expanded ? "▾" : "▸") : ""}
        </span>

        {/* Event icon */}
        <span className="flex-shrink-0 text-sm">
          {toolIcon ? toolIcon.icon : config.icon}
        </span>

        {/* Status indicator */}
        <StatusIndicator status={event.status} />

        {/* Node title — the meaningful description */}
        <span className={`text-xs min-w-0 flex-1 ${
          event.type === "flag-found" ? "text-accent-green font-bold font-mono text-sm" :
          event.type === "tool-result" && data.error ? "text-accent-red" :
          event.type === "tool-call" ? (toolIcon?.color ?? "text-accent-blue") :
          event.type === "agent-response" ? "text-text-primary" :
          "text-text-secondary"
        }`}>
          {event.type === "flag-found" && <span className="mr-1">🏁</span>}
          {nodeTitle}
        </span>

        {/* Flag badge */}
        {event.type === "flag-found" && data.flag && (
          <span className="flex-shrink-0 bg-accent-green/20 text-accent-green px-2 py-0.5 rounded text-xs font-mono font-bold select-all">
            {data.flag}
          </span>
        )}
      </div>

      {/* ── Expanded content ── */}
      {expanded && hasExpandableContent && (
        <div className="ml-10 my-1">
          <pre className="text-xs p-3 rounded bg-bg-elevated border border-border overflow-auto max-h-[600px] whitespace-pre-wrap break-words font-mono text-text-secondary leading-relaxed">
            {fullContent}
          </pre>
        </div>
      )}

      {/* ── Children ── */}
      {expanded && hasChildren && (
        <div className="border-l border-border/30 ml-5">
          {children}
        </div>
      )}
    </div>
  );
}
