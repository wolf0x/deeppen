import { create } from "zustand";
import type { StreamEvent } from "@deeppen/shared";

interface StreamState {
  events: StreamEvent[];
  addEvent: (event: StreamEvent) => void;
  clear: () => void;
}

export const useStreamStore = create<StreamState>((set) => ({
  events: [],
  addEvent: (event) => set((state) => ({ events: [...state.events, event] })),
  clear: () => set({ events: [] }),
}));
