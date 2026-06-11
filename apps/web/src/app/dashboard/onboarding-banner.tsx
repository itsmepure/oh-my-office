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
    <div className="mb-8 border border-accent/40 bg-accent/[0.06] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-[11px] text-accent">Getting started</p>
          <h2 className="mt-1 text-lg font-medium text-content">
            Welcome to OpenOffice, {userName}
          </h2>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="cursor-pointer border border-line px-2 py-0.5 text-xs text-content-muted transition hover:text-content"
        >
          Dismiss
        </button>
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-content-muted">
        Spin up an AI office from a template and give it a task — the team of
        agents runs the pipeline and produces real files you can download.
        <span className="text-content"> Tasks are always unlimited.</span> Our
        built-in agents draw from your monthly credits;{' '}
        <span className="text-content">bring your own API key and they run for free.</span>
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/templates"
          className="cursor-pointer bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:bg-accent-bright"
        >
          Create your first office
        </Link>
        <Link
          href="/settings"
          className="cursor-pointer border border-line px-4 py-2 text-sm font-medium text-content-muted transition hover:border-accent/50 hover:text-content"
        >
          Add your API key (free runs)
        </Link>
        <Link
          href="/agents"
          className="cursor-pointer border border-line px-4 py-2 text-sm font-medium text-content-muted transition hover:border-accent/50 hover:text-content"
        >
          Build an agent
        </Link>
      </div>
    </div>
  );
}
