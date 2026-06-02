import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

export function SkillsManager() {
  const [skills, setSkills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSkills(await api.listSkills());
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const handleToggle = async (id: string) => {
    await api.toggleSkill(id);
    refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this skill?")) return;
    await api.deleteSkill(id);
    refresh();
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Skills Manager</h1>
      {loading ? <p className="text-text-secondary">Loading...</p> : skills.length === 0 ? (
        <p className="text-text-secondary">No skills installed. Add SKILL.md files to the skills/ directory.</p>
      ) : (
        <div className="space-y-2">
          {skills.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-3 bg-bg-surface border border-border rounded-lg">
              <div>
                <span className="font-semibold">{s.name}</span>
                <span className="text-text-secondary text-sm ml-2">{s.description}</span>
                <span className="text-text-secondary text-xs ml-2">({s.source})</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleToggle(s.id)}
                  className={`px-2 py-1 rounded text-xs ${s.enabled ? "bg-accent-green/20 text-accent-green" : "bg-bg-elevated text-text-secondary"}`}>
                  {s.enabled ? "Enabled" : "Disabled"}
                </button>
                <button onClick={() => handleDelete(s.id)}
                  className="px-2 py-1 bg-bg-elevated border border-border rounded text-xs text-accent-red hover:border-accent-red">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
