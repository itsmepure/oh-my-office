// POST /api/offices — Create a new Office from a Template.
// Auth-protected (requires an active session).
// Validates the request body, then calls createOfficeFromTemplate which
// snapshots the template's agents into OfficeAgent rows and provisions the
// per-office workspace directory on disk.

import { NextResponse, type NextRequest } from 'next/server';
import { createOfficeRequestSchema, type OfficeView } from '@repo/shared';
import { auth } from '@/auth';
import {
  createOfficeFromTemplate,
  OfficeNotFoundError,
  InvalidTemplateError,
} from '@repo/db/offices';
import { canCreateOffice } from '@repo/db/entitlements';

export async function POST(request: NextRequest): Promise<NextResponse<OfficeView | { error: string }>> {
  // 1. Authn: must be signed in.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse + validate body.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createOfficeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // 3. Entitlement: enforce the per-plan office cap.
  const gate = await canCreateOffice(session.user.id);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: gate.reason ?? 'Office limit reached', upgradeTo: gate.upgradeTo },
      { status: 402 },
    );
  }

  // 4. Create.
  try {
    const office = await createOfficeFromTemplate({
      ownerId: session.user.id,
      templateId: parsed.data.templateId,
      name: parsed.data.name,
    });
    return NextResponse.json(office, { status: 201 });
  } catch (err) {
    if (err instanceof OfficeNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof InvalidTemplateError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error('[api/offices POST] unexpected error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
