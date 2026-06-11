import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getBalance, listLedger, getUsageSummary } from '@repo/db/credits';
import { getEntitlements } from '@repo/db/entitlements';
import { AppHeader } from '@/components/chrome/app-header';
import { buildCheckoutLinks } from '@/lib/checkout';
import { KeyManager } from './key-manager';

export const dynamic = 'force-dynamic';

function reasonLabel(reason: string): string {
  switch (reason) {
    case 'task_step': return 'Agent run';
    case 'monthly_grant': return 'Monthly grant';
    case 'purchase': return 'Credit pack';
    case 'refund': return 'Refund';
    default: return reason;
  }
}

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const [balance, ent, ledger, usage] = await Promise.all([
    getBalance(session.user.id),
    getEntitlements(session.user.id),
    listLedger(session.user.id, 25),
    getUsageSummary(session.user.id),
  ]);
  const CHECKOUT = buildCheckoutLinks(session.user.id, session.user.email);

  return (
    <div className="min-h-screen">
      <AppHeader active="settings" />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8">
          <p className="eyebrow text-[11px] text-content-muted">Account</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight text-content">Settings</h1>
        </div>

        {/* Plan */}
        <section className="mb-10">
          <h2 className="eyebrow mb-3 text-[11px] text-content-muted">Plan</h2>
          <div className="card flex items-center justify-between p-5">
            <div>
              <p className="font-mono text-lg font-semibold text-accent">{ent.plan}</p>
              <p className="mt-1 text-sm text-content-muted">
                {ent.limits.maxOffices === null
                  ? 'Unlimited offices'
                  : `${ent.officeCount} / ${ent.limits.maxOffices} offices`}
                {' · '}
                {ent.limits.monthlyCredits.toLocaleString()} credits/mo
              </p>
            </div>
            {ent.plan === 'FREE' && (
              <div className="flex gap-2">
                {CHECKOUT.pro && (
                  <a
                    href={CHECKOUT.pro}
                    className="bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:bg-accent-bright"
                  >
                    Upgrade to Pro
                  </a>
                )}
                {CHECKOUT.team && (
                  <a
                    href={CHECKOUT.team}
                    className="border border-line px-4 py-2 text-sm font-medium text-content-muted transition hover:border-accent/50 hover:text-content"
                  >
                    Team
                  </a>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Credits */}
        <section className="mb-10">
          <h2 className="eyebrow mb-3 text-[11px] text-content-muted">Credits</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-5">
              <p className="eyebrow text-[11px] text-content-muted">Monthly grant</p>
              <p className="mt-3 text-3xl font-semibold tabular-nums text-content">{balance.granted}</p>
            </div>
            <div className="card p-5">
              <p className="eyebrow text-[11px] text-content-muted">Purchased</p>
              <p className="mt-3 text-3xl font-semibold tabular-nums text-content">{balance.purchased}</p>
            </div>
            <div className="card p-5">
              <p className="eyebrow text-[11px] text-content-muted">Total</p>
              <p className="mt-3 text-3xl font-semibold tabular-nums text-accent">{balance.total}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-content-faint">
              Credits are spent only when our built-in agents run on the platform key.
              Tasks are always unlimited.
            </p>
            {CHECKOUT.packMed && (
              <a
                href={CHECKOUT.packMed}
                className="shrink-0 border border-line px-3 py-1.5 text-xs text-content-muted transition hover:border-accent/50 hover:text-content"
              >
                Buy credits
              </a>
            )}
          </div>
        </section>

        {/* Usage summary */}
        <section className="mb-10">
          <h2 className="eyebrow mb-3 text-[11px] text-content-muted">Usage</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-5">
              <p className="eyebrow text-[11px] text-content-muted">Agent runs</p>
              <p className="mt-3 text-3xl font-semibold tabular-nums text-content">{usage.agentRuns}</p>
            </div>
            <div className="card p-5">
              <p className="eyebrow text-[11px] text-content-muted">Spent (30d)</p>
              <p className="mt-3 text-3xl font-semibold tabular-nums text-content">{usage.spentLast30d}</p>
            </div>
            <div className="card p-5">
              <p className="eyebrow text-[11px] text-content-muted">Spent (all time)</p>
              <p className="mt-3 text-3xl font-semibold tabular-nums text-content">{usage.totalSpent}</p>
            </div>
          </div>
        </section>

        {/* Usage history */}
        <section className="mb-10">
          <h2 className="eyebrow mb-3 text-[11px] text-content-muted">Usage history</h2>
          {ledger.length === 0 ? (
            <p className="border border-dashed border-line p-4 text-sm text-content-muted">
              No credit activity yet.
            </p>
          ) : (
            <ul className="divide-y divide-line border border-line">
              {ledger.map((e) => (
                <li key={e.id} className="flex items-center justify-between bg-surface px-4 py-2 text-sm">
                  <span className="text-content-muted">
                    {reasonLabel(e.reason)}
                    {e.agentRef ? <span className="text-content-faint"> · {e.agentRef.slice(0, 8)}</span> : null}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={`font-mono tabular-nums ${e.delta < 0 ? 'text-danger' : 'text-success'}`}>
                      {e.delta > 0 ? '+' : ''}{e.delta}
                    </span>
                    <time className="font-mono text-[10px] text-content-faint">
                      {new Date(e.createdAt).toLocaleString()}
                    </time>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* BYOK */}
        <section>
          <h2 className="eyebrow mb-3 text-[11px] text-content-muted">Bring your own key</h2>
          <KeyManager />
        </section>
      </main>
    </div>
  );
}
