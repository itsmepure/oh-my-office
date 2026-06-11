// Integration test (Phase M1) — credit metering in the run pipeline.
//
// Verifies the money path with a FakeProvider (no live LLM):
//   1. A PLATFORM agent step debits credits from the office owner.
//   2. A USER-OWNED agent step debits nothing.
//   3. A zero-balance owner whose office has a platform agent is BLOCKED
//      before any provider call (task fails, no debit, provider never invoked).
//
// Requires Postgres (docker compose up -d) + seeded platform agents.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@repo/db';
import { createUser } from '@repo/db/auth';
import { createOfficeFromTemplate } from '@repo/db/offices';
import { createAgent } from '@repo/db/agents';
import { getBalance, grantMonthly } from '@repo/db/credits';
import { createLlmKey, deleteLlmKey } from '@repo/db/keys';
import { FakeProvider, type Provider, type GenerateParams, type GenerateResult } from '@repo/agents';
import { runTask } from './runner.js';

const DEV_TEMPLATE_ID = 'template-dev-001';
const stamp = Date.now();

let ownerId = '';
let officeId = '';
const createdOfficeIds: string[] = [];
const createdAgentIds: string[] = [];

// A provider that counts how many times generate() was called — used to prove
// the out-of-credits guard blocks BEFORE any LLM call.
class CountingProvider implements Provider {
  calls = 0;
  async generate(_p: GenerateParams): Promise<GenerateResult> {
    this.calls += 1;
    return { text: 'ok', toolCalls: [], usage: { input: 3000, output: 3000 } };
  }
}

async function cleanupOffice(id: string): Promise<void> {
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

  const owner = await createUser({ email: `m1_${stamp}@test.local`, name: 'M1 Owner', password: 'm1-passw0rd' });
  ownerId = owner.id;
  // Start with a healthy balance.
  await grantMonthly(ownerId, 500);
});

afterAll(async () => {
  for (const id of createdOfficeIds) await cleanupOffice(id);
  if (createdAgentIds.length) await prisma.agent.deleteMany({ where: { id: { in: createdAgentIds } } });
  await prisma.creditLedger.deleteMany({ where: { userId: ownerId } });
  await prisma.creditBalance.deleteMany({ where: { userId: ownerId } });
  await prisma.subscription.deleteMany({ where: { userId: ownerId } });
  await prisma.user.deleteMany({ where: { id: ownerId } });
  await prisma.$disconnect();
});

