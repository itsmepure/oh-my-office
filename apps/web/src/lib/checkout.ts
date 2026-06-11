// Server-only checkout URL builder for Lemon Squeezy (Phase G5).
//
// Lemon Squeezy accepts checkout prefill + custom data via query params on a
// product's checkout URL:
//   ?checkout[email]=<email>&checkout[custom][user_id]=<id>
// The webhook reads meta.custom_data.user_id to match the user, closing the
// email-mismatch gap. Buttons render only when the relevant env is set.

import 'server-only';

export interface CheckoutLinks {
  pro: string | null;
  team: string | null;
  packSmall: string | null;
  packMed: string | null;
  packLarge: string | null;
  portal: string | null;
}

function withCustom(base: string | undefined, userId: string, email?: string | null): string | null {
  if (!base) return null;
  try {
    const url = new URL(base);
    url.searchParams.set('checkout[custom][user_id]', userId);
    if (email) url.searchParams.set('checkout[email]', email);
    return url.toString();
  } catch {
    return null;
  }
}

/** Build all checkout links for a user. Missing env → null (button hidden). */
export function buildCheckoutLinks(userId: string, email?: string | null): CheckoutLinks {
  return {
    pro: withCustom(process.env['LEMON_CHECKOUT_PRO'], userId, email),
    team: withCustom(process.env['LEMON_CHECKOUT_TEAM'], userId, email),
    packSmall: withCustom(process.env['LEMON_CHECKOUT_PACK_SMALL'], userId, email),
    packMed: withCustom(process.env['LEMON_CHECKOUT_PACK_MED'], userId, email),
    packLarge: withCustom(process.env['LEMON_CHECKOUT_PACK_LARGE'], userId, email),
    // Customer portal (manage/cancel). Static env URL; no per-user custom data.
    portal: process.env['LEMON_PORTAL_URL'] ?? null,
  };
}
