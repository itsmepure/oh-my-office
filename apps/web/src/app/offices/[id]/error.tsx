'use client';

// Route-level error boundary for the office detail subtree (Phase 9).
// Catches render/runtime errors in the server component or its children and
// offers a retry. Must be a client component (Next.js requirement).

import { useEffect } from 'react';
import Link from 'next/link';

export default function OfficeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[office] route error', error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="card card-glow rounded-2xl max-w-md border-danger/40 p-8 text-center">
        <h1 className="text-2xl font-bold text-content">Something went wrong</h1>
        <p className="mt-2 text-sm text-content-muted">
          We couldn&apos;t load this office. This is usually temporary.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-accent-fg shadow-sm transition hover:shadow-glow"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg border border-line bg-surface/60 px-4 py-2 text-sm font-medium text-content-muted transition hover:border-line-strong hover:text-content"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
