// /api/offices/[id]/files/zip — download the whole workspace as a .zip
// (Phase G1). Auth + tenant-scoped. Files are read via the guarded workspace
// module, then bundled with adm-zip.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import AdmZip from 'adm-zip';
import { listWorkspaceFiles, readWorkspaceFile } from '@repo/db/workspace';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const files = await listWorkspaceFiles(id, session.user.id);
  if (files === null) return NextResponse.json({ error: 'Office not found' }, { status: 404 });
  if (files.length === 0) return NextResponse.json({ error: 'Workspace is empty' }, { status: 404 });

  const zip = new AdmZip();
  for (const f of files) {
    const file = await readWorkspaceFile(id, session.user.id, f.relPath).catch(() => null);
    if (file) zip.addFile(f.relPath, file.bytes);
  }
  const buffer = zip.toBuffer();

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="workspace-${id}.zip"`,
      'Content-Length': String(buffer.length),
    },
  });
}
