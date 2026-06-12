'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const DISMISS_KEY = 'oo_onboarding_dismissed_v1';

/**
 * First-run onboarding banner (Phase G4). Explains the core mental model —
 * tasks are unlimited, our agents cost credits, BYOK is free — and points to
 * the first actions. Dismissible; dismissal persists in localStorage.
 *
 * Rendered on the dashboard. `forceShow` (e.g. user has 0 offices) can keep it
 * visible until dismissed even on return visits.
 */
export function OnboardingBanner({ userName }: { userName: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(DISMISS_KEY) !== '1');
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  return (
    <div className="card card-glow relative mb-8 overflow-hidden rounded-2xl p-6">
      <div className="hero-glow opacity-70" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-[11px] text-accent-bright">Getting started</p>
            <h2 className="mt-1.5 text-lg font-semibold text-content">
              Welcome to OpenOffice, {userName}
            </h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="cursor-pointer rounded-lg border border-line px-2.5 py-1 text-xs text-content-muted transition hover:border-line-strong hover:text-content"
          >
            Dismiss
          </button>
        </div>

        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-content-muted">
          Spin up an AI office from a template and give it a task — the team of
          agents runs the pipeline and produces real files you can download.
          <span className="font-medium text-content"> Tasks are always unlimited.</span> Our
          built-in agents draw from your monthly credits;{' '}
          <span className="font-medium text-accent3">bring your own API key and they run for free.</span>
        </p>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link
            href="/templates"
            className="bg-brand-gradient cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-accent-fg shadow-sm transition hover:shadow-glow"
          >
            Create your first office
          </Link>
          <Link
            href="/settings"
            className="cursor-pointer rounded-lg border border-line bg-surface/60 px-4 py-2 text-sm font-medium text-content-muted transition hover:border-line-strong hover:text-content"
          >
            Add your API key (free runs)
          </Link>
          <Link
            href="/agents"
            className="cursor-pointer rounded-lg border border-line bg-surface/60 px-4 py-2 text-sm font-medium text-content-muted transition hover:border-line-strong hover:text-content"
          >
            Build an agent
          </Link>
        </div>
      </div>
    </div>
  );
}
