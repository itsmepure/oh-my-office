// E2E credit lifecycle test (Phase M5) — the whole money story with mocked LLM.
//
// signup (500 free) → run task (debit) → drain to 0 → next run blocked
// → attach BYOK key → run again for FREE. Real Postgres, FakeProvider.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@repo/db';
import { createUser } from '@repo/db/auth';
import { createOfficeFromTemplate } from '@repo/db/offices';
import { getBalance } from '@repo/db/credits';
import { createLlmKey } from '@repo/db/keys';
import { FakeProvider } from '@repo/agents';
import { runTask } from './runner.js';

const DEV_TEMPLATE_ID = 'template-dev-001';
const stamp = Date.now();
let userId = '';
const officeIds: string[] = [];

async function cleanupOffice(id: string) {
  await prisma.artifact.deleteMany({ where: { task: { officeId: id } } });
  await prisma.event.deleteMany({ where: { officeId: id } });
  await prisma.task.deleteMany({ where: { officeId: id } });
  await prisma.officeAgent.deleteMany({ where: { officeId: id } });
  await prisma.officeMembership.deleteMany({ where: { officeId: id } });
  await prisma.office.deleteMany({ where: { id } });
}

beforeAll(async () => {
  const tmpl = await prisma.template.findUnique({ where: { id: DEV_TEMPLATE_ID } });
  if (!tmpl) throw new Error('Seed missing: run "pnpm --filter @repo/db seed" first.');
  const u = await createUser({ email: `m5_${stamp}@test.local`, name: 'M5', password: 'm5-passw0rd' });
  userId = u.id;
});

afterAll(async () => {
  for (const id of officeIds) await cleanupOffice(id);
  await prisma.llmKey.deleteMany({ where: { userId } });
  await prisma.creditLedger.deleteMany({ where: { userId } });
  await prisma.creditBalance.deleteMany({ where: { userId } });
  await prisma.subscription.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('M5 credit lifecycle', () => {
  it('new signup starts with 500 free credits', async () => {
    expect((await getBalance(userId)).total).toBe(500);
  });

  it('running a platform task debits credits', async () => {
    const office = await createOfficeFromTemplate({ ownerId: userId, templateId: DEV_TEMPLATE_ID, name: 'M5 Office' });
    officeIds.push(office.id);
    const task = await prisma.task.create({ data: { officeId: office.id, prompt: 'go', status: 'queued' } });
    const provider = new FakeProvider([
      { text: 'a', usage: { input: 3000, output: 3000 } },
      { text: 'b', usage: { input: 3000, output: 3000 } },
      { text: 'c', usage: { input: 3000, output: 3000 } },
    ]);
    await runTask({ id: task.id, officeId: office.id, prompt: task.prompt }, { provider });
    expect((await prisma.task.findUnique({ where: { id: task.id } }))!.status).toBe('done');
    expect((await getBalance(userId)).total).toBeLessThan(500);
  });

  it('draining to 0 then running is BLOCKED (no LLM call)', async () => {
    // Drain.
    await prisma.creditBalance.update({ where: { userId }, data: { granted: 0, purchased: 0 } });
    expect((await getBalance(userId)).total).toBe(0);

    const office = await createOfficeFromTemplate({ ownerId: userId, templateId: DEV_TEMPLATE_ID, name: 'M5 Broke' });
    officeIds.push(office.id);
    const task = await prisma.task.create({ data: { officeId: office.id, prompt: 'go', status: 'queued' } });
    let calls = 0;
    const counting = { async generate() { calls++; return { text: 'x', toolCalls: [], usage: { input: 3000, output: 3000 } }; } };
    await runTask({ id: task.id, officeId: office.id, prompt: task.prompt }, { provider: counting });
    expect((await prisma.task.findUnique({ where: { id: task.id } }))!.status).toBe('failed');
    expect(calls).toBe(0); // blocked before any LLM call
  });

  it('attaching a BYOK key lets platform agents run for FREE', async () => {
    await createLlmKey({ userId, apiKey: 'sk-byok-m5-key-9999', provider: 'deepseek' });
    expect((await getBalance(userId)).total).toBe(0); // still broke

    const office = await createOfficeFromTemplate({ ownerId: userId, templateId: DEV_TEMPLATE_ID, name: 'M5 BYOK' });
    officeIds.push(office.id);
    const task = await prisma.task.create({ data: { officeId: office.id, prompt: 'go', status: 'queued' } });
    const byok = new FakeProvider([
      { text: 'a', usage: { input: 9000, output: 9000 } },
      { text: 'b', usage: { input: 9000, output: 9000 } },
      { text: 'c', usage: { input: 9000, output: 9000 } },
    ]);
    await runTask(
      { id: task.id, officeId: office.id, prompt: task.prompt },
      { provider: new FakeProvider([{ text: 'unused' }]), makeByokProvider: () => byok },
    );
    expect((await prisma.task.findUnique({ where: { id: task.id } }))!.status).toBe('done');
    // Ran on BYOK → balance still 0, no debit.
    expect((await getBalance(userId)).total).toBe(0);
    const debits = await prisma.creditLedger.findMany({ where: { userId, taskId: task.id, reason: 'task_step' } });
    expect(debits.length).toBe(0);
  });
});
