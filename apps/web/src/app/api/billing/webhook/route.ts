// POST /api/billing/webhook — Lemon Squeezy webhook receiver (Phase M3).
//
// Verifies the HMAC-SHA256 signature, then maps the event to a subscription or
// credit-pack action. Variant→plan / variant→credits mapping is config-driven
// via env so we don't hardcode store IDs:
//   LEMON_WEBHOOK_SECRET           — signing secret (required to accept events)
//   LEMON_VARIANT_PRO              — variant id for the Pro plan
//   LEMON_VARIANT_TEAM             — variant id for the Team plan
//   LEMON_VARIANT_PACK_SMALL/MED/LARGE — credit pack variant ids
//
// The user is matched via `custom_data.user_id` passed at checkout, falling
// back to email lookup.

import { NextResponse, type NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@repo/db';
import {
  activateSubscription,
  cancelSubscription,
  markPastDue,
  fulfillCreditPack,
} from '@repo/db/billing';
import type { Plan } from '@repo/db/entitlements';

export const runtime = 'nodejs';

function verifySignature(raw: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const PACK_CREDITS: Record<string, number> = {
  [process.env['LEMON_VARIANT_PACK_SMALL'] ?? '__small']: 1000,
  [process.env['LEMON_VARIANT_PACK_MED'] ?? '__med']: 5000,
  [process.env['LEMON_VARIANT_PACK_LARGE'] ?? '__large']: 15000,
};

function planForVariant(variantId: string): Plan | null {
  if (variantId === process.env['LEMON_VARIANT_PRO']) return 'PRO';
  if (variantId === process.env['LEMON_VARIANT_TEAM']) return 'TEAM';
  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env['LEMON_WEBHOOK_SECRET'];
  if (!secret) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  }

  const raw = await request.text();
  const signature = request.headers.get('x-signature');
  if (!verifySignature(raw, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let evt: {
    meta?: { event_name?: string; custom_data?: { user_id?: string } };
    data?: {
      id?: string | number;
      attributes?: {
        user_email?: string;
        status?: string;
        first_order_item?: { variant_id?: number | string };
        variant_id?: number | string;
        renews_at?: string;
      };
    };
  };
  try {
    evt = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventName = evt.meta?.event_name ?? '';
  const attrs = evt.data?.attributes ?? {};

  // Resolve the user: custom_data.user_id (set at checkout) → email fallback.
  let userId = evt.meta?.custom_data?.user_id ?? null;
  if (!userId && attrs.user_email) {
    const u = await prisma.user.findUnique({ where: { email: attrs.user_email.toLowerCase() } });
    userId = u?.id ?? null;
  }
  if (!userId) {
    // Acknowledge so Lemon doesn't retry forever, but record nothing.
    return NextResponse.json({ ok: true, note: 'no matching user' });
  }

  const variantId = String(
    attrs.variant_id ?? attrs.first_order_item?.variant_id ?? '',
  );
  const renewsAt = attrs.renews_at ? new Date(attrs.renews_at) : null;

  try {
    switch (eventName) {
      case 'subscription_created':
      case 'subscription_updated':
      case 'subscription_resumed': {
        const plan = planForVariant(variantId);
        if (plan && (attrs.status === 'active' || attrs.status === 'on_trial' || !attrs.status)) {
          await activateSubscription({ userId, plan, currentPeriodEnd: renewsAt });
        }
        break;
      }
      case 'subscription_payment_success': {
        const plan = planForVariant(variantId);
        if (plan) await activateSubscription({ userId, plan, currentPeriodEnd: renewsAt });
        break;
      }
      case 'subscription_payment_failed':
        await markPastDue(userId);
        break;
      case 'subscription_cancelled':
      case 'subscription_expired':
        await cancelSubscription(userId);
        break;
      case 'order_created': {
        // One-off credit pack purchase. Idempotent via the order id so webhook
        // replays don't double-credit.
        const credits = PACK_CREDITS[variantId];
        const orderRef = evt.data?.id != null ? String(evt.data.id) : undefined;
        if (credits) await fulfillCreditPack(userId, credits, orderRef);
        break;
      }
      default:
        // Unhandled event — acknowledge.
        break;
    }
  } catch (err) {
    console.error('[billing webhook] processing error', err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
