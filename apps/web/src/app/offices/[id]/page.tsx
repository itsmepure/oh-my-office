// /offices/[id] — Office detail. Layout per wireframe:
//   header
//   ┌───────────────────────────┬──────────────┐
//   │ pixel office (≈70%)        │ live feed    │
//   ├───────────────────────────┴──────────────┤
//   │ terminal task (full width)                │
//   ├──────────────────────┬────────────────────┤
//   │ agent list           │ task history       │
//   └──────────────────────┴────────────────────┘

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { prisma } from '@repo/db';
import { getOfficeById } from '@repo/db/offices';
import { listUserAgents, listPlatformAgents } from '@repo/db/agents';
import { listOfficeTasks } from '@repo/db/tasks';
import { getPlan } from '@repo/db/entitlements';
import { getBalance } from '@repo/db/credits';
import { resolveOfficeKey } from '@repo/db/keys';
import { ManageOfficeAgents } from './manage-agents';
import { TaskRunner } from './task-runner';
import { ActivityFeed } from './activity-feed';
import { TaskHistory } from './task-history';
import { TeamMembers } from './team-members';
import { WorkspaceFiles } from './workspace-files';
import { OfficeControls } from './office-controls';
import { PixelOffice } from '@/components/pixel-office/pixel-office';
import { AppHeader } from '@/components/chrome/app-header';
import { CreditWarning } from '@/components/credit-warning';
import { IconArrowRight, IconTerminal, IconUsers, IconActivity } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function OfficeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id } = await params;
  const office = await getOfficeById(id, session.user.id);
  if (!office) notFound();

  const [myAgents, platformAgents, tasks, officeRow] = await Promise.all([
    listUserAgents(session.user.id),
    listPlatformAgents(),
    listOfficeTasks(id, session.user.id),
    prisma.office.findUnique({ where: { id }, select: { ownerId: true } }),
  ]);

  // Team members panel: only the office owner on a Team plan can manage members.
  const isOwner = officeRow?.ownerId === session.user.id;
  const ownerPlan = isOwner ? await getPlan(session.user.id) : 'FREE';
  const showTeamPanel = isOwner && ownerPlan === 'TEAM';

  // Credit warning: billed to the office OWNER's pool, and only when running on
  // the platform key (BYOK runs are free, so no warning).
  const billingUserId = officeRow?.ownerId ?? session.user.id;
  const [balance, resolvedKey] = await Promise.all([
    getBalance(billingUserId),
    resolveOfficeKey(id, billingUserId),
  ]);

  // Addable pool = the user's own agents + the platform library. Dedupe by id
  // in case a user agent ever overlaps.
  const seen = new Set<string>();
  const availableAgents = [...myAgents, ...platformAgents].filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  return (
    <div className="min-h-screen">
      <AppHeader />

      <main className="mx-auto max-w-6xl px-6 py-8">
        <CreditWarning total={balance.total} isByok={resolvedKey.isByok} />

        {/* Title row */}
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 font-mono text-xs text-content-muted transition hover:text-content"
          >
            <IconArrowRight className="h-3.5 w-3.5 rotate-180" />
            Dashboard
          </Link>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-medium tracking-tight text-content">
                {office.name}
              </h1>
              <p className="mt-1 font-mono text-xs text-content-muted">
                {office.templateName} · {office.agents.length} agents ·{' '}
                <span className="break-all text-content-faint">{office.workspacePath}</span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {isOwner && <OfficeControls officeId={office.id} name={office.name} />}
              <StatusPill status={office.status} />
            </div>
          </div>
        </div>

        {/* Row 1: pixel office (wide) + live activity feed (narrow) */}
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Panel label="Pixel Office" className="p-4">
            {office.agents.length > 0 ? (
              <PixelOffice agents={office.agents} />
            ) : (
              <div className="flex h-[300px] items-center justify-center rounded-md border border-dashed border-line text-center text-sm text-content-muted">
                Add at least one agent to see the pixel office.
              </div>
            )}
          </Panel>

          <Panel label="Live Activity Feed" icon={<IconActivity className="h-3.5 w-3.5" />} className="p-4">
            <ActivityFeed officeId={office.id} agents={office.agents} />
          </Panel>
        </div>

        {/* Row 2: terminal task (full width) */}
        <div className="mt-4">
          <Panel label="Terminal Task" icon={<IconTerminal className="h-3.5 w-3.5" />} className="p-4">
            <TaskRunner officeId={office.id} />
          </Panel>
        </div>

        {/* Row 3: agent list + task history */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel label="Agent List" icon={<IconUsers className="h-3.5 w-3.5" />} className="p-4">
            <ManageOfficeAgents office={office} myAgents={availableAgents} />
          </Panel>

          <Panel label="Task History" className="p-4">
            <TaskHistory officeId={office.id} tasks={tasks} />
          </Panel>
        </div>

        {/* Row 3b: Workspace files (output the agents produced) */}
        <div className="mt-4">
          <Panel label="Files" icon={<IconTerminal className="h-3.5 w-3.5" />} className="p-4">
            <WorkspaceFiles officeId={office.id} />
          </Panel>
        </div>

        {/* Row 4: Team members (only for Team-plan owners) */}
        {showTeamPanel && officeRow && (
          <div className="mt-4">
            <Panel label="Team Members" icon={<IconUsers className="h-3.5 w-3.5" />} className="p-4">
              <TeamMembers officeId={office.id} ownerId={officeRow.ownerId} />
            </Panel>
          </div>
        )}
      </main>
    </div>
  );
}

/** A titled glass panel with an eyebrow label header. */
function Panel({
  label,
  icon,
  className = '',
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card rounded-lg">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-content-muted">
        {icon}
        <h2 className="eyebrow text-[11px]">{label}</h2>
      </div>
      <div className={className}>{children}</div>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles =
    status === 'running'
      ? 'border-accent/40 bg-accent/10 text-accent'
      : status === 'done'
        ? 'border-success/40 bg-success/10 text-success'
        : 'border-line bg-surface-2 text-content-muted';
  return (
    <span
      className={`shrink-0 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${styles}`}
    >
      {status}
    </span>
  );
}
