// Catalog page — list the 3 seeded templates with their composition.
// Server component: calls the DB directly (no fetch round-trip).
// Auth is enforced by middleware (any /dashboard|/templates|/offices path
// redirects to /login if the session cookie is missing).

import Link from 'next/link';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { listTemplates } from '@repo/db/offices';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const templates = await listTemplates();

  return (
    <main className="min-h-screen bg-bg p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-content">Template Catalog</h1>
            <p className="mt-1 text-sm text-content-muted">
              Pick a recipe to spin up your office. Each office snapshots the
              agent configs at creation time — editing a template later won&apos;t
              affect existing offices.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-content-muted hover:bg-surface-2 hover:text-content"
          >
            ← Dashboard
          </Link>
        </header>

        {templates.length === 0 ? (
          <div className="rounded-md border border-dashed border-line bg-surface p-8 text-center text-sm text-content-muted">
            No templates available. Run{' '}
            <code className="rounded-md bg-surface-2 px-1.5 py-0.5 text-accent font-mono">pnpm --filter @repo/db seed</code>{' '}
            to populate the catalog.
          </div>
        ) : (
          <ul className="space-y-4">
            {templates.map((t) => (
              <li
                key={t.id}
                className="rounded-md border border-line bg-surface p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold text-content">{t.name}</h2>
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-content-muted">
                        {t.category}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-content-muted">{t.description}</p>
                  </div>
                  <Link
                    href={`/templates/${t.id}/new`}
                    className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:bg-accent-bright"
                  >
                    Create office
                  </Link>
                </div>

                {/* Workflow steps */}
                <div className="mt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-content-muted">
                    Workflow
                  </h3>
                  <ol className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    {t.workflow.map((step, idx) => (
                      <li key={step.order} className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
                          {step.order}
                        </span>
                        <span className="font-medium text-content">{step.label}</span>
                        {idx < t.workflow.length - 1 && (
                          <span className="text-content-muted">→</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Agents */}
                <div className="mt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-content-muted">
                    Agents ({t.agents.length})
                  </h3>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {t.agents.map((a) => (
                      <li
                        key={a.id}
                        className="rounded-md border border-line bg-surface-2 p-3 text-sm"
                      >
                        <div className="font-medium text-content">{a.name}</div>
                        <div className="text-xs text-content-muted">{a.role}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
