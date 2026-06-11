// /api/billing/crypto — USDC-on-Solana credit-pack payments (devnet first).
// POST { packId } → create a pending payment, return Solana Pay URL + reference.
// GET  ?reference=  → verify on-chain + settle (idempotent). Returns status.
// Auth + tenant-scoped (verifyAndSettle checks the payment belongs to the user).

import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import {
  createCryptoPayment,
  verifyAndSettle,
  isCryptoBillingConfigured,
} from '@repo/db/crypto-billing';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isCryptoBillingConfigured()) {
    return NextResponse.json({ error: 'Crypto billing not configured' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const packId = (body as { packId?: unknown }).packId;
  if (typeof packId !== 'string') {
    return NextResponse.json({ error: 'packId is required' }, { status: 400 });
  }

  try {
    const result = await createCryptoPayment(session.user.id, packId);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const reference = request.nextUrl.searchParams.get('reference');
  if (!reference) return NextResponse.json({ error: 'Missing reference' }, { status: 400 });

  try {
    const status = await verifyAndSettle(session.user.id, reference);
    if (status === null) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    return NextResponse.json(status);
  } catch (err) {
    console.error('[api/billing/crypto GET] verify error', err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
