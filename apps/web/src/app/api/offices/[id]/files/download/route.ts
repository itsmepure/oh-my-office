// /api/offices/[id]/files/download?path=<rel> — stream one workspace file
// (Phase G1). Auth + tenant-scoped + path-guarded (escape → 403).

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { readWorkspaceFile, PathEscapeError } from '@repo/db/workspace';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const relPath = request.nextUrl.searchParams.get('path');
  if (!relPath) return NextResponse.json({ error: 'Missing path' }, { status: 400 });

  try {
    const file = await readWorkspaceFile(id, session.user.id, relPath);
    if (file === null) return NextResponse.json({ error: 'Office not found' }, { status: 404 });
    const name = file.relPath.split('/').pop() ?? 'file';
    return new Response(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${name.replace(/"/g, '')}"`,
        'Content-Length': String(file.bytes.length),
      },
    });
  } catch (err) {
    if (err instanceof PathEscapeError) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
    }
    // Missing file on disk, etc.
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
