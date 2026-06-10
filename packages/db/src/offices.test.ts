// Unit tests for office lifecycle (Phase 4).
//
// Uses the real Postgres database (docker compose up -d). Each test creates
// a unique user + a unique template with one agent so the tests are
// independent and don't interfere with the seeded catalog.
//
// Critical invariant under test (Phase 4 plan):
//   "Editing a template afterward does NOT change the existing office
//    (snapshot test)."

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from './index.js';
import {
  createOfficeFromTemplate,
  getOfficeById,
  getTemplateById,
  listTemplates,
  listUserOffices,
} from './offices.js';

const TEST_PREFIX = `test-${Date.now()}-`;

let testUserId: string;

beforeAll(async () => {
  // Create a single test user reused across all tests in this file.
  const user = await prisma.user.create({
    data: {
      email: `${TEST_PREFIX}${randomUUID()}@example.com`,
      name: 'Office Test User',
      passwordHash: 'not-used',
    },
  });
  testUserId = user.id;
});

afterAll(async () => {
  // Best-effort cleanup. The seeded data is unaffected.
  // Delete offices first (they FK to users/templates/agents), then the
  // throwaway user/templates/agents.
  if (testUserId) {
    await prisma.office.deleteMany({ where: { ownerId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  }
  await prisma.office.deleteMany({
    where: { templateId: { startsWith: `${TEST_PREFIX}tmpl-` } },
  });
  await prisma.template.deleteMany({
    where: { id: { startsWith: `${TEST_PREFIX}tmpl-` } },
  });
  await prisma.agent.deleteMany({
    where: { id: { startsWith: `${TEST_PREFIX}agent-` } },
  });
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean up any offices the previous test created for this user.
  await prisma.office.deleteMany({ where: { ownerId: testUserId } });
});

// ── Helpers ────────────────────────────────────────────────────────────────

async function makeAgent(id: string, name: string, systemPrompt: string) {
  return prisma.agent.create({
    data: {
      id,
      name,
      role: 'Tester',
      systemPrompt,
      tools: JSON.stringify(['read_file']),
      modelConfig: JSON.stringify({ model: 'fake', temperature: 0.5 }),
      ownerId: testUserId,
    },
  });
}

async function makeTemplate(
  id: string,
  name: string,
  agentIds: string[],
) {
  const tmpl = await prisma.template.create({
    data: {
      id,
      name,
      description: `Test template ${name}`,
      category: 'test',
      workflow: JSON.stringify(
        agentIds.map((role, idx) => ({
          order: idx + 1,
          agentRole: role,
          label: `Step ${idx + 1}`,
        })),
      ),
    },
  });
  await prisma.templateAgent.createMany({
    data: agentIds.map((agentId, idx) => ({
      templateId: id,
      agentId,
      stepOrder: idx + 1,
    })),
  });
  return tmpl;
}

// ── listTemplates ──────────────────────────────────────────────────────────

describe('listTemplates', () => {
  it('returns the seeded templates plus any test ones', async () => {
    const templates = await listTemplates();
    // The seed file creates 3 templates (Dev, Research, Content).
    const seedIds = templates
      .map((t) => t.id)
      .filter((id) => id.startsWith('template-'));
    expect(seedIds.length).toBeGreaterThanOrEqual(3);
  });

  it('returns template with agents in step order', async () => {
    const agentA = await makeAgent(`${TEST_PREFIX}agent-A`, 'Alpha', 'I am Alpha');
    const agentB = await makeAgent(`${TEST_PREFIX}agent-B`, 'Beta', 'I am Beta');
    await makeTemplate(`${TEST_PREFIX}tmpl-ab`, 'AB', [agentA.id, agentB.id]);

    const templates = await listTemplates();
    const tmpl = templates.find((t) => t.id === `${TEST_PREFIX}tmpl-ab`);
    expect(tmpl).toBeDefined();
    expect(tmpl?.agents.map((a) => a.name)).toEqual(['Alpha', 'Beta']);
    expect(tmpl?.workflow.map((s) => s.order)).toEqual([1, 2]);
  });
});

// ── createOfficeFromTemplate ───────────────────────────────────────────────

describe('createOfficeFromTemplate', () => {
  it('creates an office with one OfficeAgent snapshot per template agent', async () => {
    const agent = await makeAgent(`${TEST_PREFIX}agent-c1`, 'Coder1', 'First coder');
    await makeTemplate(`${TEST_PREFIX}tmpl-c1`, 'C1', [agent.id]);

    const office = await createOfficeFromTemplate({
      ownerId: testUserId,
      templateId: `${TEST_PREFIX}tmpl-c1`,
      name: 'My C1 Office',
    });

    expect(office.name).toBe('My C1 Office');
    expect(office.agents).toHaveLength(1);
    expect(office.agents[0]?.agent.name).toBe('Coder1');
    expect(office.agents[0]?.agent.systemPrompt).toBe('First coder');
    expect(office.workspacePath).toContain(office.id);
  });

  it('creates an OfficeMembership(owner) row', async () => {
    const agent = await makeAgent(`${TEST_PREFIX}agent-c2`, 'Coder2', 'Second coder');
    await makeTemplate(`${TEST_PREFIX}tmpl-c2`, 'C2', [agent.id]);

    const office = await createOfficeFromTemplate({
      ownerId: testUserId,
      templateId: `${TEST_PREFIX}tmpl-c2`,
      name: 'Membership Test',
    });

    const membership = await prisma.officeMembership.findFirst({
      where: { officeId: office.id, userId: testUserId },
    });
    expect(membership).not.toBeNull();
    expect(membership?.role).toBe('owner');
  });

  it('throws OfficeNotFoundError when template does not exist', async () => {
    await expect(
      createOfficeFromTemplate({
        ownerId: testUserId,
        templateId: `${TEST_PREFIX}tmpl-doesnotexist`,
        name: 'X',
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('CRITICAL: editing the source agent after office creation does NOT mutate the office snapshot', async () => {
    const originalPrompt = 'Original system prompt — long version.';
    const agent = await makeAgent(`${TEST_PREFIX}agent-snap`, 'Snapshot', originalPrompt);
    await makeTemplate(`${TEST_PREFIX}tmpl-snap`, 'Snap', [agent.id]);

    const office = await createOfficeFromTemplate({
      ownerId: testUserId,
      templateId: `${TEST_PREFIX}tmpl-snap`,
      name: 'Snapshot Test',
    });
    const snapshottedPrompt = office.agents[0]?.agent.systemPrompt;
    expect(snapshottedPrompt).toBe(originalPrompt);

    // Now MUTATE the source agent in place.
    const updatedPrompt = 'MUTATED — the office should NOT see this.';
    await prisma.agent.update({
      where: { id: agent.id },
      data: { systemPrompt: updatedPrompt },
    });

    // Re-fetch the office — its snapshot must be unchanged.
    const refetched = await getOfficeById(office.id, testUserId);
    expect(refetched).not.toBeNull();
    expect(refetched?.agents[0]?.agent.systemPrompt).toBe(originalPrompt);
    expect(refetched?.agents[0]?.agent.systemPrompt).not.toBe(updatedPrompt);

    // The template's `getTemplateById` SHOULD see the new prompt.
    const tmpl = await getTemplateById(`${TEST_PREFIX}tmpl-snap`);
    expect(tmpl?.agents[0]?.systemPrompt).toBe(updatedPrompt);
  });

  it('CRITICAL: editing the template composition does NOT mutate existing offices', async () => {
    const agentA = await makeAgent(`${TEST_PREFIX}agent-tc-A`, 'TC-A', 'A prompt');
    const agentB = await makeAgent(`${TEST_PREFIX}agent-tc-B`, 'TC-B', 'B prompt');
    const template = await makeTemplate(`${TEST_PREFIX}tmpl-tc`, 'TC', [agentA.id]);

    const office = await createOfficeFromTemplate({
      ownerId: testUserId,
      templateId: template.id,
      name: 'Composition Test',
    });
    expect(office.agents).toHaveLength(1);
    const originalOfficeAgentId = office.agents[0]?.id;

    // Add agent B to the template, change workflow.
    await prisma.templateAgent.create({
      data: { templateId: template.id, agentId: agentB.id, stepOrder: 2 },
    });
    await prisma.template.update({
      where: { id: template.id },
      data: {
        workflow: JSON.stringify([
          { order: 1, agentRole: 'TC-A', label: 'Step 1' },
          { order: 2, agentRole: 'TC-B', label: 'Step 2' },
        ]),
      },
    });

    // Office's snapshot should be unchanged.
    const refetched = await getOfficeById(office.id, testUserId);
    expect(refetched?.agents).toHaveLength(1);
    expect(refetched?.agents[0]?.id).toBe(originalOfficeAgentId);
    expect(refetched?.agents[0]?.agent.name).toBe('TC-A');
  });
});

// ── listUserOffices / getOfficeById tenancy ────────────────────────────────

describe('tenancy scoping', () => {
  it('listUserOffices returns only the caller\'s offices', async () => {
    const agent = await makeAgent(`${TEST_PREFIX}agent-tenant`, 'T', 'T');
    await makeTemplate(`${TEST_PREFIX}tmpl-tenant`, 'T', [agent.id]);

    // Create an office owned by our test user.
    await createOfficeFromTemplate({
      ownerId: testUserId,
      templateId: `${TEST_PREFIX}tmpl-tenant`,
      name: 'Owned',
    });

    // Create a second user + their own office, ensure it doesn't leak.
    const otherUser = await prisma.user.create({
      data: {
        email: `${TEST_PREFIX}other-${randomUUID()}@example.com`,
        name: 'Other',
        passwordHash: 'x',
      },
    });
    try {
      await createOfficeFromTemplate({
        ownerId: otherUser.id,
        templateId: `${TEST_PREFIX}tmpl-tenant`,
        name: 'Not Mine',
      });

      const mine = await listUserOffices(testUserId);
      const theirIds = mine.map((o) => o.id);
      expect(mine.every((o) => o.name === 'Owned')).toBe(true);
      expect(theirIds).toHaveLength(1);
    } finally {
      // Cleanup: delete their office first, then user.
      await prisma.office.deleteMany({ where: { ownerId: otherUser.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
    }
  });

  it('getOfficeById returns null for an office the user is not a member of', async () => {
    const agent = await makeAgent(`${TEST_PREFIX}agent-noaccess`, 'NA', 'NA');
    await makeTemplate(`${TEST_PREFIX}tmpl-noaccess`, 'NA', [agent.id]);

    const stranger = await prisma.user.create({
      data: {
        email: `${TEST_PREFIX}stranger-${randomUUID()}@example.com`,
        name: 'Stranger',
        passwordHash: 'x',
      },
    });
    try {
      const office = await createOfficeFromTemplate({
        ownerId: testUserId,
        templateId: `${TEST_PREFIX}tmpl-noaccess`,
        name: 'Private',
      });

      // Test user can see it.
      const mine = await getOfficeById(office.id, testUserId);
      expect(mine).not.toBeNull();

      // Stranger cannot.
      const theirs = await getOfficeById(office.id, stranger.id);
      expect(theirs).toBeNull();
    } finally {
      await prisma.office.deleteMany({ where: { ownerId: stranger.id } });
      await prisma.user.delete({ where: { id: stranger.id } });
    }
  });
});
