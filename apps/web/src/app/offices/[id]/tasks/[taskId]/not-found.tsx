// Shown when getTaskDetail returns null (missing task, no access, or the task
// belongs to a different office than the URL). Same page for all cases — no
// cross-tenant existence leak.

import Link from 'next/link';

export default function TaskNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="card rounded-2xl max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold text-content">Task not found</h1>
        <p className="mt-2 text-sm text-content-muted">
          This task doesn&apos;t exist, or you don&apos;t have access to it.
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
