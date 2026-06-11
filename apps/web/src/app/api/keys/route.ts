// /api/keys — BYOK (bring-your-own-key) management. Auth-protected.
// GET    → list the user's keys (MASKED: provider/model/last4 only)
// POST   → add/replace a key (plaintext in body, encrypted server-side)
// DELETE → remove a key by ?id=
//
// SECURITY: the plaintext key is accepted on POST, encrypted at rest, and
// NEVER returned. List/read responses contain only masked metadata.

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import {
  createLlmKey,
  listLlmKeys,
  deleteLlmKey,
  type LlmKeyView,
} from '@repo/db/keys';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse<LlmKeyView[] | { error: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const keys = await listLlmKeys(session.user.id);
  return NextResponse.json(keys);
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<LlmKeyView | { error: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const b = body as {
    apiKey?: unknown;
    provider?: unknown;
    baseUrl?: unknown;
    model?: unknown;
    officeId?: unknown;
  };

  if (typeof b.apiKey !== 'string' || b.apiKey.trim().length < 8) {
    return NextResponse.json({ error: 'apiKey is required (min 8 chars)' }, { status: 400 });
  }

  try {
    const view = await createLlmKey({
      userId: session.user.id,
      apiKey: b.apiKey,
      provider: typeof b.provider === 'string' ? b.provider : undefined,
      baseUrl: typeof b.baseUrl === 'string' ? b.baseUrl : undefined,
      model: typeof b.model === 'string' ? b.model : undefined,
      officeId: typeof b.officeId === 'string' ? b.officeId : null,
    });
    return NextResponse.json(view, { status: 201 });
  } catch (err) {
    console.error('[api/keys POST] error', err);
    return NextResponse.json({ error: 'Failed to save key' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
): Promise<NextResponse<{ ok: true } | { error: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id query parameter' }, { status: 400 });
  }
  const removed = await deleteLlmKey(session.user.id, id);
  if (!removed) {
    return NextResponse.json({ error: 'Key not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
