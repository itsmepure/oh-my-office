// /agents — list all agents the current user created.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { listUserAgents } from '@repo/db/agents';

export const dynamic = 'force-dynamic';

export default async function AgentsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const agents = await listUserAgents(session.user.id);

  return (
    <main className="min-h-screen bg-bg p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-content">My Agents</h1>
            <p className="mt-1 text-sm text-content-muted">
              Your custom AI agents. Add them to an office from the office detail
              page.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/dashboard"
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-content-muted hover:bg-surface-2 hover:text-content"
            >
              ← Dashboard
            </Link>
            <Link
              href="/agents/new"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:bg-accent-bright"
            >
              Create agent
            </Link>
          </div>
        </header>

        {agents.length === 0 ? (
          <div className="border border-dashed border-line bg-surface p-12 text-center">
            <p className="font-mono text-sm text-content">No agents yet.</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-content-muted">
              Your custom AI agents live here. Build one, then add it to an office
              from the office detail page.
            </p>
            <Link
              href="/agents/new"
              className="mt-6 inline-block bg-accent px-5 py-2.5 text-sm font-medium text-bg transition hover:bg-accent-bright"
            >
              + Create agent
            </Link>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {agents.map((a) => (
              <li
                key={a.id}
                className="rounded-md border border-line bg-surface p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-content">{a.name}</h3>
                    <span className="text-xs text-content-muted">{a.role}</span>
                  </div>
                  <div className="flex gap-1">
                    <Link
                      href={`/agents/${a.id}/edit`}
                      className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs text-content-muted hover:bg-surface-2 hover:text-content"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/agents/${a.id}`}
                      className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-content-muted hover:bg-surface"
                    >
                      View
                    </Link>
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-content-muted">
                  {a.systemPrompt}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {a.tools.map((t) => (
                    <span
                      key={t}
                      className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-content-muted"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
