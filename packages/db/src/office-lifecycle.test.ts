// Unit tests for office rename + delete (Phase G2). Real Postgres + temp folder.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prisma } from './index.js';
import { renameOffice, deleteOffice } from './offices.js';

const PREFIX = `lifetest-${Date.now()}-`;
let ownerId = '';
let otherId = '';
const tmplId = `${PREFIX}tmpl`;

async function mkUser(label: string): Promise<string> {
  const u = await prisma.user.create({ data: { email: `${PREFIX}${label}-${randomUUID()}@x.local`, name: label, passwordHash: 'x' } });
  return u.id;
}

async function mkOffice(owner: string, wsRoot: string): Promise<string> {
  const o = await prisma.office.create({
    data: {
      name: 'Orig Name',
      templateId: tmplId,
      ownerId: owner,
      workspacePath: wsRoot,
      memberships: { create: { userId: owner, role: 'owner' } },
    },
  });
  return o.id;
}

beforeAll(async () => {
  ownerId = await mkUser('owner');
  otherId = await mkUser('other');
  await prisma.template.create({ data: { id: tmplId, name: 'Life Tmpl', description: 'x', category: 'test', workflow: '[]' } });
});

afterAll(async () => {
  await prisma.officeMembership.deleteMany({ where: { office: { templateId: tmplId } } });
  await prisma.office.deleteMany({ where: { templateId: tmplId } });
  await prisma.template.deleteMany({ where: { id: tmplId } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
  await prisma.$disconnect();
});

describe('renameOffice', () => {
  it('owner renames', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'oo-life-'));
    const id = await mkOffice(ownerId, ws);
    const updated = await renameOffice(id, ownerId, '  New Name  ');
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('New Name'); // trimmed
  });

  it('non-owner cannot rename (null)', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'oo-life-'));
    const id = await mkOffice(ownerId, ws);
    expect(await renameOffice(id, otherId, 'Hacked')).toBeNull();
    // unchanged
    const row = await prisma.office.findUnique({ where: { id } });
    expect(row!.name).toBe('Orig Name');
  });

  it('rejects empty / too-long names', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'oo-life-'));
    const id = await mkOffice(ownerId, ws);
    expect(await renameOffice(id, ownerId, '   ')).toBeNull();
    expect(await renameOffice(id, ownerId, 'x'.repeat(121))).toBeNull();
  });
});

describe('deleteOffice', () => {
  it('owner deletes office + cascades + removes workspace folder', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'oo-life-'));
    writeFileSync(join(ws, 'f.txt'), 'data');
    const id = await mkOffice(ownerId, ws);
    // Add a task + event + artifact to prove cascade.
    const t = await prisma.task.create({ data: { officeId: id, prompt: 'p', status: 'done' } });
    await prisma.event.create({ data: { taskId: t.id, officeId: id, type: 'task.status', payload: '{}' } });
    await prisma.artifact.create({ data: { taskId: t.id, type: 'text', name: 'a.txt', content: 'x' } });

    expect(existsSync(ws)).toBe(true);
    const ok = await deleteOffice(id, ownerId);
    expect(ok).toBe(true);
    expect(await prisma.office.findUnique({ where: { id } })).toBeNull();
    expect(await prisma.task.findUnique({ where: { id: t.id } })).toBeNull();
    expect(existsSync(ws)).toBe(false); // folder removed
  });

  it('non-owner cannot delete (false, office intact)', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'oo-life-'));
    const id = await mkOffice(ownerId, ws);
    expect(await deleteOffice(id, otherId)).toBe(false);
    expect(await prisma.office.findUnique({ where: { id } })).not.toBeNull();
  });
});
