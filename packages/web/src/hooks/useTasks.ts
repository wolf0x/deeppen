import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

export function useTasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setTasks(await api.listTasks()); } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { tasks, loading, refresh };
}

export function useTask(id: string) {
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setTask(await api.getTask(id)); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { refresh(); }, [refresh]);
  return { task, loading, refresh };
}
