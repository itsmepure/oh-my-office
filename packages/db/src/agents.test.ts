// Unit tests for agent CRUD (Phase 5).
// Tests scoping (ownerId), knowledge-doc lifecycle, and office-agent
// snapshot isolation.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from './index.js';
import { createAgent, getAgentById, listUserAgents, updateAgent, deleteAgent, createKnowledgeDoc, deleteKnowledgeDoc } from './agents.js';
import { addAgentToOffice, createOfficeFromTemplate, removeAgentFromOffice } from './offices.js';

const TEST_PREFIX = `p5-test-${Date.now()}-`;
let testUserId: string;
let testUserEmail: string;

beforeAll(async () => {
  testUserEmail = `${TEST_PREFIX}${randomUUID()}@example.com`;
  const user = await prisma.user.create({
    data: { email: testUserEmail, name: 'P5 Test', passwordHash: 'x' },
  });
  testUserId = user.id;
});

afterAll(async () => {
  if (testUserId) {
    await prisma.office.deleteMany({ where: { ownerId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  }
  // Clean up in reverse FK order: templateAgents → agents → templates.
  await prisma.templateAgent.deleteMany({
    where: { template: { id: { startsWith: `${TEST_PREFIX}tmpl` } } },
  });
  await prisma.agent.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
  await prisma.template.deleteMany({ where: { id: { startsWith: `${TEST_PREFIX}tmpl` } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.agent.deleteMany({ where: { ownerId: testUserId } });
  await prisma.office.deleteMany({ where: { ownerId: testUserId } });
});

describe('agent CRUD', () => {
  it('createAgent returns AgentView with correct fields', async () => {
    const agent = await createAgent(testUserId, {
      name: 'TestBot',
      role: 'Tester',
      systemPrompt: 'You are a tester.',
      tools: ['read_file', 'search'],
      modelConfig: { model: 'gpt-5', temperature: 0.7 },
    });
    expect(agent.id).toBeTruthy();
    expect(agent.name).toBe('TestBot');
    expect(agent.role).toBe('Tester');
    expect(agent.tools).toEqual(['read_file', 'search']);
    expect(agent.modelConfig).toEqual({ model: 'gpt-5', temperature: 0.7 });
  });

  it('createAgent with knowledgeDocs creates them', async () => {
    const agent = await createAgent(testUserId, {
      name: 'DocBot',
      role: 'Doc',
      systemPrompt: 'x',
      tools: ['read_file'],
      knowledgeDocs: [
        { title: 'Guide', content: 'Always test first.' },
        { title: 'Rules', content: 'No fluff.' },
      ],
    });
    const full = await getAgentById(agent.id, testUserId, { includeDocs: true });
    expect(full).not.toBeNull();
    const docs = (full as { knowledgeDocs?: Array<{ title: string }> }).knowledgeDocs ?? [];
    expect(docs).toHaveLength(2);
    expect(docs[0].title).toBe('Guide');
  });

  it('listUserAgents returns only the owner\'s agents', async () => {
    await createAgent(testUserId, { name: 'Mine', role: 'R', systemPrompt: 'x', tools: ['read_file'] });

    const stranger = await prisma.user.create({
      data: { email: `${TEST_PREFIX}s2@t.com`, name: 'S', passwordHash: 'x' },
    });
    try {
      await createAgent(stranger.id, { name: 'Theirs', role: 'R', systemPrompt: 'x', tools: ['read_file'] });
      const mine = await listUserAgents(testUserId);
      expect(mine.every((a) => a.name === 'Mine')).toBe(true);
      expect(mine).toHaveLength(1);
    } finally {
      await prisma.agent.deleteMany({ where: { ownerId: stranger.id } });
      await prisma.user.delete({ where: { id: stranger.id } });
    }
  });

  it('updateAgent changes fields', async () => {
    const agent = await createAgent(testUserId, { name: 'Old', role: 'R', systemPrompt: 'old', tools: ['read_file'] });
    const updated = await updateAgent(agent.id, testUserId, { name: 'New', role: 'NewR' });
    expect(updated?.name).toBe('New');
    expect(updated?.role).toBe('NewR');
    expect(updated?.systemPrompt).toBe('old'); // unchanged
  });

  it('updateAgent returns null for non-owned agent', async () => {
    const agent = await createAgent(testUserId, { name: 'M', role: 'R', systemPrompt: 'x', tools: ['read_file'] });
    const result = await updateAgent(agent.id, 'nonexistent-user-id', { name: 'Hacked' });
    expect(result).toBeNull();
  });

  it('deleteAgent returns false for non-owned agent', async () => {
    const agent = await createAgent(testUserId, { name: 'M', role: 'R', systemPrompt: 'x', tools: ['read_file'] });
    const result = await deleteAgent(agent.id, 'nonexistent-user-id');
    expect(result).toBe(false);
    // Should still exist for the real owner.
    const stillThere = await getAgentById(agent.id, testUserId);
    expect(stillThere).not.toBeNull();
  });

  it('deleteAgent cascades knowledge docs', async () => {
    const agent = await createAgent(testUserId, {
      name: 'DelMe', role: 'R', systemPrompt: 'x', tools: ['read_file'],
      knowledgeDocs: [{ title: 'TD', content: 'test' }],
    });
    await deleteAgent(agent.id, testUserId);
    const docs = await prisma.knowledgeDoc.findMany({ where: { agentId: agent.id } });
    expect(docs).toHaveLength(0);
  });
});

describe('knowledge docs lifecycle', () => {
  it('createKnowledgeDoc returns null for non-owned agent', async () => {
    const result = await createKnowledgeDoc('nonexistent', testUserId, { title: 'x', content: 'y' });
    expect(result).toBeNull();
  });

  it('deleteKnowledgeDoc returns false for another user\'s doc', async () => {
    const agent = await createAgent(testUserId, { name: 'M', role: 'R', systemPrompt: 'x', tools: ['read_file'] });
    const doc = await createKnowledgeDoc(agent.id, testUserId, { title: 'D', content: 'c' });
    expect(doc).not.toBeNull();
    const result = await deleteKnowledgeDoc(doc!.id, 'other-user-id');
    expect(result).toBe(false);
  });
});

describe('office agent snapshot isolation', () => {
  it('adding an agent snapshots its config; editing the source agent does not change the snapshot', async () => {
    // 1. Create a user agent
    const agent = await createAgent(testUserId, {
      name: 'SnapshotBot', role: 'S', systemPrompt: 'Original prompt',
      tools: ['read_file', 'search'],
    });

    // 2. Create a throwaway template + office
    const platformAgent = await prisma.agent.create({
      data: { id: `${TEST_PREFIX}pa`, name: 'PA', role: 'PA', systemPrompt: 'x', tools: '["read_file"]', modelConfig: '{}' },
    });
    const tmpl = await prisma.template.create({
      data: { id: `${TEST_PREFIX}tmpl`, name: 'T', description: 'D', category: 'test', workflow: JSON.stringify([{ order: 1, agentRole: 'PA', label: 'S1' }]) },
    });
    await prisma.templateAgent.create({ data: { templateId: tmpl.id, agentId: platformAgent.id, stepOrder: 1 } });

    const office = await createOfficeFromTemplate({
      ownerId: testUserId, templateId: tmpl.id, name: 'Snapshot Office',
    });

    // 3. Add the user agent at position 2
    const withAgent = await addAgentToOffice(office.id, testUserId, { agentId: agent.id, stepOrder: 2 });
    expect(withAgent).not.toBeNull();
    expect(withAgent!.agents).toHaveLength(2);
    const snapshot = withAgent!.agents[1]!.agent;
    expect(snapshot.name).toBe('SnapshotBot');
    expect(snapshot.systemPrompt).toBe('Original prompt');

    // 4. Edit the source agent
    await updateAgent(agent.id, testUserId, { systemPrompt: 'MUTATED prompt' });

    // 5. Re-fetch the office — snapshot must be unchanged
    const { getOfficeById } = await import('./offices.js');
    const refetched = await getOfficeById(office.id, testUserId);
    const refetchedSnap = refetched!.agents[1]!.agent;
    expect(refetchedSnap.systemPrompt).toBe('Original prompt');
    expect(refetchedSnap.systemPrompt).not.toBe('MUTATED prompt');
    // Source agent should reflect the mutation.
    const source = await getAgentById(agent.id, testUserId);
    expect(source!.systemPrompt).toBe('MUTATED prompt');
  });

  it('removeAgentFromOffice re-numbers trailing agents', async () => {
    const a1 = await createAgent(testUserId, { name: 'A1', role: 'R', systemPrompt: 'x', tools: ['read_file'] });
    const a2 = await createAgent(testUserId, { name: 'A2', role: 'R', systemPrompt: 'x', tools: ['read_file'] });

    const platformAgent = await prisma.agent.create({
      data: { id: `${TEST_PREFIX}pa2`, name: 'PA2', role: 'PA', systemPrompt: 'x', tools: '["read_file"]', modelConfig: '{}' },
    });
    const tmpl = await prisma.template.create({
      data: { id: `${TEST_PREFIX}tmpl2`, name: 'T2', description: 'D', category: 'test', workflow: JSON.stringify([{ order: 1, agentRole: 'PA', label: 'S1' }]) },
    });
    await prisma.templateAgent.create({ data: { templateId: tmpl.id, agentId: platformAgent.id, stepOrder: 1 } });

    const office = await createOfficeFromTemplate({
      ownerId: testUserId, templateId: tmpl.id, name: 'Remove Test',
    });

    await addAgentToOffice(office.id, testUserId, { agentId: a1.id, stepOrder: 2 });
    await addAgentToOffice(office.id, testUserId, { agentId: a2.id, stepOrder: 3 });

    const before = await prisma.officeAgent.findMany({ where: { officeId: office.id }, orderBy: { stepOrder: 'asc' } });
    // Office now has 3 agents (step 1 from template, 2=a1, 3=a2).
    expect(before).toHaveLength(3);

    // Remove the middle one (a1 at step 2).
    const oaA1 = before.find((oa) => oa.stepOrder === 2)!;
    await removeAgentFromOffice(office.id, oaA1.id, testUserId);

    const after = await prisma.officeAgent.findMany({ where: { officeId: office.id }, orderBy: { stepOrder: 'asc' } });
    expect(after).toHaveLength(2);
    expect(after.map((oa) => oa.stepOrder)).toEqual([1, 2]);
  });
});
