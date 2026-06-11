// Unit tests for plan entitlements + monthly grant refresh (Phase M3).
// Uses real Postgres. Creates throwaway users with different plans.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from './index.js';
import {
  getPlan,
  getLimits,
  canCreateOffice,
  canUseFullAgentBuilder,
  PLAN_LIMITS,
} from './entitlements.js';
import { getBalance } from './credits.js';

const PREFIX = `enttest-${Date.now()}-`;
let freeUser = '';
let proUser = '';
const templateId = `${PREFIX}tmpl`;

async function mkUser(plan: 'FREE' | 'PRO' | 'TEAM'): Promise<string> {
  const u = await prisma.user.create({
    data: { email: `${PREFIX}${plan}-${randomUUID()}@x.local`, name: plan, passwordHash: 'x' },
  });
  await prisma.subscription.create({ data: { userId: u.id, plan, status: 'active' } });
  return u.id;
}

beforeAll(async () => {
  freeUser = await mkUser('FREE');
  proUser = await mkUser('PRO');
  await prisma.template.create({
    data: { id: templateId, name: 'Ent Tmpl', description: 'x', category: 'test', workflow: '[]' },
  });
});

afterAll(async () => {
  const ids = [freeUser, proUser].filter(Boolean);
  await prisma.office.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.creditLedger.deleteMany({ where: { userId: { in: ids } } });
  await prisma.creditBalance.deleteMany({ where: { userId: { in: ids } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: ids } } });
  await prisma.template.deleteMany({ where: { id: templateId } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('plan resolution', () => {
  it('returns the subscription plan', async () => {
    expect(await getPlan(freeUser)).toBe('FREE');
    expect(await getPlan(proUser)).toBe('PRO');
  });
  it('limits match the plan table', async () => {
    expect(await getLimits(freeUser)).toEqual(PLAN_LIMITS.FREE);
    expect((await getLimits(proUser)).maxOffices).toBeNull();
  });
});

describe('canCreateOffice', () => {
  async function addOffice(ownerId: string, n: number) {
    return prisma.office.create({
      data: {
        name: `O${n}`,
        templateId,
        ownerId,
        workspacePath: `/tmp/ent-${randomUUID()}`,
      },
    });
  }

  it('FREE blocks the 3rd office (cap 2)', async () => {
    expect((await canCreateOffice(freeUser)).allowed).toBe(true);
    await addOffice(freeUser, 1);
    await addOffice(freeUser, 2);
    const gate = await canCreateOffice(freeUser);
    expect(gate.allowed).toBe(false);
    expect(gate.upgradeTo).toBe('PRO');
  });

  it('PRO has unlimited offices', async () => {
    for (let i = 0; i < 5; i++) await addOffice(proUser, i);
    expect((await canCreateOffice(proUser)).allowed).toBe(true);
  });
});

describe('agent builder gate', () => {
  it('FREE blocked, PRO allowed', async () => {
    expect((await canUseFullAgentBuilder(freeUser)).allowed).toBe(false);
    expect((await canUseFullAgentBuilder(proUser)).allowed).toBe(true);
  });
});

describe('monthly grant refresh (lazy-on-read)', () => {
  it('refills granted when grantResetAt has passed', async () => {
    // Seed a balance with a PAST reset date + drained grant.
    await prisma.creditBalance.create({
      data: {
        userId: freeUser,
        granted: 0,
        purchased: 10,
        grantResetAt: new Date(Date.now() - 1000),
      },
    });
    // getBalance triggers refreshGrantIfDue → FREE grant = 500.
    const bal = await getBalance(freeUser);
    expect(bal.granted).toBe(PLAN_LIMITS.FREE.monthlyCredits);
    expect(bal.purchased).toBe(10); // purchased untouched
    expect(bal.grantResetAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('does not refill before reset date', async () => {
    // proUser: fresh balance with FUTURE reset.
    await prisma.creditBalance.create({
      data: {
        userId: proUser,
        granted: 42,
        purchased: 0,
        grantResetAt: new Date(Date.now() + 1_000_000),
      },
    });
    const bal = await getBalance(proUser);
    expect(bal.granted).toBe(42); // unchanged
  });
});
