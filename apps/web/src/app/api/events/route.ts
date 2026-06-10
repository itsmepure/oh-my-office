// GET /api/events — replay persisted task/office events for an authenticated user.
// Tenancy guard: user must be a member of the requested office/task's office.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@repo/db';
import { eventSchema, type Event as SharedEvent } from '@repo/shared';

export const runtime = 'nodejs';

export interface EventReplayRecord {
  id: string;
  event: SharedEvent;
  ts: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const officeId = url.searchParams.get('officeId') ?? undefined;
  const taskId = url.searchParams.get('taskId') ?? undefined;

  if (!officeId && !taskId) {
    return NextResponse.json({ error: 'officeId or taskId is required' }, { status: 400 });
  }

  const allowed = await canReplayEvents(userId, { officeId, taskId });
  if (!allowed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rows = await prisma.event.findMany({
    where: {
      ...(officeId ? { officeId } : {}),
      ...(taskId ? { taskId } : {}),
    },
    orderBy: [{ ts: 'asc' }, { id: 'asc' }],
  });

  const events: EventReplayRecord[] = [];
  for (const row of rows) {
    const parsed = eventSchema.safeParse(row.payload);
    if (!parsed.success) continue;
    events.push({ id: row.id, event: parsed.data, ts: row.ts.toISOString() });
  }

  return NextResponse.json({ events });
}

async function canReplayEvents(
  userId: string,
  input: { officeId?: string; taskId?: string },
): Promise<boolean> {
  if (input.officeId) {
    const membership = await prisma.officeMembership.findUnique({
      where: { officeId_userId: { officeId: input.officeId, userId } },
      select: { id: true },
    });
    if (!membership) return false;
  }

  if (input.taskId) {
    const task = await prisma.task.findFirst({
      where: {
        id: input.taskId,
        ...(input.officeId ? { officeId: input.officeId } : {}),
        office: { memberships: { some: { userId } } },
      },
      select: { id: true },
    });
    if (!task) return false;
  }

  return true;
}
