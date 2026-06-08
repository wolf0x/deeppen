import { useMemo, useState } from "react";
import { useStreamStore } from "../../stores/streamStore.js";
import { TreeNode } from "./TreeNode.js";
import type { StreamEvent } from "@deeppen/shared";

const RECENT_COUNT = 10;

export function StreamTree() {
  const events = useStreamStore((s) => s.events);
  const [showHistory, setShowHistory] = useState(false);

  // Build parent→children index
  const { roots, childMap } = useMemo(() => {
    const childMap = new Map<string | null, StreamEvent[]>();
    for (const e of events) {
      const key = e.parentId ?? null;
      let list = childMap.get(key);
      if (!list) { list = []; childMap.set(key, list); }
      list.push(e);
    }
    return { roots: childMap.get(null) ?? [], childMap };
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-text-secondary text-sm">
        <span className="animate-pulse">⏳ Waiting for agent activity...</span>
      </div>
    );
  }

  // Split roots into history and recent
  const historyRoots = roots.slice(0, -RECENT_COUNT);
  const recentRoots = roots.slice(-RECENT_COUNT);

  return (
    <div className="font-mono text-xs">
      {/* History section — collapsed by default */}
      {historyRoots.length > 0 && (
        <div className="mb-2">
          <button
            onClick={() => setShowHistory(prev => !prev)}
            className="flex items-center gap-2 px-2 py-1 text-text-secondary/60 hover:text-text-secondary text-xs rounded hover:bg-bg-elevated transition-colors w-full"
          >
            <span className="text-[10px]">{showHistory ? "▾" : "▸"}</span>
            <span>📜 History ({historyRoots.length} events)</span>
          </button>
          {showHistory && (
            <div className="opacity-70">
              {historyRoots.map((event) => (
                <EventNode key={event.id} event={event} childMap={childMap} defaultExpanded={false} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent events — visible but collapsed */}
      <div>
        {recentRoots.map((event) => (
          <EventNode key={event.id} event={event} childMap={childMap} defaultExpanded={false} />
        ))}
      </div>
    </div>
  );
}

function EventNode({ event, childMap, defaultExpanded }: {
  event: StreamEvent;
  childMap: Map<string | null, StreamEvent[]>;
  defaultExpanded: boolean;
}) {
  const children = childMap.get(event.id) ?? [];
  return (
    <TreeNode event={event} defaultExpanded={defaultExpanded}>
      {children.map((child) => (
        <EventNode key={child.id} event={child} childMap={childMap} defaultExpanded={defaultExpanded} />
      ))}
    </TreeNode>
  );
}
