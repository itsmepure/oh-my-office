// /api/tasks/[taskId]/artifacts/[artifactId]/download — download a single
// artifact (Phase G1). Auth + tenant-scoped (via the task's office membership).
// Inline-content artifacts return as a text file; fileRef artifacts stream the
// underlying workspace file through the path guard.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@repo/db';
import { readWorkspaceFile, PathEscapeError } from '@repo/db/workspace';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string; artifactId: string }> },
): Promise<NextResponse | Response> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { taskId, artifactId } = await params;

  // Load artifact + its task's office, scoped to a member of that office.
  const artifact = await prisma.artifact.findFirst({
    where: {
      id: artifactId,
      taskId,
      task: { office: { memberships: { some: { userId: session.user.id } } } },
    },
    include: { task: { select: { officeId: true } } },
  });
  if (!artifact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const fileName = artifact.name || 'artifact.txt';

  // Inline content → return as a downloadable text file.
  if (artifact.content != null) {
    const bytes = Buffer.from(artifact.content, 'utf-8');
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName.replace(/"/g, '')}"`,
        'Content-Length': String(bytes.length),
      },
    });
  }

  // fileRef → stream the underlying workspace file (guarded).
  if (artifact.fileRef) {
    try {
      const file = await readWorkspaceFile(artifact.task.officeId, session.user.id, artifact.fileRef);
      if (file === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return new Response(new Uint8Array(file.bytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${fileName.replace(/"/g, '')}"`,
          'Content-Length': String(file.bytes.length),
        },
      });
    } catch (err) {
      if (err instanceof PathEscapeError) return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
  }

  return NextResponse.json({ error: 'Artifact has no content' }, { status: 404 });
}
