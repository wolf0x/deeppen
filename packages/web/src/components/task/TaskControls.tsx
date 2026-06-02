import { api } from "../../lib/api.js";

export function TaskControls({ task, onRefresh }: { task: any; onRefresh: () => void }) {
  const handleAction = async (action: string) => {
    try {
      await (api as any)[action](task.id);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="flex gap-2">
      {task.status === "created" && (
        <button onClick={() => handleAction("startTask")} className="px-3 py-1.5 bg-accent-green text-bg-primary rounded text-sm font-medium">
          ▶ Start
        </button>
      )}
      {task.status === "running" && (
        <>
          <button onClick={() => handleAction("pauseTask")} className="px-3 py-1.5 bg-accent-orange text-bg-primary rounded text-sm font-medium">⏸ Pause</button>
          <button onClick={() => handleAction("stopTask")} className="px-3 py-1.5 bg-accent-red text-bg-primary rounded text-sm font-medium">⏹ Stop</button>
        </>
      )}
      {task.status === "paused" && (
        <>
          <button onClick={() => handleAction("resumeTask")} className="px-3 py-1.5 bg-accent-green text-bg-primary rounded text-sm font-medium">▶ Resume</button>
          <button onClick={() => handleAction("stopTask")} className="px-3 py-1.5 bg-accent-red text-bg-primary rounded text-sm font-medium">⏹ Stop</button>
        </>
      )}
    </div>
  );
}
