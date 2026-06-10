import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

interface Settings {
  maxIterations: number;
  maxTimeMinutes: number;
  maxToolCalls: number;
  pivotStrategy: "different-approach" | "ask-user" | "stop";
}

const DEFAULTS: Settings = {
  maxIterations: 100,
  maxTimeMinutes: 30,
  maxToolCalls: 500,
  pivotStrategy: "different-approach",
};

export function Settings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getSettings();
      setSettings({ ...DEFAULTS, ...data });
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.updateSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const update = (key: keyof Settings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (loading) return <div className="p-6 text-text-secondary">Loading...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-6 pb-0 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-accent-blue text-bg-primary rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving..." : saved ? "✓ Saved" : "Save"}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-8">

          {/* ── Agent Limits ── */}
          <Section title="🤖 Agent Limits" desc="Controls how long the agent runs before stopping">
            <Field label="Max Iterations" desc="Maximum number of model calls per task (default: 100)">
              <NumberInput value={settings.maxIterations} onChange={v => update("maxIterations", v)} min={10} max={500} />
            </Field>
            <Field label="Max Time (minutes)" desc="Agent will stop after this many minutes (default: 30)">
              <NumberInput value={settings.maxTimeMinutes} onChange={v => update("maxTimeMinutes", v)} min={5} max={120} />
            </Field>
            <Field label="Max Tool Calls" desc="Maximum number of tool executions per task (default: 500)">
              <NumberInput value={settings.maxToolCalls} onChange={v => update("maxToolCalls", v)} min={50} max={2000} />
            </Field>
            <Field label="Pivot Strategy" desc="What to do when the agent hits a dead end">
              <select
                value={settings.pivotStrategy}
                onChange={e => update("pivotStrategy", e.target.value)}
                className="w-full px-3 py-2 bg-bg-elevated border border-border rounded text-sm text-text-primary focus:border-accent-blue focus:outline-none"
              >
                <option value="different-approach">Try different approach</option>
                <option value="ask-user">Ask user for help</option>
                <option value="stop">Stop task</option>
              </select>
            </Field>
          </Section>

          {/* ── Info ── */}
          <div className="bg-bg-surface border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-2">ℹ️ About Limits</h3>
            <ul className="text-xs text-text-secondary space-y-1">
              <li>• <strong>Max Iterations</strong> — how many times the LLM is called. Each call may produce tool calls.</li>
              <li>• <strong>Max Time</strong> — hard stop after this duration, regardless of progress.</li>
              <li>• <strong>Max Tool Calls</strong> — total tool executions (execute, web_fetch, etc.) before stopping.</li>
              <li>• <strong>Pivot Strategy</strong> — what happens when the agent is stuck on a challenge.</li>
            </ul>
          </div>

          {/* ── Reset ── */}
          <div className="pt-4 border-t border-border">
            <button
              onClick={() => setSettings(DEFAULTS)}
              className="px-4 py-2 bg-bg-elevated border border-border rounded text-sm text-text-secondary hover:border-accent-red hover:text-accent-red transition-colors"
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Components ────────────────────────────────────────────────

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">{title}</h2>
      <p className="text-xs text-text-secondary mb-4">{desc}</p>
      <div className="space-y-4 bg-bg-surface border border-border rounded-lg p-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <label className="text-sm font-medium text-text-primary">{label}</label>
        <p className="text-xs text-text-secondary mt-0.5">{desc}</p>
      </div>
      <div className="flex-shrink-0 w-48">
        {children}
      </div>
    </div>
  );
}

function NumberInput({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <input
      type="number" min={min} max={max}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full px-3 py-1.5 bg-bg-elevated border border-border rounded text-sm text-text-primary text-right focus:border-accent-blue focus:outline-none"
    />
  );
}
