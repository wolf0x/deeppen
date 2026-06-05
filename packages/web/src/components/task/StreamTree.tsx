import { useMemo } from "react";
import { useStreamStore } from "../../stores/streamStore.js";
import { TreeNode } from "./TreeNode.js";
import type { StreamEvent } from "@deeppen/shared";

export function StreamTree() {
  const events = useStreamStore((s) => s.events);

  // Build parent→children index once per events change (O(n) instead of O(n^2))
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
    return <div className="text-text-secondary text-sm p-4">Waiting for agent activity...</div>;
  }

  return (
    <div className="font-mono text-xs">
      {roots.map((event) => (
        <EventNode key={event.id} event={event} childMap={childMap} />
      ))}
    </div>
  );
}

function EventNode({ event, childMap }: { event: StreamEvent; childMap: Map<string | null, StreamEvent[]> }) {
  const children = childMap.get(event.id) ?? [];
  return (
    <TreeNode event={event} defaultExpanded={event.depth < 2}>
      {children.map((child) => (
        <EventNode key={child.id} event={child} childMap={childMap} />
      ))}
    </TreeNode>
  );
}
