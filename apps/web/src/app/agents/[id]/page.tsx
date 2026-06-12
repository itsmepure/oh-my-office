// /agents/[id] — single-agent detail page.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { getAgentById, deleteKnowledgeDoc as delDoc } from '@repo/db/agents';

export const dynamic = 'force-dynamic';

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id } = await params;
  const agent = await getAgentById(id, session.user.id, { includeDocs: true });
  if (!agent) notFound();

  return (
    <main className="min-h-screen bg-bg p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-start justify-between">
          <div>
            <Link href="/agents" className="text-sm text-content-muted hover:underline">
              ← My Agents
            </Link>
            <h1 className="mt-1 text-3xl font-bold text-content">{agent.name}</h1>
            <p className="text-sm text-content-muted">{agent.role}</p>
          </div>
          <Link
            href={`/agents/${agent.id}/edit`}
            className="rounded-lg border border-line bg-surface/60 px-4 py-2 text-sm font-medium text-content-muted transition hover:border-line-strong hover:text-content"
          >
            Edit
          </Link>
        </header>

        <section className="card rounded-xl p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-content-muted">
            System prompt
          </h2>
          <pre className="mt-2 whitespace-pre-wrap text-sm text-content font-mono">
            {agent.systemPrompt}
          </pre>
        </section>

        <section className="card rounded-xl p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-content-muted">
            Tools
          </h2>
          <div className="mt-2 flex flex-wrap gap-1">
            {agent.tools.map((t) => (
              <span key={t} className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-content-muted">
                {t}
              </span>
            ))}
          </div>
        </section>

        {'knowledgeDocs' in agent && agent.knowledgeDocs && agent.knowledgeDocs.length > 0 && (
          <section className="card rounded-xl p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-content-muted">
              Knowledge docs ({agent.knowledgeDocs.length})
            </h2>
            <ul className="mt-2 space-y-2">
              {agent.knowledgeDocs.map((doc) => (
                <li key={doc.id} className="rounded-md border border-line bg-surface-2 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-content">{doc.title}</span>
                    <form action={async () => {
                      'use server';
                      await delDoc(doc.id, session.user!.id);
                    }} className="ml-2">
                      <button
                        type="submit"
                        className="text-xs text-danger hover:underline"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                  {doc.content && (
                    <pre className="mt-1 whitespace-pre-wrap text-xs text-content-muted font-mono">
                      {doc.content}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
