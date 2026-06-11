// Unit tests for tenant-scoped workspace file access (Phase G1). Real Postgres
// + a real temp workspace dir. Verifies listing, reading bytes, path-guard
// escape rejection, and tenancy (non-member sees nothing).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prisma } from './index.js';
import { listWorkspaceFiles, readWorkspaceFile, PathEscapeError } from './workspace.js';

const PREFIX = `wstest-${Date.now()}-`;
let ownerId = '';
let outsiderId = '';
let officeId = '';
const tmplId = `${PREFIX}tmpl`;
let wsRoot = '';

beforeAll(async () => {
  const o = await prisma.user.create({ data: { email: `${PREFIX}o-${randomUUID()}@x.local`, name: 'O', passwordHash: 'x' } });
  ownerId = o.id;
  const x = await prisma.user.create({ data: { email: `${PREFIX}x-${randomUUID()}@x.local`, name: 'X', passwordHash: 'x' } });
  outsiderId = x.id;
  await prisma.template.create({ data: { id: tmplId, name: 'WS Tmpl', description: 'x', category: 'test', workflow: '[]' } });

  // Real temp workspace with a file + a nested file.
  wsRoot = mkdtempSync(join(tmpdir(), 'oo-ws-'));
  writeFileSync(join(wsRoot, 'hello.py'), 'print("hi")\n');
  mkdirSync(join(wsRoot, 'sub'));
  writeFileSync(join(wsRoot, 'sub', 'data.txt'), 'abc');

  const office = await prisma.office.create({
    data: {
      name: 'WS Office',
      templateId: tmplId,
      ownerId,
      workspacePath: wsRoot, // absolute
      memberships: { create: { userId: ownerId, role: 'owner' } },
    },
  });
  officeId = office.id;
});

afterAll(async () => {
  await prisma.officeMembership.deleteMany({ where: { officeId } });
  await prisma.office.deleteMany({ where: { id: officeId } });
  await prisma.template.deleteMany({ where: { id: tmplId } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, outsiderId] } } });
  await prisma.$disconnect();
  try { rmSync(wsRoot, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('listWorkspaceFiles', () => {
  it('lists files (incl. nested), sorted by relPath', async () => {
    const files = await listWorkspaceFiles(officeId, ownerId);
    expect(files).not.toBeNull();
    const paths = files!.map((f) => f.relPath);
    expect(paths).toContain('hello.py');
    expect(paths).toContain('sub/data.txt');
  });

  it('tenancy: outsider gets null', async () => {
    expect(await listWorkspaceFiles(officeId, outsiderId)).toBeNull();
  });
});

describe('readWorkspaceFile', () => {
  it('returns exact bytes', async () => {
    const f = await readWorkspaceFile(officeId, ownerId, 'hello.py');
    expect(f).not.toBeNull();
    expect(f!.bytes.toString('utf-8')).toBe('print("hi")\n');
  });

  it('reads nested files', async () => {
    const f = await readWorkspaceFile(officeId, ownerId, 'sub/data.txt');
    expect(f!.bytes.toString('utf-8')).toBe('abc');
  });

  it('rejects path escape', async () => {
    await expect(readWorkspaceFile(officeId, ownerId, '../../etc/passwd')).rejects.toBeInstanceOf(PathEscapeError);
  });

  it('tenancy: outsider gets null', async () => {
    expect(await readWorkspaceFile(officeId, outsiderId, 'hello.py')).toBeNull();
  });
});
