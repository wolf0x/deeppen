import { create } from "zustand";
import type { StreamEvent } from "@deeppen/shared";

interface StreamState {
  events: StreamEvent[];
  addEvent: (event: StreamEvent) => void;
  clear: () => void;
}

export const useStreamStore = create<StreamState>((set) => ({
  events: [],
  addEvent: (event) =>
    set((state) => {
      const events = [...state.events, event];

      // When a tool-result arrives, mark the matching tool-call as complete
      if (event.type === "tool-result" && event.parentId) {
        const idx = events.findIndex((e) => e.id === event.parentId);
        if (idx !== -1 && events[idx].status === "running") {
          events[idx] = { ...events[idx], status: "complete" };
        }
      }

      return { events };
    }),
  clear: () => set({ events: [] }),
}));
