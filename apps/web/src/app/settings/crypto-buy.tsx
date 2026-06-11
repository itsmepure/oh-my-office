'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'react-qr-code';

interface Pack {
  id: string;
  label: string;
  usdc: string;
}

const PACKS: Pack[] = [
  { id: 'small', label: '1,000 credits', usdc: '5' },
  { id: 'med', label: '5,000 credits', usdc: '20' },
  { id: 'large', label: '15,000 credits', usdc: '50' },
];

type Phase = 'idle' | 'creating' | 'awaiting' | 'confirmed' | 'error';

export function CryptoBuy() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [url, setUrl] = useState('');
  const [reference, setReference] = useState('');
  const [activePack, setActivePack] = useState<Pack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  async function start(pack: Pack) {
    setError(null);
    setActivePack(pack);
    setPhase('creating');
    try {
      const res = await fetch('/api/billing/crypto', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packId: pack.id }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? `Failed (${res.status})`);
        setPhase('error');
        return;
      }
      const data = (await res.json()) as { url: string; reference: string };
      setUrl(data.url);
      setReference(data.reference);
      setPhase('awaiting');
      // Poll for confirmation every 4s.
      pollRef.current = setInterval(() => void poll(data.reference), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
      setPhase('error');
    }
  }

  async function poll(ref: string) {
    try {
      const res = await fetch(`/api/billing/crypto?reference=${encodeURIComponent(ref)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { status: string };
      if (data.status === 'confirmed') {
        stopPolling();
        setPhase('confirmed');
        router.refresh(); // refresh credit balance on the page
      } else if (data.status === 'expired' || data.status === 'failed') {
        stopPolling();
        setError(`Payment ${data.status}.`);
        setPhase('error');
      }
    } catch {
      /* keep polling */
    }
  }

  function reset() {
    stopPolling();
    setPhase('idle');
    setUrl('');
    setReference('');
    setActivePack(null);
    setError(null);
  }

  if (phase === 'confirmed') {
    return (
      <div className="border border-success/40 bg-success/10 p-4 text-sm text-success">
        Payment confirmed — {activePack?.label} added to your balance.
        <button type="button" onClick={reset} className="ml-3 cursor-pointer underline">
          Buy more
        </button>
      </div>
    );
  }

  if (phase === 'awaiting' && url) {
    return (
      <div className="border border-line bg-surface p-4">
        <p className="text-sm text-content">
          Pay <span className="font-semibold text-accent">{activePack?.usdc} USDC</span> on Solana
          to get {activePack?.label}.
        </p>
        <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row">
          <div className="bg-white p-3">
            <QRCode value={url} size={160} />
          </div>
          <div className="text-xs text-content-muted">
            <p>Scan with a Solana wallet (Phantom, Solflare), or:</p>
            <a
              href={url}
              className="mt-2 inline-block cursor-pointer bg-accent px-3 py-1.5 text-bg transition hover:bg-accent-bright"
            >
              Open in wallet
            </a>
            <p className="mt-3 flex items-center gap-2 text-content-faint">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
              Waiting for payment… (auto-detects on-chain)
            </p>
            <p className="mt-1 font-mono text-[10px] text-content-faint break-all">ref: {reference.slice(0, 16)}…</p>
            <button type="button" onClick={reset} className="mt-3 cursor-pointer text-content-muted underline">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-3 border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {PACKS.map((p) => (
          <div key={p.id} className="border border-line bg-surface-2 p-4 text-center">
            <p className="font-mono text-sm text-content">{p.label}</p>
            <p className="mt-1 text-2xl font-semibold text-accent">{p.usdc} USDC</p>
            <button
              type="button"
              disabled={phase === 'creating'}
              onClick={() => void start(p)}
              className="mt-3 w-full cursor-pointer bg-accent px-3 py-1.5 text-xs font-medium text-bg transition hover:bg-accent-bright disabled:opacity-50"
            >
              {phase === 'creating' && activePack?.id === p.id ? 'Creating…' : 'Pay with USDC'}
            </button>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-content-faint">Solana · USDC. Tasks stay unlimited; credits only fund our agents.</p>
    </div>
  );
}
