// POST /api/tasks — create a queued task for an office.
// Auth-protected + tenant-scoped. Orchestrator daemon picks it up from DB.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@repo/db';

export const runtime = 'nodejs';

const createTaskSchema = z.object({
  officeId: z.string().uuid(),
  prompt: z.string().min(1, 'prompt is required').max(10_000).trim(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

  const task = await prisma.task.create({
    data: {
      officeId: parsed.data.officeId,
      prompt: parsed.data.prompt,
      status: 'queued',
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
