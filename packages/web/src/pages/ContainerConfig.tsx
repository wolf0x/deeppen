import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

export function ContainerConfig() {
  const [status, setStatus] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, configRes] = await Promise.all([
        api.getContainerStatus(),
        api.getContainerConfig(),
      ]);
      setStatus(statusRes);
      setConfig(configRes);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const handleStart = async () => {
    await api.startContainer();
    refresh();
  };

  const handleStop = async () => {
    await api.stopContainer();
    refresh();
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Container Configuration</h1>
      {loading ? <p className="text-text-secondary">Loading...</p> : (
        <div className="space-y-4 max-w-xl">
          <div className="p-4 bg-bg-surface border border-border rounded-lg">
            <h2 className="font-semibold mb-2">Status</h2>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${status?.running ? "bg-accent-green" : "bg-accent-red"}`} />
              <span>{status?.running ? "Running" : "Stopped"}</span>
              {status?.name && <span className="text-text-secondary text-sm">({status.name})</span>}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={handleStart} className="px-3 py-1.5 bg-accent-green text-bg-primary rounded text-sm font-medium">Start</button>
              <button onClick={handleStop} className="px-3 py-1.5 bg-accent-red text-bg-primary rounded text-sm font-medium">Stop</button>
            </div>
          </div>

          {config && (
            <div className="p-4 bg-bg-surface border border-border rounded-lg">
              <h2 className="font-semibold mb-2">Configuration</h2>
              <div className="space-y-1 text-sm">
                <div><span className="text-text-secondary">Image:</span> {config.image}</div>
                <div><span className="text-text-secondary">Name:</span> {config.name}</div>
                <div><span className="text-text-secondary">Memory:</span> {config.resourceLimits?.memory}</div>
                <div><span className="text-text-secondary">CPUs:</span> {config.resourceLimits?.cpus}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
