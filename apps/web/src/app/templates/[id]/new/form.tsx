'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  templateId: string;
  defaultName: string;
}

export function CreateOfficeForm({ templateId, defaultName }: Props) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/offices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ templateId, name }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }

      const office = (await res.json()) as { id: string };
      router.push(`/offices/${office.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-sm font-medium text-content">Office name</span>
        <input
          type="text"
          required
          minLength={1}
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          placeholder="e.g. My Dev Office"
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:bg-accent-bright disabled:opacity-50"
      >
        {submitting ? 'Creating…' : 'Create office'}
      </button>
    </form>
  );
}
