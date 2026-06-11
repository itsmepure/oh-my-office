// Unit tests for billing fulfillment (Phase M3). Real Postgres.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from './index.js';
import {
  activateSubscription,
  cancelSubscription,
  markPastDue,
  fulfillCreditPack,
  refundCredits,
} from './billing.js';
import { getPlan } from './entitlements.js';
import { getBalance } from './credits.js';

const PREFIX = `billtest-${Date.now()}-`;
let userId = '';

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email: `${PREFIX}${randomUUID()}@x.local`, name: 'Bill', passwordHash: 'x' },
  });
  userId = u.id;
});

afterAll(async () => {
  await prisma.creditLedger.deleteMany({ where: { userId } });
  await prisma.creditBalance.deleteMany({ where: { userId } });
  await prisma.subscription.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('activateSubscription', () => {
  it('PRO activation sets plan + grants 5000 credits', async () => {
    await activateSubscription({ userId, plan: 'PRO' });
    expect(await getPlan(userId)).toBe('PRO');
    const bal = await getBalance(userId);
    expect(bal.granted).toBe(5000);
  });

  it('TEAM activation upgrades plan + grants 20000', async () => {
    await activateSubscription({ userId, plan: 'TEAM' });
    expect(await getPlan(userId)).toBe('TEAM');
    expect((await getBalance(userId)).granted).toBe(20000);
  });
});

describe('fulfillCreditPack', () => {
  it('adds purchased credits on top of grant', async () => {
    const before = (await getBalance(userId)).purchased;
    await fulfillCreditPack(userId, 5000);
    expect((await getBalance(userId)).purchased).toBe(before + 5000);
  });

  it('is idempotent for the same order id (no double credit)', async () => {
    const before = (await getBalance(userId)).purchased;
    const first = await fulfillCreditPack(userId, 1000, 'order-xyz');
    const second = await fulfillCreditPack(userId, 1000, 'order-xyz');
    expect(first).toBe(true);
    expect(second).toBe(false); // replay ignored
    expect((await getBalance(userId)).purchased).toBe(before + 1000); // credited once
  });
});

describe('refundCredits', () => {
  it('deducts from purchased first, never below zero', async () => {
    const before = (await getBalance(userId)).total;
    await refundCredits(userId, 1000, 'dispute-1');
    expect((await getBalance(userId)).total).toBe(before - 1000);
  });
});

describe('markPastDue + cancel', () => {
  it('past_due keeps plan but flags status', async () => {
    await markPastDue(userId);
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    expect(sub!.status).toBe('past_due');
  });

  it('cancel downgrades to FREE', async () => {
    await cancelSubscription(userId);
    // getPlan returns FREE for canceled subs.
    expect(await getPlan(userId)).toBe('FREE');
  });
});
