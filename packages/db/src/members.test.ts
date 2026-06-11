// Unit tests for Team office membership + management (Phase M4). Real Postgres.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from './index.js';
import {
  addOfficeMember,
  removeOfficeMember,
  listOfficeMembers,
  NotTeamPlanError,
  NotOfficeOwnerError,
  UserNotFoundError,
} from './members.js';

const PREFIX = `memtest-${Date.now()}-`;
let teamOwner = '';
let freeOwner = '';
let memberUser = '';
let outsider = '';
const tmplId = `${PREFIX}tmpl`;
let teamOfficeId = '';
let freeOfficeId = '';

async function mkUser(label: string, plan?: 'FREE' | 'PRO' | 'TEAM'): Promise<string> {
  const u = await prisma.user.create({
    data: { email: `${PREFIX}${label}-${randomUUID()}@x.local`, name: label, passwordHash: 'x' },
  });
  if (plan) await prisma.subscription.create({ data: { userId: u.id, plan, status: 'active' } });
  return u.id;
}

async function mkOffice(ownerId: string): Promise<string> {
  const o = await prisma.office.create({
    data: {
      name: 'Office',
      templateId: tmplId,
      ownerId,
      workspacePath: `/tmp/mem-${randomUUID()}`,
      memberships: { create: { userId: ownerId, role: 'owner' } },
    },
  });
  return o.id;
}

beforeAll(async () => {
  teamOwner = await mkUser('teamowner', 'TEAM');
  freeOwner = await mkUser('freeowner', 'FREE');
  memberUser = await mkUser('member');
  outsider = await mkUser('outsider');
  await prisma.template.create({
    data: { id: tmplId, name: 'Mem Tmpl', description: 'x', category: 'test', workflow: '[]' },
  });
  teamOfficeId = await mkOffice(teamOwner);
  freeOfficeId = await mkOffice(freeOwner);
});

afterAll(async () => {
  const ids = [teamOwner, freeOwner, memberUser, outsider].filter(Boolean);
  await prisma.officeMembership.deleteMany({ where: { officeId: { in: [teamOfficeId, freeOfficeId] } } });
  await prisma.office.deleteMany({ where: { id: { in: [teamOfficeId, freeOfficeId] } } });
  await prisma.template.deleteMany({ where: { id: tmplId } });
  await prisma.subscription.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe('addOfficeMember', () => {
  it('Team owner can add a member by email', async () => {
    const memberEmail = (await prisma.user.findUnique({ where: { id: memberUser } }))!.email;
    const m = await addOfficeMember(teamOfficeId, teamOwner, memberEmail);
    expect(m.userId).toBe(memberUser);
    expect(m.role).toBe('member');

    // Member now has access (membership-scoped reads).
    const members = await listOfficeMembers(teamOfficeId, memberUser);
    expect(members).not.toBeNull();
    expect(members!.length).toBe(2);
  });

  it('FREE owner is blocked (Team-only feature)', async () => {
    const email = (await prisma.user.findUnique({ where: { id: outsider } }))!.email;
    await expect(addOfficeMember(freeOfficeId, freeOwner, email)).rejects.toBeInstanceOf(NotTeamPlanError);
  });

  it('non-owner cannot add members', async () => {
    const email = (await prisma.user.findUnique({ where: { id: outsider } }))!.email;
    await expect(addOfficeMember(teamOfficeId, memberUser, email)).rejects.toBeInstanceOf(NotOfficeOwnerError);
  });

  it('unknown email throws', async () => {
    await expect(addOfficeMember(teamOfficeId, teamOwner, 'nobody@nowhere.local')).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe('tenancy', () => {
  it('outsider cannot list members', async () => {
    expect(await listOfficeMembers(teamOfficeId, outsider)).toBeNull();
  });
});

describe('removeOfficeMember', () => {
  it('owner can remove a member', async () => {
    const ok = await removeOfficeMember(teamOfficeId, teamOwner, memberUser);
    expect(ok).toBe(true);
    expect(await listOfficeMembers(teamOfficeId, memberUser)).toBeNull(); // lost access
  });

  it('cannot remove the owner', async () => {
    expect(await removeOfficeMember(teamOfficeId, teamOwner, teamOwner)).toBe(false);
  });
});
