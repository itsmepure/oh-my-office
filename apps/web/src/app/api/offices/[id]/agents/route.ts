// /api/offices/[id]/agents — add / remove agents in an office.
// /api/offices/[id]/agents/reorder — bulk reorder.
// Auth-protected; only office members can manage agents.

import { NextResponse, type NextRequest } from 'next/server';
import {
  addAgentToOfficeSchema,
  reorderOfficeAgentsSchema,
  type OfficeView,
} from '@repo/shared';
import { auth } from '@/auth';
import {
  addAgentToOffice,
  removeAgentFromOffice,
  reorderOfficeAgents,
} from '@repo/db/offices';

// ── POST — add an existing agent to the office ─────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<OfficeView | { error: string; issues?: unknown }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: officeId } = await params;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = addAgentToOfficeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const office = await addAgentToOffice(officeId, session.user.id, parsed.data);
  if (!office) {
    return NextResponse.json({ error: 'Office or agent not found, or you are not a member' }, { status: 404 });
  }
  return NextResponse.json(office, { status: 200 });
}

// ── DELETE — remove an OfficeAgent (query param: ?oaId=...) ────────────────
// The DELETE handler reads the OfficeAgent id from the query string instead
// of creating a nested [oaId] route to keep the URL surface simple.

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<OfficeView | { error: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: officeId } = await params;
  const oaId = request.nextUrl.searchParams.get('oaId');
  if (!oaId) {
    return NextResponse.json({ error: 'Missing oaId query parameter' }, { status: 400 });
  }

  const office = await removeAgentFromOffice(officeId, oaId, session.user.id);
  if (!office) {
    return NextResponse.json({ error: 'Office or OfficeAgent not found' }, { status: 404 });
  }
  return NextResponse.json(office, { status: 200 });
}

// ── PATCH — bulk reorder (must be at /reorder path) ────────────────────────
// The Next.js file-based router maps /api/offices/[id]/agents/reorder
// to a separate route file. This handler only fires if the request is
// PATCH with path ending in /reorder.

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<OfficeView | { error: string; issues?: unknown }>> {
  // Only act on reorder requests; the default PATCH on this route is a no-op.
  // We detect by checking if the URL path ends with /reorder.
  if (!request.nextUrl.pathname.endsWith('/reorder')) {
    // Fall through — this is handled by the separate [id]/agents/reorder/route.ts
    return NextResponse.json({ error: 'Use PATCH /api/offices/[id]/agents/reorder for reordering' }, { status: 405 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: officeId } = await params;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = reorderOfficeAgentsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const office = await reorderOfficeAgents(officeId, session.user.id, parsed.data);
  if (!office) {
    return NextResponse.json({ error: 'Office not found or you are not a member' }, { status: 404 });
  }
  return NextResponse.json(office, { status: 200 });
}
