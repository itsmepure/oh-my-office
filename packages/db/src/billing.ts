// @repo/db/billing — subscription + credit-pack fulfillment (Phase M3).
//
// Called by the Lemon Squeezy webhook after signature verification. Maps a
// billing event to the user's Subscription + credit grant. Idempotent where it
// matters (setting plan is naturally idempotent; pack purchases use the event
// id guard in the route).

import { prisma } from './index.js';
import { grantMonthly } from './credits.js';
import { PLAN_LIMITS, type Plan } from './entitlements.js';

/** Activate or change a paid subscription: set plan + (re)grant monthly credits. */
export async function activateSubscription(input: {
  userId: string;
  plan: Plan;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  currentPeriodEnd?: Date | null;
}): Promise<void> {
  await prisma.subscription.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      plan: input.plan,
      status: 'active',
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
    },
    update: {
      plan: input.plan,
      status: 'active',
      stripeCustomerId: input.stripeCustomerId ?? undefined,
      stripeSubscriptionId: input.stripeSubscriptionId ?? undefined,
      currentPeriodEnd: input.currentPeriodEnd ?? undefined,
    },
  });
  // Grant the new plan's monthly credits immediately on activation/renewal.
  await grantMonthly(input.userId, PLAN_LIMITS[input.plan].monthlyCredits);
}

/** Mark a subscription past_due (payment failed) — keeps plan, flags status. */
export async function markPastDue(userId: string): Promise<void> {
  await prisma.subscription.updateMany({
    where: { userId },
    data: { status: 'past_due' },
  });
}

/** Cancel: downgrade to FREE. Credits already granted are kept until reset. */
export async function cancelSubscription(userId: string): Promise<void> {
  await prisma.subscription.updateMany({
    where: { userId },
    data: { plan: 'FREE', status: 'canceled' },
  });
}

/**
 * Fulfill a one-off credit-pack purchase. Idempotent when `orderRef` is given:
 * if a purchase ledger row already references that order, this is a no-op
 * (protects against webhook replays double-crediting).
 */
export async function fulfillCreditPack(
  userId: string,
  credits: number,
  orderRef?: string,
): Promise<boolean> {
  if (orderRef) {
    const existing = await prisma.creditLedger.findFirst({
      where: { userId, reason: 'purchase', agentRef: `order:${orderRef}` },
    });
    if (existing) return false; // already fulfilled
  }
  await prisma.$transaction(async (tx) => {
    const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await tx.creditBalance.upsert({
      where: { userId },
      create: { userId, granted: 0, purchased: credits, grantResetAt: resetAt },
      update: { purchased: { increment: credits } },
    });
    await tx.creditLedger.create({
      data: {
        userId,
        delta: credits,
        reason: 'purchase',
        agentRef: orderRef ? `order:${orderRef}` : null,
      },
    });
  });
  return true;
}

/** Refund credits (e.g. dispute / chargeback). Deducts from purchased first. */
export async function refundCredits(userId: string, credits: number, ref?: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const bal = await tx.creditBalance.findUnique({ where: { userId } });
    if (!bal) return;
    const fromPurchased = Math.min(bal.purchased, credits);
    const fromGranted = Math.min(bal.granted, credits - fromPurchased);
    await tx.creditBalance.update({
      where: { userId },
      data: { purchased: bal.purchased - fromPurchased, granted: bal.granted - fromGranted },
    });
    await tx.creditLedger.create({
      data: { userId, delta: -(fromPurchased + fromGranted), reason: 'refund', agentRef: ref ? `refund:${ref}` : null },
    });
  });
}
