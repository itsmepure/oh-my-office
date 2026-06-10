// Unit tests for task history + task detail reads (Phase 9).
//
// Uses the real Postgres database (docker compose up -d). Creates two
// throwaway users and one office owned by user A, with a couple of tasks,
// events, and artifacts. Verifies:
//   - listOfficeTasks returns newest-first with correct counts
//   - getTaskDetail returns ordered events + artifacts
//   - tenancy: user B (not a member) sees nothing (null / empty)

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from './index.js';
import { listOfficeTasks, getTaskDetail } from './tasks.js';

const PREFIX = `tasktest-${Date.now()}-`;

let userA: string; // office member
let userB: string; // outsider
let officeId: string;
let templateId: string;
let taskOldId: string;
let taskNewId: string;

beforeAll(async () => {
  const a = await prisma.user.create({
    data: { email: `${PREFIX}a-${randomUUID()}@example.com`, name: 'User A', passwordHash: 'x' },
  });
  const b = await prisma.user.create({
    data: { email: `${PREFIX}b-${randomUUID()}@example.com`, name: 'User B', passwordHash: 'x' },
  });
  userA = a.id;
  userB = b.id;

  // Minimal template (no agents needed for task reads).
  const tmpl = await prisma.template.create({
    data: {
      id: `${PREFIX}tmpl`,
      name: 'Task Test Tmpl',
      description: 'x',
      category: 'test',
      workflow: JSON.stringify([]),
    },
  });
  templateId = tmpl.id;

  const office = await prisma.office.create({
    data: {
      name: 'Task Test Office',
      templateId,
      ownerId: userA,
      workspacePath: `/tmp/${PREFIX}ws`,
      memberships: { create: { userId: userA, role: 'owner' } },
    },
  });
  officeId = office.id;

  // Older task (done) with an artifact + 2 events.
  const oldTask = await prisma.task.create({
    data: {
      officeId,
      prompt: 'old task prompt',
      status: 'done',
      createdAt: new Date('2026-06-10T00:00:00.000Z'),
      finishedAt: new Date('2026-06-10T00:00:05.000Z'),
    },
  });
  taskOldId = oldTask.id;

  await prisma.event.createMany({
    data: [
      {
        taskId: taskOldId,
        officeId,
        agentRef: 'agent-1',
        type: 'step.start',
        ts: new Date('2026-06-10T00:00:01.000Z'),
        payload: {
          type: 'step.start',
          taskId: taskOldId,
          officeId,
          ts: '2026-06-10T00:00:01.000Z',
          stepIndex: 0,
          agentRef: 'agent-1',
          role: 'planner',
        },
      },
      {
        taskId: taskOldId,
        officeId,
        agentRef: 'agent-1',
        type: 'step.done',
        ts: new Date('2026-06-10T00:00:02.000Z'),
        payload: {
          type: 'step.done',
          taskId: taskOldId,
          officeId,
          ts: '2026-06-10T00:00:02.000Z',
          stepIndex: 0,
          agentRef: 'agent-1',
        },
      },
    ],
  });

  await prisma.artifact.create({
    data: {
      taskId: taskOldId,
      type: 'text',
      name: 'final-output.txt',
      content: 'the result',
    },
  });

  // Newer task (queued), no events/artifacts yet.
  const newTask = await prisma.task.create({
    data: {
      officeId,
      prompt: 'new task prompt',
      status: 'queued',
      createdAt: new Date('2026-06-10T01:00:00.000Z'),
    },
  });
  taskNewId = newTask.id;
});

afterAll(async () => {
  // Delete in FK-safe order: artifacts + events → tasks → office → template → users.
  await prisma.artifact.deleteMany({ where: { task: { officeId } } });
  await prisma.event.deleteMany({ where: { officeId } });
  await prisma.task.deleteMany({ where: { officeId } });
  await prisma.office.deleteMany({ where: { ownerId: userA } });
  await prisma.template.deleteMany({ where: { id: templateId } });
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
  await prisma.$disconnect();
});

describe('listOfficeTasks', () => {
  it('returns tasks newest-first with event/artifact counts', async () => {
    const tasks = await listOfficeTasks(officeId, userA);
    expect(tasks).toHaveLength(2);
    // newest first
    expect(tasks[0]?.id).toBe(taskNewId);
    expect(tasks[1]?.id).toBe(taskOldId);

    const oldRow = tasks.find((t) => t.id === taskOldId)!;
    expect(oldRow.status).toBe('done');
    expect(oldRow.eventCount).toBe(2);
    expect(oldRow.artifactCount).toBe(1);
    expect(oldRow.finishedAt).not.toBeNull();

    const newRow = tasks.find((t) => t.id === taskNewId)!;
    expect(newRow.status).toBe('queued');
    expect(newRow.eventCount).toBe(0);
    expect(newRow.artifactCount).toBe(0);
    expect(newRow.finishedAt).toBeNull();
  });

  it('returns [] for a non-member (tenancy)', async () => {
    const tasks = await listOfficeTasks(officeId, userB);
    expect(tasks).toEqual([]);
  });
});

describe('getTaskDetail', () => {
  it('returns the task with ordered events and artifacts', async () => {
    const detail = await getTaskDetail(taskOldId, userA);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(taskOldId);
    expect(detail!.officeName).toBe('Task Test Office');
    expect(detail!.prompt).toBe('old task prompt');
    expect(detail!.status).toBe('done');
    expect(detail!.events.map((e) => e.type)).toEqual(['step.start', 'step.done']);
    expect(detail!.artifacts).toHaveLength(1);
    expect(detail!.artifacts[0]?.name).toBe('final-output.txt');
    expect(detail!.artifacts[0]?.content).toBe('the result');
  });

  it('returns null for a non-member (tenancy, no cross-tenant leak)', async () => {
    const detail = await getTaskDetail(taskOldId, userB);
    expect(detail).toBeNull();
  });

  it('returns null for a non-existent task', async () => {
    const detail = await getTaskDetail(randomUUID(), userA);
    expect(detail).toBeNull();
  });
});
