// /offices/[id]/tasks/[taskId] — task detail view (Phase 9).
// Server component: shows the task prompt, status, produced artifacts, and the
// full ordered activity log. Read is tenant-scoped via getTaskDetail (returns
// null for non-members / missing → notFound).

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { getTaskDetail } from '@repo/db/tasks';
import type { Event as SharedEvent } from '@repo/shared';

export const dynamic = 'force-dynamic';

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'done':
      return 'bg-success/10 text-success';
    case 'failed':
      return 'bg-danger/10 text-danger';
    case 'running':
      return 'bg-accent/10 text-accent';
    case 'queued':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-surface-2 text-content-muted';
  }
}

/** Human label per event type for the activity log. */
function eventLabel(type: SharedEvent['type']): string {
  switch (type) {
    case 'step.start':
      return 'Step started';
    case 'step.done':
      return 'Step done';
    case 'step.failed':
      return 'Step failed';
    case 'agent.thinking':
      return 'Thinking';
    case 'agent.tool_call':
      return 'Tool call';
    case 'agent.output':
      return 'Output';
    case 'task.status':
      return 'Task status';
    default:
      return type;
  }
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id, taskId } = await params;
  const task = await getTaskDetail(taskId, session.user.id);
  // Guard: not found, no access, or task belongs to a different office than the
  // URL's office id (keeps the breadcrumb honest).
  if (!task || task.officeId !== id) notFound();

  return (
    <main className="min-h-screen bg-bg p-4 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="min-w-0">
          <Link
            href={`/offices/${id}`}
            className="text-sm text-content-muted hover:text-content hover:underline cursor-pointer transition"
          >
            ← {task.officeName}
          </Link>
          <div className="mt-1 flex items-start justify-between gap-4">
            <h1 className="min-w-0 text-2xl font-bold text-content sm:text-3xl">Task detail</h1>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass(task.status)}`}
            >
              {task.status}
            </span>
          </div>
        </header>

        {/* Prompt */}
        <section className="card p-4 sm:p-6">
          <h2 className="eyebrow text-content-muted">
            Prompt
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-content">{task.prompt}</p>
          <dl className="mt-4 grid grid-cols-1 gap-2 text-xs text-content-muted sm:grid-cols-2">
            <div>
              <dt className="inline font-medium text-content">Created: </dt>
              <dd className="inline">{new Date(task.createdAt).toLocaleString()}</dd>
            </div>
            {task.finishedAt && (
              <div>
                <dt className="inline font-medium text-content">Finished: </dt>
                <dd className="inline">{new Date(task.finishedAt).toLocaleString()}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* Artifacts */}
        <section className="card p-4 sm:p-6">
          <h2 className="mb-3 text-lg font-semibold text-content">
            Artifacts{' '}
            <span className="text-sm font-normal text-content-muted">({task.artifacts.length})</span>
          </h2>
          {task.artifacts.length === 0 ? (
            <p className="rounded-md border border-dashed border-line p-4 text-sm text-content-muted">
              No artifacts produced. Artifacts appear here when the task completes successfully.
            </p>
          ) : (
            <ul className="space-y-3">
              {task.artifacts.map((a) => (
                <li
                  key={a.id}
                  data-testid="artifact-row"
                  className="rounded-md border border-line bg-surface-2 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-sm font-medium text-content">{a.name}</span>
                    <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] uppercase text-content-muted">
                      {a.type}
                    </span>
                  </div>
                  {a.content ? (
                    <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-xs text-content font-mono">
                      {a.content}
                    </pre>
                  ) : a.fileRef ? (
                    <p className="mt-2 break-all font-mono text-xs text-content-muted">{a.fileRef}</p>
                  ) : (
                    <p className="mt-2 text-xs text-content-faint">(empty)</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Activity log */}
        <section className="card p-4 sm:p-6">
          <h2 className="mb-3 text-lg font-semibold text-content">
            Activity log{' '}
            <span className="text-sm font-normal text-content-muted">({task.events.length})</span>
          </h2>
          {task.events.length === 0 ? (
            <p className="rounded-md border border-dashed border-line p-4 text-sm text-content-muted">
              No events recorded for this task.
            </p>
          ) : (
            <ol className="space-y-2">
              {task.events.map((ev, idx) => (
                <li
                  key={`${ev.taskId}-${ev.ts}-${idx}`}
                  data-testid="activity-log-row"
                  className="rounded-md border border-line bg-surface-2 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-content">{eventLabel(ev.type)}</span>
                    <time className="shrink-0 text-xs text-content-muted" dateTime={ev.ts}>
                      {new Date(ev.ts).toLocaleTimeString()}
                    </time>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-content-muted">
                    <span className="font-mono">{ev.type}</span>
                    {'agentRef' in ev && ev.agentRef ? (
                      <span>
                        agent <span className="font-mono">{ev.agentRef}</span>
                      </span>
                    ) : null}
                    {'tool' in ev && ev.tool ? (
                      <span>
                        tool <span className="font-mono">{ev.tool}</span>
                      </span>
                    ) : null}
                  </div>
                  {'output' in ev && ev.output ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-content">{ev.output}</p>
                  ) : null}
                  {'error' in ev && ev.error ? (
                    <p className="mt-2 text-sm text-danger">{ev.error}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
