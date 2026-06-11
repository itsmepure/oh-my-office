// @repo/db/credits — credit metering core (Phase M0).
//
// Model (see docs/MONETIZATION.md):
//   - CreditBalance is the source of truth: { granted, purchased }.
//   - Spend consumes `granted` first, then `purchased`.
//   - CreditLedger is an append-only audit of every movement.
//
// Reserve → settle pattern (used by the orchestrator per platform-agent step):
//   1. reserve(userId, estimate)  — atomically holds `estimate` credits up
//      front (throws InsufficientCreditsError if the balance can't cover it).
//      Prevents overspend when multiple tasks run concurrently.
//   2. settle(reservation, actual) — reconciles to the real token cost:
//      refunds the unused remainder (actual < estimate) or deducts the extra
//      (actual > estimate, best-effort, never below zero), then writes ONE
//      ledger row for the net spend.
//
// All balance mutations run inside an interactive transaction on the balance
// row so concurrent reserves can't race past zero.

import { prisma } from './index.js';
import { PLAN_LIMITS, getPlan } from './entitlements.js';

export class InsufficientCreditsError extends Error {
  readonly code = 'INSUFFICIENT_CREDITS';
  constructor(
    public readonly required: number,
    public readonly available: number,
  ) {
    super(`Insufficient credits: need ${required}, have ${available}`);
    this.name = 'InsufficientCreditsError';
  }
}

/** Tokens that equal one credit. Tuned so an average task ≈ 25 credits.
 * Override via env once real DeepSeek usage is observed in production. */
export const TOKENS_PER_CREDIT = Number(process.env['TOKENS_PER_CREDIT'] ?? 6000);

/** Minimum credits charged for any billable step (avoids 0-credit free rides
 * on tiny calls; also the floor used by the pre-flight guard). */
export const MIN_STEP_CREDITS = 1;

/** Convert token usage to credits (ceil, min 1 when any tokens were used). */
export function tokensToCredits(inputTokens: number, outputTokens: number): number {
  const total = Math.max(0, inputTokens) + Math.max(0, outputTokens);
  if (total === 0) return 0;
  return Math.max(MIN_STEP_CREDITS, Math.ceil(total / TOKENS_PER_CREDIT));
}

/**
 * Refill the monthly grant if the reset date has passed. Lazy-on-read: called
 * by getBalance/canAffordMinStep so there's no cron dependency. Sets `granted`
 * to the user's plan amount and pushes grantResetAt forward by 30 days. The
 * `purchased` bucket is never touched (bought packs don't expire).
 */
export async function refreshGrantIfDue(userId: string): Promise<void> {
  const bal = await prisma.creditBalance.findUnique({ where: { userId } });
  if (!bal) return;
  if (bal.grantResetAt.getTime() > Date.now()) return; // not due yet

  const plan = await getPlan(userId);
  const amount = PLAN_LIMITS[plan].monthlyCredits;
  const nextReset = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.$transaction(async (tx) => {
    // Re-check inside the tx to avoid a double refill under concurrency.
    const fresh = await tx.creditBalance.findUnique({ where: { userId } });
    if (!fresh || fresh.grantResetAt.getTime() > Date.now()) return;
    await tx.creditBalance.update({
      where: { userId },
      data: { granted: amount, grantResetAt: nextReset },
    });
    await tx.creditLedger.create({
      data: { userId, delta: amount, reason: 'monthly_grant' },
    });
  });
}

export interface BalanceView {
  granted: number;
  purchased: number;
  total: number;
  grantResetAt: Date | null;
}

/** Current balance for a user. Refreshes the monthly grant first if due. */
export async function getBalance(userId: string): Promise<BalanceView> {
  await refreshGrantIfDue(userId);
  const row = await prisma.creditBalance.findUnique({ where: { userId } });
  if (!row) return { granted: 0, purchased: 0, total: 0, grantResetAt: null };
  return {
    granted: row.granted,
    purchased: row.purchased,
    total: row.granted + row.purchased,
    grantResetAt: row.grantResetAt,
  };
}

export interface Reservation {
  userId: string;
  estimate: number;
  /** how much of the hold came from each bucket (for accurate refund) */
  fromGranted: number;
  fromPurchased: number;
}

/**
 * Hold `estimate` credits up front. Deducts granted first, then purchased.
 * Throws InsufficientCreditsError if the total balance can't cover it.
 * The returned Reservation MUST be passed to settle() (or release()).
 */
export async function reserve(userId: string, estimate: number): Promise<Reservation> {
  const est = Math.max(0, Math.ceil(estimate));
  return prisma.$transaction(async (tx) => {
    const bal = await tx.creditBalance.findUnique({ where: { userId } });
    const granted = bal?.granted ?? 0;
    const purchased = bal?.purchased ?? 0;
    const total = granted + purchased;
    if (est > total) throw new InsufficientCreditsError(est, total);

    const fromGranted = Math.min(granted, est);
    const fromPurchased = est - fromGranted;

    if (bal) {
      await tx.creditBalance.update({
        where: { userId },
        data: { granted: granted - fromGranted, purchased: purchased - fromPurchased },
      });
    }
    return { userId, estimate: est, fromGranted, fromPurchased };
  });
}

/**
 * Reconcile a reservation to the actual cost and write the ledger row.
 * - actual < estimate → refund the difference (granted bucket first).
 * - actual > estimate → deduct the extra, best-effort, never below zero.
 * Writes a single CreditLedger row with delta = -actualSpent.
 */
