import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

export function useModels() {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setModels(await api.listModels()); } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { models, loading, refresh };
}
