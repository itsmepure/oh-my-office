// /api/offices/[id] — office lifecycle (Phase G2). Auth + owner-scoped.
// PATCH  → rename ({ name })
// DELETE → delete the office + workspace

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { renameOffice, deleteOffice } from '@repo/db/offices';
import type { OfficeView } from '@repo/shared';

export const runtime = 'nodejs';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<OfficeView | { error: string }>> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const name = (body as { name?: unknown }).name;
  if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 120) {
    return NextResponse.json({ error: 'Name must be 1–120 characters' }, { status: 400 });
  }

  const updated = await renameOffice(id, session.user.id, name);
  if (!updated) {
    // Either not found or not the owner — same opaque response.
    return NextResponse.json({ error: 'Office not found' }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<{ ok: true } | { error: string }>> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const deleted = await deleteOffice(id, session.user.id);
  if (!deleted) {
    return NextResponse.json({ error: 'Office not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