export async function settle(
  reservation: Reservation,
  actual: number,
  meta: { taskId?: string; agentRef?: string; inputTokens?: number; outputTokens?: number } = {},
): Promise<number> {
  const want = Math.max(0, Math.ceil(actual));
  return prisma.$transaction(async (tx) => {
    const bal = await tx.creditBalance.findUnique({ where: { userId: reservation.userId } });
    const granted = bal?.granted ?? 0;
    const purchased = bal?.purchased ?? 0;

    let actualSpent = reservation.estimate;
    const diff = reservation.estimate - want; // >0 refund, <0 extra charge

    if (diff > 0) {
      // refund unused: return to the buckets it came from (granted first)
      const refundGranted = Math.min(diff, reservation.fromGranted);
      const refundPurchased = diff - refundGranted;
      if (bal) {
        await tx.creditBalance.update({
          where: { userId: reservation.userId },
          data: { granted: granted + refundGranted, purchased: purchased + refundPurchased },
        });
      }
      actualSpent = want;
    } else if (diff < 0) {
      // underestimated: charge the extra, capped at remaining balance
      const extra = -diff;
      const takeGranted = Math.min(extra, granted);
      const takePurchased = Math.min(extra - takeGranted, purchased);
      if (bal) {
        await tx.creditBalance.update({
          where: { userId: reservation.userId },
          data: { granted: granted - takeGranted, purchased: purchased - takePurchased },
        });
      }
      actualSpent = reservation.estimate + takeGranted + takePurchased;
    }

    if (actualSpent > 0) {
      await tx.creditLedger.create({
        data: {
          userId: reservation.userId,
          delta: -actualSpent,
          reason: 'task_step',
          taskId: meta.taskId ?? null,
          agentRef: meta.agentRef ?? null,
          inputTokens: meta.inputTokens ?? null,
          outputTokens: meta.outputTokens ?? null,
        },
      });
    }
    return actualSpent;
  });
}

/** Release a reservation without charging (e.g. the step errored before any
 * tokens were spent). Returns the full hold to the original buckets. */
export async function release(reservation: Reservation): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const bal = await tx.creditBalance.findUnique({ where: { userId: reservation.userId } });
    if (!bal) return;
    await tx.creditBalance.update({
      where: { userId: reservation.userId },
      data: {
        granted: bal.granted + reservation.fromGranted,
        purchased: bal.purchased + reservation.fromPurchased,
      },
    });
  });
}

/** True if the user can afford at least the minimum billable step. Used by the
 * pre-flight guard before invoking a platform agent on our key. */
export async function canAffordMinStep(userId: string): Promise<boolean> {
  const { total } = await getBalance(userId);
  return total >= MIN_STEP_CREDITS;
}

/** Set the monthly grant (called on signup + on subscription renew). Resets the
 * `granted` bucket to `amount` and pushes grantResetAt forward by 30 days. */
export async function grantMonthly(userId: string, amount: number): Promise<void> {
  const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.$transaction(async (tx) => {
    await tx.creditBalance.upsert({
      where: { userId },
      create: { userId, granted: amount, purchased: 0, grantResetAt: resetAt },
      update: { granted: amount, grantResetAt: resetAt },
    });
    await tx.creditLedger.create({
      data: { userId, delta: amount, reason: 'monthly_grant' },
    });
  });
}

/** Add purchased credits (credit pack top-up). These persist (no reset). */
export async function addPurchased(userId: string, amount: number): Promise<void> {
  const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.$transaction(async (tx) => {
    await tx.creditBalance.upsert({
      where: { userId },
      create: { userId, granted: 0, purchased: amount, grantResetAt: resetAt },
      update: { purchased: { increment: amount } },
    });
    await tx.creditLedger.create({
      data: { userId, delta: amount, reason: 'purchase' },
    });
  });
}

export interface LedgerEntry {
  id: string;
  delta: number;
  reason: string;
  taskId: string | null;
  agentRef: string | null;
  createdAt: string;
}

/** Recent credit ledger entries for the usage history UI (newest first). */
export async function listLedger(userId: string, limit = 50): Promise<LedgerEntry[]> {
  const rows = await prisma.creditLedger.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    delta: r.delta,
    reason: r.reason,
    taskId: r.taskId,
    agentRef: r.agentRef,
    createdAt: r.createdAt.toISOString(),
  }));
}

export interface UsageSummary {
  /** Total credits spent (positive number) all-time. */
  totalSpent: number;
  /** Credits spent in the last 30 days. */
  spentLast30d: number;
  /** Number of billable agent runs (task_step debits). */
  agentRuns: number;
}

/** Aggregate spend stats for the usage dashboard. */
export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [allSpend, recentSpend, runs] = await Promise.all([
    prisma.creditLedger.aggregate({
      where: { userId, delta: { lt: 0 } },
      _sum: { delta: true },
    }),
    prisma.creditLedger.aggregate({
      where: { userId, delta: { lt: 0 }, createdAt: { gte: since } },
      _sum: { delta: true },
    }),
    prisma.creditLedger.count({ where: { userId, reason: 'task_step' } }),
  ]);
  return {
    totalSpent: Math.abs(allSpend._sum.delta ?? 0),
    spentLast30d: Math.abs(recentSpend._sum.delta ?? 0),
    agentRuns: runs,
  };
}
