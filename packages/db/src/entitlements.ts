// @repo/db/entitlements — plan limits + capability checks (Phase M3).
//
// A user's Subscription.plan determines what they can DO (capabilities), while
// credits determine how much our agents can RUN (see credits.ts). This module
// is the single source of truth for plan limits; enforce it server-side in the
// relevant API routes and mirror it in the UI (disabled states / upgrade
// prompts).

import { prisma } from './index.js';

export type Plan = 'FREE' | 'PRO' | 'TEAM';

export interface PlanLimits {
  /** Max offices the user can own. null = unlimited. */
  maxOffices: number | null;
  /** Full agent builder (knowledge docs, all tools). */
  agentBuilderFull: boolean;
  /** Multi-member / shared offices (Team). */
  multiMember: boolean;
  /** Priority queue for tasks (Team). */
  priorityQueue: boolean;
  /** Monthly credit grant for this plan. */
  monthlyCredits: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    maxOffices: 2,
    agentBuilderFull: false,
    multiMember: false,
    priorityQueue: false,
    monthlyCredits: 500,
  },
  PRO: {
    maxOffices: null,
    agentBuilderFull: true,
    multiMember: false,
    priorityQueue: false,
    monthlyCredits: 5000,
  },
  TEAM: {
    maxOffices: null,
    agentBuilderFull: true,
    multiMember: true,
    priorityQueue: true,
    monthlyCredits: 20000,
  },
};

/** Resolve a user's current plan (defaults to FREE if no subscription row). */
export async function getPlan(userId: string): Promise<Plan> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub || sub.status === 'canceled') return 'FREE';
  return sub.plan as Plan;
}

export async function getLimits(userId: string): Promise<PlanLimits> {
  return PLAN_LIMITS[await getPlan(userId)];
}

export interface EntitlementResult {
  allowed: boolean;
  reason?: string;
  /** suggested upgrade target when blocked */
  upgradeTo?: Plan;
}

/** Can the user create another office? Enforces the per-plan office cap. */
export async function canCreateOffice(userId: string): Promise<EntitlementResult> {
  const limits = await getLimits(userId);
  if (limits.maxOffices === null) return { allowed: true };
  const count = await prisma.office.count({ where: { ownerId: userId } });
  if (count >= limits.maxOffices) {
    return {
      allowed: false,
      reason: `Your plan allows ${limits.maxOffices} offices. Upgrade to create more.`,
      upgradeTo: 'PRO',
    };
  }
  return { allowed: true };
}

/** Can the user use the full agent builder (knowledge docs, etc.)? */
export async function canUseFullAgentBuilder(userId: string): Promise<EntitlementResult> {
  const limits = await getLimits(userId);
  if (limits.agentBuilderFull) return { allowed: true };
  return {
    allowed: false,
    reason: 'The full agent builder is a Pro feature.',
    upgradeTo: 'PRO',
  };
}

export interface EntitlementSummary {
  plan: Plan;
  limits: PlanLimits;
  officeCount: number;
}

/** One-shot summary for rendering the UI (limits + current usage). */
export async function getEntitlements(userId: string): Promise<EntitlementSummary> {
  const plan = await getPlan(userId);
  const officeCount = await prisma.office.count({ where: { ownerId: userId } });
  return { plan, limits: PLAN_LIMITS[plan], officeCount };
}
