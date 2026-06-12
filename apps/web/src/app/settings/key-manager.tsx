'use client';

import { useEffect, useState } from 'react';

// Local mirror of the masked view (avoid importing the server-only @repo/db/keys
// module — it pulls node:crypto — into this client component).
interface LlmKeyView {
  id: string;
  officeId: string | null;
  provider: string;
  baseUrl: string | null;
  model: string | null;
  last4: string;
  createdAt: string;
}

export function KeyManager() {
  const [keys, setKeys] = useState<LlmKeyView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState('deepseek');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/keys', { cache: 'no-store' });
      if (res.ok) setKeys((await res.json()) as LlmKeyView[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function addKey() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          provider,
          baseUrl: baseUrl || undefined,
          model: model || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setApiKey('');
      setBaseUrl('');
      setModel('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setBusy(false);
    }
  }

  async function removeKey(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/keys?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const hasKey = keys.length > 0;

  return (
    <div>
      {hasKey ? (
        <div className="mb-4 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          BYOK active — your offices run on your own key, so our agents cost{' '}
          <span className="font-semibold">zero credits</span>.
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-content-muted">
          No key attached. Our agents run on the platform key and spend credits.
          Add your own key below to run them for free.
        </div>
      )}

      {/* Existing keys */}
      {loading ? (
        <p className="text-sm text-content-muted">Loading…</p>
      ) : keys.length === 0 ? null : (
        <ul className="mb-6 space-y-2">
          {keys.map((k) => (
            <li
              key={k.id}
              className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm"
            >
              <span className="font-mono text-content">
                {k.provider}
                {k.model ? ` · ${k.model}` : ''} ·{' '}
                <span className="text-content-muted">sk-…{k.last4}</span>
                {k.officeId ? (
                  <span className="text-content-faint"> (office-scoped)</span>
                ) : (
                  <span className="text-content-faint"> (account default)</span>
                )}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => removeKey(k.id)}
                className="cursor-pointer rounded-lg border border-danger/40 px-2.5 py-0.5 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add form */}
      <div className="card rounded-xl space-y-3 p-4">
        <p className="eyebrow text-[11px] text-content-muted">Add a key</p>
        {error && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-content-muted">Provider</span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-content transition focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="deepseek">DeepSeek</option>
              <option value="openai">OpenAI-compatible</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-content-muted">Model (optional)</span>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="deepseek-v4-pro"
              className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-faint transition focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-content-muted">Base URL (optional)</span>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.deepseek.com"
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-faint transition focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-content-muted">API key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            autoComplete="off"
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-sm text-content placeholder:text-content-faint transition focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>
        <button
          type="button"
          disabled={busy || apiKey.trim().length < 8}
          onClick={addKey}
          className="cursor-pointer rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-accent-fg shadow-sm transition hover:shadow-glow disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-content-muted disabled:shadow-none"
        >
          {busy ? 'Saving…' : 'Save key'}
        </button>
        <p className="text-xs text-content-faint">
          Stored encrypted (AES-256-GCM). Never shown again or sent to the browser.
        </p>
      </div>
    </div>
  );
}
