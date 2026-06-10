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
      <div className="max-w-md rounded-md border border-danger/40 bg-surface p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-content">Something went wrong</h1>
        <p className="mt-2 text-sm text-content-muted">
          We couldn&apos;t load this office. This is usually temporary.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:bg-accent-bright"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-content-muted hover:bg-surface-2 hover:text-content"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
