// POST /api/tasks — create a queued task for an office.
// Auth-protected + tenant-scoped. Orchestrator daemon picks it up from DB.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@repo/db';
import { getPlan } from '@repo/db/entitlements';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// Per-user task-creation cap: protects platform-key spend + queue abuse.
const TASK_RATE_MAX = 20;
const TASK_RATE_WINDOW_MS = 60_000;

const createTaskSchema = z.object({
  // Accept any non-empty id (most offices use UUIDs, but seeded/demo offices
  // may use a stable slug like "office-demo-001"). Tenancy is enforced by the
  // membership check below, so we don't require a strict UUID here.
  officeId: z.string().min(1, 'officeId is required'),
  prompt: z.string().min(1, 'prompt is required').max(10_000).trim(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit task creation per user.
  const rl = rateLimit(`task:${userId}`, TASK_RATE_MAX, TASK_RATE_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many tasks — slow down a moment.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createTaskSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const membership = await prisma.officeMembership.findUnique({
    where: { officeId_userId: { officeId: parsed.data.officeId, userId } },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: 'Office not found' }, { status: 404 });
  }

  // Priority queue: Team offices get higher dequeue priority. Priority is based
  // on the OFFICE OWNER's plan (the pool/seat holder), not the runner.
  const office = await prisma.office.findUnique({
    where: { id: parsed.data.officeId },
    select: { ownerId: true },
  });
  const ownerPlan = office ? await getPlan(office.ownerId) : 'FREE';
  const priority = ownerPlan === 'TEAM' ? 10 : 0;

  const task = await prisma.task.create({
    data: {
      officeId: parsed.data.officeId,
      prompt: parsed.data.prompt,
      status: 'queued',
      priority,
    },
  });

  return NextResponse.json(
    {
      task: {
        id: task.id,
        officeId: task.officeId,
        prompt: task.prompt,
        status: task.status,
        createdAt: task.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
