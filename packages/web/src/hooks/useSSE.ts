import { useEffect, useRef } from "react";
import { useStreamStore } from "../stores/streamStore.js";
import type { StreamEvent } from "@deeppen/shared";

export function useSSE(taskId: string | undefined) {
  const addEvent = useStreamStore((s) => s.addEvent);
  const clear = useStreamStore((s) => s.clear);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!taskId) return;
    clear();
    const source = new EventSource(`/api/tasks/${taskId}/stream`);
    sourceRef.current = source;

    source.addEventListener("stream", (e) => {
      try { addEvent(JSON.parse(e.data)); } catch {}
    });

    source.addEventListener("connected", () => {
      console.log("SSE connected for task", taskId);
    });

    source.onerror = () => {
      // Will auto-reconnect, but clean up if closed
      if (source.readyState === EventSource.CLOSED) {
        sourceRef.current = null;
      }
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [taskId, addEvent, clear]);
}
