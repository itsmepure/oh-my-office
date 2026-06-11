// E2E smoke test (Phase 10) — the full MVP loop with the LLM mocked.
//
// Flow: register a user → create an office from the Dev Team template →
// build a custom agent and add it to the office → run a task through the
// pipeline with a FakeProvider (no live LLM) → assert the event sequence,
// the produced artifact, and tenancy isolation.
//
// Requires Postgres (docker compose up -d) + seeded templates
// (pnpm --filter @repo/db seed). No ANTHROPIC_API_KEY needed — FakeProvider
// is injected, per Non-Negotiable Rule #3 (no live LLM calls in CI).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@repo/db';
import { createUser } from '@repo/db/auth';
import { createOfficeFromTemplate, addAgentToOffice } from '@repo/db/offices';
import { createAgent } from '@repo/db/agents';
import { getTaskDetail } from '@repo/db/tasks';
import { FakeProvider } from '@repo/agents';
import { runTask } from './runner.js';

const DEV_TEMPLATE_ID = 'template-dev-001';
const stamp = Date.now();
const ownerEmail = `e2e_owner_${stamp}@test.local`;
const intruderEmail = `e2e_intruder_${stamp}@test.local`;

let ownerId = '';
let intruderId = '';
let officeId = '';
let taskId = '';
let customAgentId = '';

describe('E2E smoke: register → office → custom agent → run task (mocked LLM)', () => {
  beforeAll(async () => {
    // Guard: the Dev Team template must be seeded.
    const template = await prisma.template.findUnique({ where: { id: DEV_TEMPLATE_ID } });
    if (!template) {
      throw new Error(
        `Seed missing: template ${DEV_TEMPLATE_ID} not found. Run "pnpm --filter @repo/db seed" first.`,
      );
    }

    const owner = await createUser({ email: ownerEmail, name: 'E2E Owner', password: 'e2e-passw0rd' });
    ownerId = owner.id;
    const intruder = await createUser({ email: intruderEmail, name: 'E2E Intruder', password: 'e2e-passw0rd' });
    intruderId = intruder.id;
  });

  afterAll(async () => {
    // FK-safe teardown.
    if (officeId) {
      await prisma.artifact.deleteMany({ where: { task: { officeId } } });
      await prisma.event.deleteMany({ where: { officeId } });
      await prisma.task.deleteMany({ where: { officeId } });
      await prisma.officeAgent.deleteMany({ where: { officeId } });
      await prisma.officeMembership.deleteMany({ where: { officeId } });
      await prisma.office.deleteMany({ where: { id: officeId } });
    }
    if (customAgentId) await prisma.agent.deleteMany({ where: { id: customAgentId } });
    const userIds = [ownerId, intruderId].filter(Boolean);
    await prisma.creditLedger.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.creditBalance.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('creates an office from the Dev Team template with 3 snapshot agents', async () => {
    const office = await createOfficeFromTemplate({
      ownerId,
      templateId: DEV_TEMPLATE_ID,
      name: 'E2E Dev Office',
    });
    officeId = office.id;
    expect(office.agents.length).toBe(3);
    expect(office.workspacePath).toBeTruthy();
  });

  it('adds a custom user-built agent to the office at a chosen step', async () => {
    const agent = await createAgent(ownerId, {
      name: 'E2E Documenter',
      role: 'Documenter',
      systemPrompt: 'You write concise docs for the work produced by prior steps.',
      tools: ['read_file', 'write_file'],
      modelConfig: { model: 'fake', temperature: 0 },
    });
    customAgentId = agent.id;

    // Insert as the 4th step (stepOrder 4, after the 3 template agents).
    const updated = await addAgentToOffice(officeId, ownerId, { agentId: agent.id, stepOrder: 4 });
    expect(updated).not.toBeNull();
    expect(updated!.agents.length).toBe(4);
    const lastAgent = updated!.agents.find((a) => a.stepOrder === 4);
    expect(lastAgent).toBeTruthy();
    expect(lastAgent!.agent.name).toBe('E2E Documenter');
  });

  it('runs a task through the full pipeline with a FakeProvider', async () => {
    // Queue a task.
    const task = await prisma.task.create({
      data: { officeId, prompt: 'Build a hello-world function and document it.', status: 'queued' },
    });
    taskId = task.id;

    // Each of the 4 agents runs one loop iteration. FakeProvider returns a
    // final text response per step (no tool calls = clean single-iteration step).
    const provider = new FakeProvider([
      { text: 'Plan: 1) write function 2) document.' },
      { text: 'def hello(): return "hello world"' },
      { text: 'Review: looks correct, no issues.' },
      { text: 'Docs: hello() returns the string "hello world".' },
    ]);

    await runTask({ id: task.id, officeId, prompt: task.prompt }, { provider });

    const finished = await prisma.task.findUnique({ where: { id: taskId } });
    expect(finished!.status).toBe('done');
  });

  it('emitted the correct event sequence (4 steps, all with agentRef)', async () => {
    const detail = await getTaskDetail(taskId, ownerId);
    expect(detail).not.toBeNull();
    const types = detail!.events.map((e) => e.type);

    // 4 steps, each: step.start → agent.thinking → agent.output → step.done.
    expect(types.filter((t) => t === 'step.start').length).toBe(4);
    expect(types.filter((t) => t === 'step.done').length).toBe(4);
    expect(types.filter((t) => t === 'step.failed').length).toBe(0);

    // Every step.start/step.done carries an agentRef (pixel-office invariant).
    const stepEvents = detail!.events.filter((e) => e.type === 'step.start' || e.type === 'step.done');
    for (const e of stepEvents) {
      expect((e as { agentRef?: string }).agentRef).toBeTruthy();
    }
  });

  it('produced a final-output artifact containing every step output', async () => {
    const detail = await getTaskDetail(taskId, ownerId);
    expect(detail!.artifacts.length).toBeGreaterThanOrEqual(1);
    const final = detail!.artifacts.find((a) => a.name === 'final-output.txt');
    expect(final).toBeTruthy();
    expect(final!.content).toContain('hello world');
    expect(final!.content).toContain('Documenter');
  });

  it('enforces tenancy: a different user cannot read the task detail', async () => {
    const asIntruder = await getTaskDetail(taskId, intruderId);
    expect(asIntruder).toBeNull();
  });
});
