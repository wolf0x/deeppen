import { useStreamStore } from "../../stores/streamStore.js";
import { TreeNode } from "./TreeNode.js";
import type { StreamEvent } from "@deeppen/shared";

function getChildren(events: StreamEvent[], parentId: string): StreamEvent[] {
  return events.filter((e) => e.parentId === parentId);
}

export function StreamTree() {
  const events = useStreamStore((s) => s.events);

  if (events.length === 0) {
    return <div className="text-text-secondary text-sm p-4">Waiting for agent activity...</div>;
  }

  const roots = events.filter((e) => e.parentId === null);

  return (
    <div className="font-mono text-xs">
      {roots.map((event) => (
        <EventNode key={event.id} event={event} events={events} />
      ))}
    </div>
  );
}

function EventNode({ event, events }: { event: StreamEvent; events: StreamEvent[] }) {
  const children = getChildren(events, event.id);
  return (
    <TreeNode event={event} defaultExpanded={event.depth < 2}>
      {children.map((child) => (
        <EventNode key={child.id} event={child} events={events} />
      ))}
    </TreeNode>
  );
}