describe('M1 credit metering', () => {
  it('platform-agent steps debit the office owner', async () => {
    // Dev Team office = 3 PLATFORM agents (Planner/Coder/Reviewer).
    const office = await createOfficeFromTemplate({ ownerId, templateId: DEV_TEMPLATE_ID, name: 'M1 Platform Office' });
    officeId = office.id;
    createdOfficeIds.push(office.id);

    const before = (await getBalance(ownerId)).total;
    expect(before).toBe(500);

    const task = await prisma.task.create({
      data: { officeId, prompt: 'do something', status: 'queued' },
    });

    // Each of the 3 platform steps reports 3000+3000 tokens → ceil(6000/6000)=1
    // credit floor… actually 6000/6000 = 1 credit per step → 3 credits total.
    const provider = new FakeProvider([
      { text: 'plan', usage: { input: 3000, output: 3000 } },
      { text: 'code', usage: { input: 3000, output: 3000 } },
      { text: 'review', usage: { input: 3000, output: 3000 } },
    ]);
    await runTask({ id: task.id, officeId, prompt: task.prompt }, { provider });

    const finished = await prisma.task.findUnique({ where: { id: task.id } });
    expect(finished!.status).toBe('done');

    const after = (await getBalance(ownerId)).total;
    // 3 platform steps billed; balance dropped by a positive amount.
    expect(after).toBeLessThan(before);
    // Ledger has 3 task_step debits for this task.
    const debits = await prisma.creditLedger.findMany({
      where: { userId: ownerId, taskId: task.id, reason: 'task_step' },
    });
    expect(debits.length).toBe(3);
    for (const d of debits) expect(d.delta).toBeLessThan(0);
  });

  it('user-owned agent steps debit nothing', async () => {
    // Build an office whose ONLY agent is user-owned: create office from
    // template then we will run a task but first swap to a user agent office.
    // Simplest: create a one-agent user office by creating an office from the
    // template, removing platform agents, adding a user agent.
    const userAgent = await createAgent(ownerId, {
      name: 'My Writer',
      role: 'Writer',
      systemPrompt: 'You write.',
      tools: [],
      modelConfig: { model: 'fake', temperature: 0 },
    });
    createdAgentIds.push(userAgent.id);

    const office = await createOfficeFromTemplate({ ownerId, templateId: DEV_TEMPLATE_ID, name: 'M1 User Office' });
    createdOfficeIds.push(office.id);
    // Replace all snapshot agents with a single user-owned snapshot.
    await prisma.officeAgent.deleteMany({ where: { officeId: office.id } });
    await prisma.officeAgent.create({
      data: {
        officeId: office.id,
        stepOrder: 1,
        agentSnapshot: JSON.stringify({
          id: userAgent.id,
          name: 'My Writer',
          role: 'Writer',
          systemPrompt: 'You write.',
          tools: [],
          modelConfig: { model: 'fake', temperature: 0 },
        }),
      },
    });

    const before = (await getBalance(ownerId)).total;
    const task = await prisma.task.create({
      data: { officeId: office.id, prompt: 'write', status: 'queued' },
    });
    const provider = new FakeProvider([{ text: 'written', usage: { input: 9000, output: 9000 } }]);
    await runTask({ id: task.id, officeId: office.id, prompt: task.prompt }, { provider });

    const finished = await prisma.task.findUnique({ where: { id: task.id } });
    expect(finished!.status).toBe('done');

    const after = (await getBalance(ownerId)).total;
    expect(after).toBe(before); // user agent → zero credits
    const debits = await prisma.creditLedger.findMany({
      where: { userId: ownerId, taskId: task.id, reason: 'task_step' },
    });
    expect(debits.length).toBe(0);
  });

  it('blocks a zero-balance owner before any LLM call (platform office)', async () => {
    // Drain the owner's balance to 0.
    const bal = await getBalance(ownerId);
    if (bal.total > 0) {
      // spend it all via a direct ledger-consistent path: grant 0 resets grant,
      // then zero purchased.
      await prisma.creditBalance.update({
        where: { userId: ownerId },
        data: { granted: 0, purchased: 0 },
      });
    }
    expect((await getBalance(ownerId)).total).toBe(0);

    const office = await createOfficeFromTemplate({ ownerId, templateId: DEV_TEMPLATE_ID, name: 'M1 Broke Office' });
    createdOfficeIds.push(office.id);
    const task = await prisma.task.create({
      data: { officeId: office.id, prompt: 'do', status: 'queued' },
    });

    const counting = new CountingProvider();
    await runTask({ id: task.id, officeId: office.id, prompt: task.prompt }, { provider: counting });

    const finished = await prisma.task.findUnique({ where: { id: task.id } });
    expect(finished!.status).toBe('failed');
    // Provider was NEVER called — blocked before any LLM spend.
    expect(counting.calls).toBe(0);
    // No debits.
    const debits = await prisma.creditLedger.findMany({
      where: { userId: ownerId, taskId: task.id },
    });
    expect(debits.length).toBe(0);
  });

  it('BYOK office runs platform agents for ZERO credits', async () => {
    // Restore some balance so we can prove it is NOT spent.
    await grantMonthly(ownerId, 500);
    const before = (await getBalance(ownerId)).total;
    expect(before).toBe(500);

    // Attach an account-default BYOK key.
    await createLlmKey({ userId: ownerId, apiKey: 'sk-byok-testkey-1234', provider: 'deepseek' });

    // Platform office (3 platform agents) — would normally bill credits.
    const office = await createOfficeFromTemplate({ ownerId, templateId: DEV_TEMPLATE_ID, name: 'M2 BYOK Office' });
    createdOfficeIds.push(office.id);
    const task = await prisma.task.create({
      data: { officeId: office.id, prompt: 'byok run', status: 'queued' },
    });

    // The runner builds a BYOK provider via makeByokProvider; inject a fake one
    // so no real network call happens. It reports usage, but BYOK = no billing.
    const byokProvider = new FakeProvider([
      { text: 'plan', usage: { input: 9000, output: 9000 } },
      { text: 'code', usage: { input: 9000, output: 9000 } },
      { text: 'review', usage: { input: 9000, output: 9000 } },
    ]);
    let byokFactoryCalled = false;
    await runTask(
      { id: task.id, officeId: office.id, prompt: task.prompt },
      {
        provider: new FakeProvider([{ text: 'should-not-be-used' }]),
        makeByokProvider: () => {
          byokFactoryCalled = true;
          return byokProvider;
        },
      },
    );

    const finished = await prisma.task.findUnique({ where: { id: task.id } });
    expect(finished!.status).toBe('done');
    // BYOK provider factory was used (not the platform provider).
    expect(byokFactoryCalled).toBe(true);
    // Balance untouched — BYOK means zero credits even for platform agents.
    expect((await getBalance(ownerId)).total).toBe(before);
    const debits = await prisma.creditLedger.findMany({
      where: { userId: ownerId, taskId: task.id, reason: 'task_step' },
    });
    expect(debits.length).toBe(0);

    // Clean up the key.
    const keys = await prisma.llmKey.findMany({ where: { userId: ownerId } });
    for (const k of keys) await deleteLlmKey(ownerId, k.id);
  });
});
