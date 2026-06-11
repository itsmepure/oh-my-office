// Integration test (Phase M4) — priority queue dequeue order. Real Postgres.
//
// Verifies dequeueTask() returns higher-priority tasks first (Team offices
// enqueue at priority 10), then FIFO within the same priority.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@repo/db';
import { dequeueTask, completeTask } from './queue.js';

const PREFIX = `priotest-${Date.now()}-`;
let ownerId = '';
let officeId = '';
const tmplId = `${PREFIX}tmpl`;

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email: `${PREFIX}${randomUUID()}@x.local`, name: 'Prio', passwordHash: 'x' },
  });
  ownerId = u.id;
  await prisma.template.create({
    data: { id: tmplId, name: 'Prio Tmpl', description: 'x', category: 'test', workflow: '[]' },
  });
  const o = await prisma.office.create({
    data: {
      name: 'Prio Office',
      templateId: tmplId,
      ownerId,
      workspacePath: `/tmp/prio-${randomUUID()}`,
      memberships: { create: { userId: ownerId, role: 'owner' } },
    },
  });
  officeId = o.id;
});

afterAll(async () => {
  await prisma.event.deleteMany({ where: { officeId } });
  await prisma.task.deleteMany({ where: { officeId } });
  await prisma.officeMembership.deleteMany({ where: { officeId } });
  await prisma.office.deleteMany({ where: { id: officeId } });
  await prisma.template.deleteMany({ where: { id: tmplId } });
  await prisma.user.deleteMany({ where: { id: ownerId } });
  await prisma.$disconnect();
});

describe('priority queue dequeue order', () => {
  it('dequeues higher priority before lower, FIFO within a priority', async () => {
    // Enqueue: low1 (p0), high (p10), low2 (p0) — created in this order.
    const low1 = await prisma.task.create({
      data: { officeId, prompt: 'low1', status: 'queued', priority: 0 },
    });
    // Ensure distinct createdAt ordering.
    await new Promise((r) => setTimeout(r, 10));
    const high = await prisma.task.create({
      data: { officeId, prompt: 'high', status: 'queued', priority: 10 },
    });
    await new Promise((r) => setTimeout(r, 10));
    const low2 = await prisma.task.create({
      data: { officeId, prompt: 'low2', status: 'queued', priority: 0 },
    });

    // Expected RELATIVE order among our rows: high (p10) → low1 (p0, older) →
    // low2 (p0, newer). Drain the whole queue and filter to our task ids so
    // unrelated queued rows in a shared dev DB don't break the assertion.
    const ourIds = new Set([low1.id, high.id, low2.id]);
    const claimedOrder: string[] = [];
    for (let i = 0; i < 50; i += 1) {
      const t = await dequeueTask();
      if (!t) break;
      if (ourIds.has(t.id)) claimedOrder.push(t.id);
      await completeTask(t.id, t.officeId, 'done');
      if (claimedOrder.length === 3) break;
    }
    expect(claimedOrder).toEqual([high.id, low1.id, low2.id]);
  });
});
