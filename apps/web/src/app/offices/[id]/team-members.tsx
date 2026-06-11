'use client';

import { useEffect, useState } from 'react';

interface MemberView {
  userId: string;
  email: string;
  name: string;
  role: string;
}

export function TeamMembers({ officeId, ownerId }: { officeId: string; ownerId: string }) {
  const [members, setMembers] = useState<MemberView[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`/api/offices/${officeId}/members`, { cache: 'no-store' });
    if (res.ok) setMembers((await res.json()) as MemberView[]);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeId]);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/offices/${officeId}/members`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? `Failed (${res.status})`);
        return;
      }
      setEmail('');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: string) {
    setBusy(true);
    try {
      await fetch(`/api/offices/${officeId}/members?userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <ul className="mb-4 space-y-2">
        {members.map((m) => (
          <li
            key={m.userId}
            className="flex items-center justify-between border border-line bg-surface-2 px-3 py-2 text-sm"
          >
            <span className="min-w-0">
              <span className="text-content">{m.name}</span>{' '}
              <span className="font-mono text-xs text-content-faint">{m.email}</span>
              {m.role === 'owner' && (
                <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.1em] text-accent">owner</span>
              )}
            </span>
            {m.role !== 'owner' && m.userId !== ownerId && (
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(m.userId)}
                className="cursor-pointer border border-danger/40 px-2 py-0.5 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <div className="mb-2 border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>
      )}
      <div className="flex gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@email.com"
          type="email"
          className="flex-1 border border-line bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button
          type="button"
          disabled={busy || !email.includes('@')}
          onClick={add}
          className="cursor-pointer bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:bg-accent-bright disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-content-muted"
        >
          Invite
        </button>
      </div>
      <p className="mt-2 text-xs text-content-faint">
        Members can run tasks in this office. Their agent runs draw from your shared credit pool.
      </p>
    </div>
  );
}
