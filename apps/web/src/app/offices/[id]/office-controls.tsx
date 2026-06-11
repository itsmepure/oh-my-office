'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Owner-only office controls (Phase G2): rename inline + delete with confirm.
 * Rendered in the office page header only when the viewer owns the office.
 */
export function OfficeControls({ officeId, name }: { officeId: string; name: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed === name) {
      setEditing(false);
      setValue(name);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/offices/${officeId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? `Failed (${res.status})`);
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/offices/${officeId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/dashboard');
        router.refresh();
      } else {
        setError('Failed to delete');
        setBusy(false);
      }
    } catch {
      setError('Failed to delete');
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          className="border border-line bg-surface-2 px-2 py-1 text-sm text-content focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="cursor-pointer bg-accent px-2.5 py-1 text-xs font-medium text-bg transition hover:bg-accent-bright disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => { setEditing(false); setValue(name); }}
          className="cursor-pointer border border-line px-2.5 py-1 text-xs text-content-muted transition hover:text-content"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-danger">Delete this office and all its data?</span>
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy}
          className="cursor-pointer bg-danger px-2.5 py-1 text-xs font-medium text-bg transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Deleting…' : 'Delete'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="cursor-pointer border border-line px-2.5 py-1 text-xs text-content-muted transition hover:text-content"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="cursor-pointer border border-line px-2.5 py-1 text-xs text-content-muted transition hover:border-accent/50 hover:text-content"
      >
        Rename
      </button>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="cursor-pointer border border-danger/40 px-2.5 py-1 text-xs text-danger transition hover:bg-danger/10"
      >
        Delete
      </button>
    </div>
  );
}
