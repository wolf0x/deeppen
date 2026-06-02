import { useState } from "react";
import { useModels } from "../../hooks/useModels.js";
import type { ChallengeCategory } from "@deeppen/shared";

const categories: { value: ChallengeCategory; label: string; icon: string }[] = [
  { value: "web", label: "Web Security", icon: "\u{1F310}" },
  { value: "pwn", label: "Pwn/Binary", icon: "\u{1F480}" },
  { value: "crypto", label: "Crypto", icon: "\u{1F510}" },
  { value: "forensics", label: "Forensics/RE", icon: "\u{1F50D}" },
  { value: "misc", label: "Misc", icon: "\u{1F4E6}" },
  { value: "prompt-injection", label: "Prompt Injection", icon: "\u{1F489}" },
];

export function TaskCreateForm({ onSubmit }: { onSubmit: (config: any) => Promise<void> }) {
  const { models } = useModels();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ChallengeCategory>("web");
  const [modelId, setModelId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !description || !modelId) return;
    setSubmitting(true);
    try {
      await onSubmit({ name, challenge: { description, category }, modelId, autoSubmit: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <div>
        <label className="block text-sm text-text-secondary mb-1">Task Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g., HTB Web Challenge 1"
          className="w-full px-3 py-2 bg-bg-surface border border-border rounded text-text-primary focus:border-accent-blue focus:outline-none"
          required />
      </div>
      <div>
        <label className="block text-sm text-text-secondary mb-1">Challenge Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Paste the challenge description here..." rows={6}
          className="w-full px-3 py-2 bg-bg-surface border border-border rounded text-text-primary focus:border-accent-blue focus:outline-none font-mono text-sm"
          required />
      </div>
      <div>
        <label className="block text-sm text-text-secondary mb-1">Category</label>
        <div className="grid grid-cols-3 gap-2">
          {categories.map((cat) => (
            <button key={cat.value} type="button" onClick={() => setCategory(cat.value)}
              className={`px-3 py-2 rounded border text-sm text-left transition-colors ${
                category === cat.value
                  ? "border-accent-blue bg-accent-blue/10 text-accent-blue"
                  : "border-border text-text-secondary hover:border-accent-blue"
              }`}>
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm text-text-secondary mb-1">Model</label>
        <select value={modelId} onChange={(e) => setModelId(e.target.value)}
          className="w-full px-3 py-2 bg-bg-surface border border-border rounded text-text-primary focus:border-accent-blue focus:outline-none"
          required>
          <option value="">Select a model...</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={submitting}
        className="px-4 py-2 bg-accent-blue text-bg-primary rounded font-medium hover:opacity-90 disabled:opacity-50">
        {submitting ? "Creating..." : "Create Task"}
      </button>
    </form>
  );
}
