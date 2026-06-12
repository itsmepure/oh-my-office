// Shown when getOfficeById returns null (missing office or no access).
// We deliberately don't distinguish "missing" from "forbidden" — both render
// the same page so we never leak cross-tenant existence.

import Link from 'next/link';

export default function OfficeNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="card rounded-2xl max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold text-content">Office not found</h1>
        <p className="mt-2 text-sm text-content-muted">
          This office doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-accent-fg shadow-sm transition hover:shadow-glow"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
