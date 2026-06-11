import { useEffect, useRef } from "react";
import { useStreamStore } from "../stores/streamStore.js";
import type { StreamEvent } from "@deeppen/shared";

export function useSSE(taskId: string | undefined) {
  const addEvent = useStreamStore((s) => s.addEvent);
  const clear = useStreamStore((s) => s.clear);
  const sourceRef = useRef<EventSource | null>(null);
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    if (!taskId) return;
    clear();
    seenIds.current.clear();

    const source = new EventSource(`/api/tasks/${taskId}/stream`);
    sourceRef.current = source;

    source.addEventListener("stream", (e) => {
      try {
        const event: StreamEvent = JSON.parse(e.data);
        // Deduplicate by event ID to prevent duplicates on reconnect
        if (seenIds.current.has(event.id)) return;
        seenIds.current.add(event.id);
        addEvent(event);
      } catch {}
    });

    source.addEventListener("connected", () => {
      console.log("SSE connected for task", taskId);
      // On reconnect, clear and replay from server
      if (seenIds.current.size > 0) {
        clear();
        seenIds.current.clear();
      }
    });

    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        sourceRef.current = null;
      }
    };

    return () => {
      source.close();
      sourceRef.current = null;
      seenIds.current.clear();
    };
  }, [taskId, addEvent, clear]);
}
