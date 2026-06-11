// /api/offices/[id]/members — Team office membership (Phase M4). Auth-protected.
// GET    → list members (any member)
// POST   → add member by email (owner + Team plan only)
// DELETE → remove member by ?userId= (owner only)

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import {
  listOfficeMembers,
  addOfficeMember,
  removeOfficeMember,
  NotTeamPlanError,
  NotOfficeOwnerError,
  UserNotFoundError,
  type MemberView,
} from '@repo/db/members';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<MemberView[] | { error: string }>> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const members = await listOfficeMembers(id, session.user.id);
  if (members === null) return NextResponse.json({ error: 'Office not found' }, { status: 404 });
  return NextResponse.json(members);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<MemberView | { error: string }>> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const email = (body as { email?: unknown }).email;
  if (typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }

  try {
    const member = await addOfficeMember(id, session.user.id, email);
    return NextResponse.json(member, { status: 201 });
  } catch (err) {
    if (err instanceof NotOfficeOwnerError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof NotTeamPlanError) return NextResponse.json({ error: err.message, upgradeTo: 'TEAM' }, { status: 402 });
    if (err instanceof UserNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    console.error('[api/offices/members POST] error', err);
    return NextResponse.json({ error: 'Failed to add member' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<{ ok: true } | { error: string }>> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const targetUserId = request.nextUrl.searchParams.get('userId');
  if (!targetUserId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  try {
    const removed = await removeOfficeMember(id, session.user.id, targetUserId);
    if (!removed) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotOfficeOwnerError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/offices/members DELETE] error', err);
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
  }
}
