'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AGENT_TOOL_WHITELIST } from '@repo/shared';

interface Props {
  /** Pre-filled values for edit mode (optional). */
  initial?: {
    name?: string;
    role?: string;
    systemPrompt?: string;
    tools?: string[];
    model?: string;
    temperature?: number;
  };
  /** Agent id for PATCH on edit (optional — omit for create). */
  agentId?: string;
}

export function AgentBuilderForm({ initial, agentId }: Props) {
  const isEdit = !!agentId;
  const router = useRouter();

  const [name, setName] = useState(initial?.name ?? '');
  const [role, setRole] = useState(initial?.role ?? '');
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? '');
  const [tools, setTools] = useState<string[]>(initial?.tools ?? ['read_file', 'write_file']);
  const [model, setModel] = useState(initial?.model ?? 'claude-sonnet-4-20250514');
  const [temperature, setTemperature] = useState(initial?.temperature ?? 0.3);

  // Knowledge docs (inline only — file upload is future).
  const [docs, setDocs] = useState<Array<{ title: string; content: string }>>(
    initial ? [] : [],
  );

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleTool(tool: string) {
    setTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool],
    );
  }

  function addDoc() {
    setDocs((prev) => [...prev, { title: '', content: '' }]);
  }

  function updateDoc(idx: number, field: 'title' | 'content', value: string) {
    setDocs((prev) => {
      const next = [...prev];
      const current = next[idx]!;
      next[idx] = { ...current, [field]: value };
      return next;
    });
  }

  function removeDoc(idx: number) {
    setDocs((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (tools.length === 0) {
      setError('Select at least one tool.');
      return;
    }

    setSubmitting(true);

    const payload = {
      name,
      role,
      systemPrompt,
      tools,
      modelConfig: { model, temperature },
      ...(isEdit ? {} : { knowledgeDocs: docs.filter((d) => d.title && d.content) }),
    };

    try {
      const url = isEdit ? `/api/agents/${agentId}` : '/api/agents';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }

      const agent = (await res.json()) as { id: string };
      if (isEdit) {
        router.push(`/agents/${agent.id}`);
      } else {
        router.push('/agents');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-5">
      {error && (
        <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-sm font-medium text-content">Name</span>
        <input
          type="text" required minLength={1} maxLength={120}
          value={name} onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          placeholder="e.g. Senior Architect"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-content">Role</span>
        <input
          type="text" required minLength={1} maxLength={80}
          value={role} onChange={(e) => setRole(e.target.value)}
          className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          placeholder="e.g. Architect, Tester, DevOps"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-content">System prompt</span>
        <textarea
          required minLength={1} maxLength={4000} rows={6}
          value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
          className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm font-mono text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          placeholder="You are a..."
        />
      </label>

      {/* Tools */}
      <fieldset>
        <legend className="text-sm font-medium text-content">Tools</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {AGENT_TOOL_WHITELIST.map((tool) => (
            <label
              key={tool}
              className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs font-mono transition ${
                tools.includes(tool)
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-line bg-surface-2 text-content-muted hover:border-accent/60'
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={tools.includes(tool)}
                onChange={() => toggleTool(tool)}
              />
              {tool}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Model config */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-content">Model</span>
          <input
            type="text"
            value={model} onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm font-mono text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-content">Temperature</span>
          <input
            type="number" step={0.1} min={0} max={2}
            value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
            className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
      </div>

      {/* Knowledge docs (create only) */}
      {!isEdit && (
        <fieldset>
          <legend className="text-sm font-medium text-content">
            Knowledge docs (optional, max 10)
          </legend>
          <p className="mt-1 text-xs text-content-muted">
            Inline markdown/text that the agent will reference during tasks.
          </p>
          {docs.map((doc, idx) => (
            <div key={idx} className="mt-2 space-y-2 rounded-md border border-line bg-surface-2 p-3">
              <div className="flex items-center justify-between">
                <input
                  type="text" placeholder="Doc title" maxLength={200}
                  value={doc.title} onChange={(e) => updateDoc(idx, 'title', e.target.value)}
                  className="flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <button
                  type="button" onClick={() => removeDoc(idx)}
                  className="ml-2 cursor-pointer text-xs text-danger hover:underline"
                >
                  Remove
                </button>
              </div>
              <textarea
                rows={3} placeholder="Doc content (markdown)" maxLength={10000}
                value={doc.content} onChange={(e) => updateDoc(idx, 'content', e.target.value)}
                className="w-full rounded-md border border-line bg-surface-2 px-2 py-1 text-sm font-mono text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          ))}
          {docs.length < 10 && (
            <button
              type="button" onClick={addDoc}
              className="mt-2 cursor-pointer text-xs text-accent hover:underline"
            >
              + Add knowledge doc
            </button>
          )}
        </fieldset>
      )}

      <button
        type="submit" disabled={submitting}
        className="w-full cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:bg-accent-bright disabled:opacity-50"
      >
        {submitting ? 'Saving…' : isEdit ? 'Update agent' : 'Create agent'}
      </button>
    </form>
  );
}
