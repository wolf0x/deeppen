import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../lib/api.js";
import { useStreamStore } from "../stores/streamStore.js";

interface TaskStats {
  id: string;
  name: string;
  status: string;
  flag: string | null;
  category: string;
  startedAt: string | null;
  elapsedMs: number | null;
}

export function Kanban() {
  const [tasks, setTasks] = useState<TaskStats[]>([]);
  const [loopStatus, setLoopStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const events = useStreamStore((s) => s.events);

  const refresh = useCallback(async () => {
    try {
      const [data, loop] = await Promise.all([
        api.listTasks(),
        api.getLoopStatus().catch(() => null),
      ]);
      setTasks(data);
      setLoopStatus(loop);
      setLastUpdate(Date.now());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const running = tasks.filter(t => t.status === "running");
  const completed = tasks.filter(t => t.status === "completed" || t.status === "stopped");

  if (loading) return <div className="p-6 text-text-secondary">Loading...</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-border flex items-center justify-between">
        <h1 className="text-lg font-bold">📊 Kanban Dashboard</h1>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-accent-green rounded-full animate-pulse" />
          <span className="text-xs text-text-secondary">Auto-refresh 5s</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── Left Column ── */}
          <div className="space-y-4">

            {/* Running Tasks */}
            <Section title="🟢 Running" count={running.length}>
              {running.length === 0 ? (
                <Empty text="No running tasks" />
              ) : running.map(task => (
                <RunningTaskCard key={task.id} task={task} events={events} />
              ))}
            </Section>

            {/* Loop Agent Status */}
            {loopStatus && (
              <Section title="🔄 Loop Agent" count={loopStatus.history?.length ?? 0}>
                <div className="space-y-3">
                  {/* Status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${loopStatus.config?.enabled ? "bg-accent-green" : "bg-text-secondary"}`} />
                      <span className="text-xs font-medium">
                        {loopStatus.config?.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <span className="text-xs text-text-secondary">
                      Every {loopStatus.config?.intervalMinutes ?? 5}min
                    </span>
                  </div>

                  {/* Last Run */}
                  {loopStatus.lastRun && (
                    <div className="text-xs text-text-secondary">
                      Last run: {new Date(loopStatus.lastRun).toLocaleTimeString()}
                    </div>
                  )}

                  {/* Run History */}
                  {loopStatus.history?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-text-secondary">Recent runs:</p>
                      {loopStatus.history.slice(-5).reverse().map((run: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs px-2 py-1 bg-bg-elevated rounded">
                          <span className="text-text-secondary">
                            {new Date(run.time).toLocaleTimeString()}
                          </span>
                          <span className="text-text-primary">
                            {run.analyzed} analyzed
                          </span>
                          {Object.entries(run.actions).length > 0 && (
                            <span className="text-accent-blue">
                              {Object.entries(run.actions).map(([k, v]) => `${k}:${v}`).join(", ")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* No history */}
                  {(!loopStatus.history || loopStatus.history.length === 0) && (
                    <Empty text="No runs yet" />
                  )}
                </div>
              </Section>
            )}

            {/* Completed Tasks */}
            <Section title="✅ Completed" count={completed.length}>
              {completed.length === 0 ? (
                <Empty text="No completed tasks" />
              ) : completed.slice(0, 10).map(task => (
                <TaskCard key={task.id} task={task} />
              ))}
            </Section>
          </div>

          {/* ── Right Column: Activity ── */}
          <div className="space-y-4">

            {/* Recent Activity */}
            <Section title="⚡ Recent Activity" count={Math.min(events.length, 10)}>
              {events.length === 0 ? (
                <Empty text="No activity yet" />
              ) : (
                <div className="space-y-1">
                  {events.slice(-10).reverse().map(event => (
                    <ActivityItem key={event.id} event={event} />
                  ))}
                </div>
              )}
            </Section>

            {/* Flags Found */}
            <Section title="🚩 Flags Found" count={Math.min(events.filter(e => e.type === "flag-found").length, 10)}>
              {events.filter(e => e.type === "flag-found").length === 0 ? (
                <Empty text="No flags found yet" />
              ) : (
                <div className="space-y-1">
                  {events.filter(e => e.type === "flag-found").slice(-10).reverse().map(event => (
                    <div key={event.id} className="flex items-center gap-2 px-3 py-1.5 bg-accent-green/5 rounded">
                      <span className="text-accent-green text-sm">🏁</span>
                      <span className="text-accent-green font-mono text-xs break-all select-all">
                        {event.data?.flag}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Components ────────────────────────────────────────────────

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-text-secondary bg-bg-elevated px-2 py-0.5 rounded">{count}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-text-secondary py-4 text-center">{text}</p>;
}

function RunningTaskCard({ task, events }: { task: TaskStats; events: any[] }) {
  // SSE events from the store are for the currently viewed task only
  const toolCalls = events.filter(e => e.type === "tool-call").length;
  const flags = events.filter(e => e.type === "flag-found").length;
  const lastEvent = events[events.length - 1];
  const elapsed = task.startedAt
    ? Math.round((Date.now() - new Date(task.startedAt).getTime()) / 1000)
    : 0;

  return (
    <div className="bg-bg-elevated border border-accent-green/30 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold truncate flex-1">{task.name}</h3>
        <span className="flex-shrink-0 ml-2 px-2 py-0.5 bg-accent-green/20 text-accent-green rounded text-xs font-medium">
          running
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-2">
        <Stat label="Time" value={formatTime(elapsed)} />
        <Stat label="Tools" value={String(toolCalls)} />
        <Stat label="Flags" value={String(flags)} accent />
      </div>

      {lastEvent && (
        <div className="text-xs text-text-secondary truncate">
          Last: {formatEventSummary(lastEvent)}
        </div>
      )}
    </div>
  );
}

function TaskCard({ task }: { task: TaskStats }) {
  const statusColors: Record<string, string> = {
    created: "bg-bg-elevated text-text-secondary",
    completed: "bg-accent-green/20 text-accent-green",
    stopped: "bg-accent-red/20 text-accent-red",
    failed: "bg-accent-red/20 text-accent-red",
  };

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-bg-elevated rounded">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium truncate">{task.name}</h3>
        {task.flag && (
          <p className="text-xs text-accent-green font-mono truncate mt-0.5">🚩 {task.flag}</p>
        )}
      </div>
      <span className={`flex-shrink-0 ml-2 px-2 py-0.5 rounded text-xs ${statusColors[task.status] ?? ""}`}>
        {task.status}
      </span>
    </div>
  );
}

function ActivityItem({ event }: { event: any }) {
  const data = event.data ?? {};

  if (event.type === "agent-response") {
    return (
      <div className="flex items-start gap-2 px-2 py-1">
        <span className="text-accent-purple flex-shrink-0">🧠</span>
        <span className="text-xs text-text-secondary truncate">{data.content?.slice(0, 100)}</span>
      </div>
    );
  }

  if (event.type === "tool-call") {
    return (
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="flex-shrink-0">🔧</span>
        <span className="text-xs text-accent-blue font-medium">{data.toolName}</span>
        <span className="text-xs text-text-secondary truncate">
          {data.toolInput?.command?.slice(0, 60) ?? data.toolInput?.url ?? ""}
        </span>
      </div>
    );
  }

  if (event.type === "tool-result") {
    return (
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="flex-shrink-0">✅</span>
        <span className="text-xs text-accent-green truncate">{data.toolOutput?.slice(0, 80)}</span>
      </div>
    );
  }

  if (event.type === "flag-found") {
    return (
      <div className="flex items-center gap-2 px-2 py-1 bg-accent-green/5 rounded">
        <span className="flex-shrink-0">🏁</span>
        <span className="text-xs text-accent-green font-mono font-bold">{data.flag}</span>
      </div>
    );
  }

  return null;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <p className={`text-sm font-bold ${accent ? "text-accent-green" : "text-text-primary"}`}>{value}</p>
      <p className="text-[10px] text-text-secondary">{label}</p>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatEventSummary(event: any): string {
  const data = event.data ?? {};
  switch (event.type) {
    case "agent-response": return `🧠 ${data.content?.slice(0, 60) ?? ""}`;
    case "tool-call": return `🔧 ${data.toolName}: ${JSON.stringify(data.toolInput)?.slice(0, 50)}`;
    case "tool-result": return `✅ ${data.toolOutput?.slice(0, 60) ?? ""}`;
    case "flag-found": return `🚩 ${data.flag}`;
    default: return event.type;
  }
}
