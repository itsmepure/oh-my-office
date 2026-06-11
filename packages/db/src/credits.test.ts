// Unit tests for the credit metering core (Phase M0).
//
// Uses the real Postgres database (docker compose up -d). Creates a throwaway
// user, exercises reserve/settle/release/grant/purchase, and asserts the
// balance + ledger invariants:
//   - spend order: granted before purchased
//   - insufficient credits throws
//   - settle refunds overestimate / charges underestimate (never negative)
//   - release returns the full hold
//   - tokensToCredits math
//   - ledger rows written for each movement

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from './index.js';
import {
  getBalance,
  reserve,
  settle,
  release,
  grantMonthly,
  addPurchased,
  tokensToCredits,
  canAffordMinStep,
  InsufficientCreditsError,
  TOKENS_PER_CREDIT,
} from './credits.js';

const PREFIX = `credittest-${Date.now()}-`;
let userId: string;

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email: `${PREFIX}${randomUUID()}@example.com`, name: 'Credit User', passwordHash: 'x' },
  });
  userId = u.id;
});

afterAll(async () => {
  await prisma.creditLedger.deleteMany({ where: { userId } });
  await prisma.creditBalance.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
});

describe('tokensToCredits', () => {
  it('returns 0 for no tokens', () => {
    expect(tokensToCredits(0, 0)).toBe(0);
  });
  it('charges at least the minimum when any tokens used', () => {
    expect(tokensToCredits(1, 0)).toBe(1);
  });
  it('ceil-divides total tokens by TOKENS_PER_CREDIT', () => {
    expect(tokensToCredits(TOKENS_PER_CREDIT, 0)).toBe(1);
    expect(tokensToCredits(TOKENS_PER_CREDIT, 1)).toBe(2); // just over 1 credit
    expect(tokensToCredits(TOKENS_PER_CREDIT * 3, 0)).toBe(3);
  });
});

describe('grantMonthly + getBalance', () => {
  it('grants 500 credits and reflects in balance', async () => {
    await grantMonthly(userId, 500);
    const bal = await getBalance(userId);
    expect(bal.granted).toBe(500);
    expect(bal.purchased).toBe(0);
    expect(bal.total).toBe(500);
    expect(bal.grantResetAt).toBeInstanceOf(Date);
  });

  it('writes a monthly_grant ledger row', async () => {
    const rows = await prisma.creditLedger.findMany({ where: { userId, reason: 'monthly_grant' } });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.delta).toBe(500);
  });
});

describe('reserve + settle', () => {
  it('reserve holds from granted first', async () => {
    const r = await reserve(userId, 100);
    expect(r.fromGranted).toBe(100);
    expect(r.fromPurchased).toBe(0);
    const bal = await getBalance(userId);
    expect(bal.granted).toBe(400); // 500 - 100 held
    // settle to the same amount → no refund, ledger -100
    const spent = await settle(r, 100, { taskId: 't1', agentRef: 'planner' });
    expect(spent).toBe(100);
    const after = await getBalance(userId);
    expect(after.granted).toBe(400);
    expect(after.total).toBe(400);
  });

  it('settle refunds the unused remainder when actual < estimate', async () => {
    const before = (await getBalance(userId)).total; // 400
    const r = await reserve(userId, 100); // hold 100 → 300
    expect((await getBalance(userId)).total).toBe(before - 100);
    const spent = await settle(r, 30, { taskId: 't2' }); // actual 30 → refund 70
    expect(spent).toBe(30);
    expect((await getBalance(userId)).total).toBe(before - 30); // only 30 gone
  });

  it('settle charges extra (capped) when actual > estimate', async () => {
    const before = (await getBalance(userId)).total;
    const r = await reserve(userId, 10);
    const spent = await settle(r, 50, { taskId: 't3' }); // underestimated by 40
    expect(spent).toBe(50);
    expect((await getBalance(userId)).total).toBe(before - 50);
  });

  it('ledger spend rows are negative', async () => {
    const rows = await prisma.creditLedger.findMany({ where: { userId, reason: 'task_step' } });
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of rows) expect(row.delta).toBeLessThan(0);
  });
});

describe('insufficient credits', () => {
  it('reserve throws when estimate exceeds balance', async () => {
    const bal = await getBalance(userId);
    await expect(reserve(userId, bal.total + 1)).rejects.toBeInstanceOf(InsufficientCreditsError);
    // balance untouched after a failed reserve
    expect((await getBalance(userId)).total).toBe(bal.total);
  });
});

describe('release', () => {
  it('returns the full hold without charging', async () => {
    const before = (await getBalance(userId)).total;
    const r = await reserve(userId, 50);
    expect((await getBalance(userId)).total).toBe(before - 50);
    await release(r);
    expect((await getBalance(userId)).total).toBe(before);
  });
});

describe('addPurchased + spend order', () => {
  it('purchased credits are spent only after granted is exhausted', async () => {
    // Reset to a known state: grant 20, purchase 80.
    await grantMonthly(userId, 20);
    await addPurchased(userId, 80);
    let bal = await getBalance(userId);
    expect(bal.granted).toBe(20);
    expect(bal.purchased).toBe(80);

    // Reserve 50 → consumes 20 granted + 30 purchased.
    const r = await reserve(userId, 50);
    expect(r.fromGranted).toBe(20);
    expect(r.fromPurchased).toBe(30);
    bal = await getBalance(userId);
    expect(bal.granted).toBe(0);
    expect(bal.purchased).toBe(50);
    await settle(r, 50);
  });
});

describe('canAffordMinStep', () => {
  it('false when balance is zero', async () => {
    // Drain everything.
    const bal = await getBalance(userId);
    if (bal.total > 0) {
      const r = await reserve(userId, bal.total);
      await settle(r, bal.total);
    }
    expect(await canAffordMinStep(userId)).toBe(false);
  });
});
