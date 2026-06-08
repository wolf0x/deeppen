import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

interface AppSettings {
  maxIterations: number;
  maxToolCalls: number;
  maxTimeMinutes: number;
  taskTimeoutMinutes: number;
  fontFamily: string;
  fontSize: number;
  bgColor: string;
  surfaceColor: string;
  elevatedColor: string;
  recentEventCount: number;
  autoCollapseHistory: boolean;
  maxExpandedLines: number;
}

const DEFAULTS: AppSettings = {
  maxIterations: 100,
  maxToolCalls: 500,
  maxTimeMinutes: 30,
  taskTimeoutMinutes: 35,
  fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
  fontSize: 13,
  bgColor: "#0d1117",
  surfaceColor: "#161b22",
  elevatedColor: "#1c2128",
  recentEventCount: 10,
  autoCollapseHistory: true,
  maxExpandedLines: 50,
};

export function Settings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getSettings();
      setSettings(data);
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

  const update = (key: keyof AppSettings, value: any) => {
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

          {/* ── Agent Settings ── */}
          <Section title="🤖 Agent Limits" desc="Controls how long the agent runs before stopping">
            <Field label="Max Iterations" desc="Maximum number of model calls per task">
              <NumberInput value={settings.maxIterations} onChange={v => update("maxIterations", v)} min={10} max={500} />
            </Field>
            <Field label="Max Tool Calls" desc="Maximum number of tool executions per task">
              <NumberInput value={settings.maxToolCalls} onChange={v => update("maxToolCalls", v)} min={50} max={2000} />
            </Field>
            <Field label="Max Time (minutes)" desc="Agent will stop after this many minutes">
              <NumberInput value={settings.maxTimeMinutes} onChange={v => update("maxTimeMinutes", v)} min={5} max={120} />
            </Field>
            <Field label="Task Timeout (minutes)" desc="Hard kill timeout (includes agent startup)">
              <NumberInput value={settings.taskTimeoutMinutes} onChange={v => update("taskTimeoutMinutes", v)} min={10} max={180} />
            </Field>
          </Section>

          {/* ── UI Settings ── */}
          <Section title="🎨 Appearance" desc="Customize the look and feel">
            <Field label="Font Family" desc="Monospace font for code and stream tree">
              <select
                value={settings.fontFamily}
                onChange={e => update("fontFamily", e.target.value)}
                className="w-full px-3 py-2 bg-bg-elevated border border-border rounded text-sm text-text-primary focus:border-accent-blue focus:outline-none"
              >
                <option value="ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace">System Mono</option>
                <option value="'JetBrains Mono', 'Fira Code', monospace">JetBrains Mono</option>
                <option value="'Source Code Pro', 'Courier New', monospace">Source Code Pro</option>
                <option value="'IBM Plex Mono', 'Courier New', monospace">IBM Plex Mono</option>
                <option value="'Courier New', Courier, monospace">Courier New</option>
              </select>
            </Field>
            <Field label="Font Size" desc="Base font size in pixels">
              <div className="flex items-center gap-3">
                <input
                  type="range" min={10} max={18} step={1}
                  value={settings.fontSize}
                  onChange={e => update("fontSize", Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm text-text-secondary w-8 text-right">{settings.fontSize}px</span>
              </div>
            </Field>
            <Field label="Background Color" desc="Main background color">
              <ColorInput value={settings.bgColor} onChange={v => update("bgColor", v)} />
            </Field>
            <Field label="Surface Color" desc="Card and panel background">
              <ColorInput value={settings.surfaceColor} onChange={v => update("surfaceColor", v)} />
            </Field>
            <Field label="Elevated Color" desc="Hover and active states">
              <ColorInput value={settings.elevatedColor} onChange={v => update("elevatedColor", v)} />
            </Field>
          </Section>

          {/* ── Stream Tree Settings ── */}
          <Section title="🌳 Stream Tree" desc="Configure the task activity stream display">
            <Field label="Recent Event Count" desc="Number of recent events shown outside History">
              <NumberInput value={settings.recentEventCount} onChange={v => update("recentEventCount", v)} min={5} max={50} />
            </Field>
            <Field label="Auto-collapse History" desc="Automatically collapse old events into History section">
              <Toggle checked={settings.autoCollapseHistory} onChange={v => update("autoCollapseHistory", v)} />
            </Field>
            <Field label="Max Expanded Lines" desc="Maximum lines shown when expanding a tool result">
              <NumberInput value={settings.maxExpandedLines} onChange={v => update("maxExpandedLines", v)} min={10} max={200} />
            </Field>
          </Section>

          {/* ── Reset ── */}
          <div className="pt-4 border-t border-border">
            <button
              onClick={() => { setSettings(DEFAULTS); }}
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

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-8 h-8 rounded border border-border cursor-pointer"
      />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 px-2 py-1 bg-bg-elevated border border-border rounded text-xs font-mono text-text-primary focus:border-accent-blue focus:outline-none"
      />
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        checked ? "bg-accent-blue" : "bg-bg-elevated border border-border"
      }`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
        checked ? "left-5" : "left-0.5"
      }`} />
    </button>
  );
}
