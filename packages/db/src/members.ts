// @repo/db/members — Team office membership management (Phase M4).
//
// Team-plan office owners can add other users (by email) as members of an
// office. Members get full access to that office (view + run tasks) via the
// existing OfficeMembership-scoped reads. Their platform-agent runs debit the
// OFFICE OWNER's credit pool (the runner already bills office.ownerId), so a
// Team pools credits at the owner automatically.

import { prisma } from './index.js';
import { getPlan } from './entitlements.js';

export class NotTeamPlanError extends Error {
  readonly code = 'NOT_TEAM_PLAN';
  constructor() {
    super('Adding members requires a Team plan.');
    this.name = 'NotTeamPlanError';
  }
}
export class NotOfficeOwnerError extends Error {
  readonly code = 'NOT_OWNER';
  constructor() {
    super('Only the office owner can manage members.');
    this.name = 'NotOfficeOwnerError';
  }
}
export class UserNotFoundError extends Error {
  readonly code = 'USER_NOT_FOUND';
  constructor() {
    super('No user with that email.');
    this.name = 'UserNotFoundError';
  }
}

export interface MemberView {
  userId: string;
  email: string;
  name: string;
  role: string;
}

/** List members of an office (must be a member to view). */
export async function listOfficeMembers(officeId: string, requesterId: string): Promise<MemberView[] | null> {
  const access = await prisma.officeMembership.findUnique({
    where: { officeId_userId: { officeId, userId: requesterId } },
    select: { id: true },
  });
  if (!access) return null;

  const rows = await prisma.officeMembership.findMany({
    where: { officeId },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { role: 'asc' },
  });
  return rows.map((m) => ({
    userId: m.user.id,
    email: m.user.email,
    name: m.user.name,
    role: m.role,
  }));
}

/**
 * Add a member to an office by email. Only the office owner on a TEAM plan may
 * do this. Idempotent: re-adding an existing member is a no-op.
 */
export async function addOfficeMember(
  officeId: string,
  ownerId: string,
  email: string,
): Promise<MemberView> {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { ownerId: true },
  });
  if (!office || office.ownerId !== ownerId) throw new NotOfficeOwnerError();

  if ((await getPlan(ownerId)) !== 'TEAM') throw new NotTeamPlanError();

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { id: true, email: true, name: true },
  });
  if (!user) throw new UserNotFoundError();

  await prisma.officeMembership.upsert({
    where: { officeId_userId: { officeId, userId: user.id } },
    create: { officeId, userId: user.id, role: 'member' },
    update: {},
  });
  return { userId: user.id, email: user.email, name: user.name, role: 'member' };
}

/** Remove a member (owner only; cannot remove the owner). */
export async function removeOfficeMember(
  officeId: string,
  ownerId: string,
  targetUserId: string,
): Promise<boolean> {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { ownerId: true },
  });
  if (!office || office.ownerId !== ownerId) throw new NotOfficeOwnerError();
  if (targetUserId === ownerId) return false; // can't remove the owner

  const res = await prisma.officeMembership.deleteMany({
    where: { officeId, userId: targetUserId, role: { not: 'owner' } },
  });
  return res.count > 0;
}
