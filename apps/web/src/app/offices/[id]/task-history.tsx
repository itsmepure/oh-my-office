// Task history — server component. Lists every task for an office, newest
// first, linking each to its detail page. Read is tenant-scoped via
// listOfficeTasks (membership check inside).

import Link from 'next/link';
import type { TaskSummaryView } from '@repo/shared';

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'done':
      return 'bg-success/10 text-success';
    case 'failed':
      return 'bg-danger/10 text-danger';
    case 'running':
      return 'bg-accent/10 text-accent';
    case 'queued':
      return 'bg-accent/10 text-accent';
    default:
      return 'bg-surface-2 text-content-muted';
  }
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TaskHistory({
  officeId,
  tasks,
}: {
  officeId: string;
  tasks: TaskSummaryView[];
}) {
  return (
    <div>
      <p className="mb-4 text-sm text-content-muted">
        Every task this office has run. Open one to review its artifacts and full activity log.
      </p>

      {tasks.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-4 text-sm text-content-muted">
          No tasks yet. Queue one to get started.
        </p>
      ) : (
        <ul className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {tasks.map((t) => (
            <li key={t.id} data-testid="task-history-row" data-task-id={t.id}>
              <Link
                href={`/offices/${officeId}/tasks/${t.id}`}
                className="block rounded-md border border-line bg-surface-2 p-3 transition hover:border-accent hover:bg-surface cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-content">
                    {t.prompt}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(t.status)}`}
                  >
                    {t.status}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted">
                  <time dateTime={t.createdAt}>{formatWhen(t.createdAt)}</time>
                  <span>· {t.eventCount} events</span>
                  <span>· {t.artifactCount} artifacts</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
