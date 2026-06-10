// Shown when getTaskDetail returns null (missing task, no access, or the task
// belongs to a different office than the URL). Same page for all cases — no
// cross-tenant existence leak.

import Link from 'next/link';

export default function TaskNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="max-w-md rounded-md border border-line bg-surface p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-content">Task not found</h1>
        <p className="mt-2 text-sm text-content-muted">
          This task doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:bg-accent-bright"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
