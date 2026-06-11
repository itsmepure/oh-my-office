// /api/offices/[id]/files — list workspace files (Phase G1). Auth + tenant-scoped.
// GET → list every file the office's agents have produced.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { listWorkspaceFiles, type WorkspaceFile } from '@repo/db/workspace';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<WorkspaceFile[] | { error: string }>> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const files = await listWorkspaceFiles(id, session.user.id);
  if (files === null) return NextResponse.json({ error: 'Office not found' }, { status: 404 });
  return NextResponse.json(files);
}
