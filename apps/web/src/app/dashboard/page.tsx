import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { listUserOffices } from '@repo/db/offices';
import { getEntitlements } from '@repo/db/entitlements';
import { AppHeader } from '@/components/chrome/app-header';
import { OnboardingBanner } from './onboarding-banner';
import {
  IconBuilding,
  IconUsers,
  IconActivity,
  IconLayers,
  IconPlus,
  IconArrowRight,
  IconBox,
} from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  const offices = await listUserOffices(session.user.id);
  const ent = await getEntitlements(session.user.id);
  const atCap = ent.limits.maxOffices !== null && ent.officeCount >= ent.limits.maxOffices;

  const totalOffices = offices.length;
  const totalAgents = offices.reduce((sum, o) => sum + o.agents.length, 0);
  const runningOffices = offices.filter((o) => o.status === 'running').length;
  const templatesUsed = new Set(offices.map((o) => o.templateName)).size;

  const stats = [
    { label: 'Offices', value: totalOffices, hint: 'workspaces you own', Icon: IconBuilding },
    { label: 'Agents', value: totalAgents, hint: 'across all offices', Icon: IconUsers },
    { label: 'Running', value: runningOffices, hint: 'tasks in progress', Icon: IconActivity },
    { label: 'Templates', value: templatesUsed, hint: 'distinct recipes', Icon: IconLayers },
  ];

  return (
    <div className="min-h-screen">
      <AppHeader active="dashboard" />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <OnboardingBanner userName={session.user.name ?? 'there'} />

        {/* Hero */}
        <div className="mb-10">
          <p className="eyebrow text-[11px] text-content-muted">Agentic Workspace</p>
          <h1 className="mt-2 text-4xl font-medium tracking-tight text-content">
            Welcome back, <span className="text-accent">{session.user.name}</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-content-muted">
            Your AI offices at a glance. Spin up a team from a template, then watch
            them work the task pipeline in real time.
          </p>
        </div>

        {/* Stats */}
        <section className="mb-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map(({ label, value, hint, Icon }) => (
            <div key={label} className="card card-hover rounded-lg p-5">
              <div className="flex items-center justify-between">
                <p className="eyebrow text-[11px] text-content-muted">{label}</p>
                <Icon className="h-4 w-4 text-content-faint" />
              </div>
              <p className="mt-3 text-4xl font-semibold tabular-nums text-content">
                {value}
              </p>
              <p className="mt-1.5 text-xs text-content-faint">{hint}</p>
            </div>
          ))}
        </section>

        {/* Office list */}
        <section>
          <div className="mb-5 flex items-end justify-between">
            <div>
              <h2 className="eyebrow text-[11px] text-content-muted">Office List</h2>
              <p className="mt-1 text-lg font-medium text-content">
                Your offices{' '}
                <span className="font-mono text-sm text-content-faint">
                  ({ent.officeCount}
                  {ent.limits.maxOffices !== null ? ` / ${ent.limits.maxOffices}` : ''})
                </span>
              </p>
            </div>
            {atCap ? (
              <Link
                href="/settings"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-accent/50 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent hover:text-bg"
                title={`Your plan allows ${ent.limits.maxOffices} offices. Upgrade for more.`}
              >
                <IconPlus className="h-4 w-4" />
                Upgrade for more offices
              </Link>
            ) : (
              <Link
                href="/templates"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:bg-accent-bright"
              >
                <IconPlus className="h-4 w-4" />
                New office
              </Link>
            )}
          </div>

          {offices.length === 0 ? (
            <div className="card rounded-lg border-dashed p-16 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface-2 text-content-muted">
                <IconBox className="h-6 w-6" />
              </span>
              <p className="mt-4 font-mono text-sm text-content">No offices yet.</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-content-muted">
                Pick a template from the catalog to spin up your first AI office and
                start running tasks.
              </p>
              <Link
                href="/templates"
                className="mt-6 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-accent/50 px-5 py-2.5 text-sm font-medium text-accent transition hover:bg-accent hover:text-bg"
              >
                Browse templates
                <IconArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {offices.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/offices/${o.id}`}
                    className="card card-hover group block h-full cursor-pointer rounded-lg p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface-2 text-accent">
                        <IconBuilding className="h-[18px] w-[18px]" />
                      </span>
                      <StatusPill status={o.status} />
                    </div>
                    <h3 className="mt-4 font-medium leading-tight text-content transition group-hover:text-accent">
                      {o.name}
                    </h3>
                    <p className="mt-1 font-mono text-xs text-content-muted">
                      {o.templateName} · {o.agents.length} agents
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex -space-x-1.5">
                        {o.agents.slice(0, 5).map((a) => (
                          <span
                            key={a.id}
                            title={a.agent.name}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-accent/30 bg-surface-2 text-xs font-semibold text-content ring-1 ring-bg"
                          >
                            {a.agent.name.charAt(0).toUpperCase()}
                          </span>
                        ))}
                      </div>
                      <IconArrowRight className="h-4 w-4 text-content-faint transition group-hover:translate-x-0.5 group-hover:text-accent" />
                    </div>
                  </Link>
                </li>
              ))}

              {/* Create-next placeholder tile — keeps the grid balanced. Hidden at cap. */}
              {!atCap && (
              <li>
                <Link
                  href="/templates"
                  className="card-hover group flex h-full min-h-[168px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-line p-5 text-center transition hover:border-accent/50"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface-2 text-content-muted transition group-hover:text-accent">
                    <IconPlus className="h-[18px] w-[18px]" />
                  </span>
                  <p className="mt-3 text-sm font-medium text-content-muted transition group-hover:text-content">
                    New office
                  </p>
                  <p className="mt-1 text-xs text-content-faint">From a template</p>
                </Link>
              </li>
              )}
            </ul>
          )}
        </section>
      </main>
    </div>
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
      className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${styles}`}
    >
      {status}
    </span>
  );
}
