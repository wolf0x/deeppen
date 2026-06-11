import { create } from "zustand";
import type { StreamEvent } from "@deeppen/shared";

const MAX_EVENTS = 1000;

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
      // Cap at MAX_EVENTS to prevent unbounded memory growth
      if (events.length > MAX_EVENTS) {
        return { events: events.slice(-MAX_EVENTS) };
      }
      return { events };
    }),
  clear: () => set({ events: [] }),
}));
