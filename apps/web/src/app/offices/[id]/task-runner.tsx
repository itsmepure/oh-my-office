'use client';

import { useState, type FormEvent } from 'react';

interface Props {
  officeId: string;
}

export function TaskRunner({ officeId }: Props) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ officeId, prompt }),
      });
      const data = (await res.json().catch(() => ({}))) as { task?: { id: string }; error?: string };
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setMessage(`Task queued: ${data.task?.id ?? 'unknown'}. Watch the live event feed below.`);
      setPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm text-content-muted">
        Submit a prompt. The orchestrator will pick up the queued task and stream events live.
      </p>

      <form onSubmit={submit} className="space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          required
          minLength={1}
          maxLength={10_000}
          rows={3}
          placeholder="Ask this office to build, research, or review something..."
          className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-faint transition focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={loading || prompt.trim().length === 0}
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-accent-fg shadow-sm hover:shadow-glow cursor-pointer transition disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-content-muted disabled:shadow-none"
        >
          {loading ? 'Queueing…' : 'Queue task'}
        </button>
      </form>

      {message && <p className="mt-3 rounded-lg border border-success/40 bg-success/10 p-2 text-sm text-success">{message}</p>}
      {error && <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
