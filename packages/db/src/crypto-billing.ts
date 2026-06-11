// @repo/db/crypto-billing — USDC-on-Solana credit-pack payments.
// See docs/CRYPTO_BILLING.md. DIY Solana Pay: we create a unique `reference`
// pubkey per payment, hand the user a Solana Pay URL, then verify the transfer
// ON-CHAIN before crediting (never trust the client).
//
// SECURITY: crediting only happens when ALL of these hold — recipient ==
// treasury, mint == USDC_MINT, amount >= expected, reference present, tx
// finalized, signature not already used. See verifyAndSettle().

import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import { encodeURL, findReference, validateTransfer, FindReferenceError } from '@solana/pay';
import BigNumber from 'bignumber.js';
import { prisma } from './index.js';
import { fulfillCreditPack } from './billing.js';

// ── Config (env) ─────────────────────────────────────────────────────────────

const NETWORK = process.env['SOLANA_NETWORK'] ?? 'devnet';
const RPC_URL =
  process.env['SOLANA_RPC_URL'] ??
  (NETWORK === 'mainnet-beta' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com');
const TREASURY = process.env['SOLANA_TREASURY_ADDRESS'] ?? '';
const USDC_MINT = process.env['USDC_MINT'] ?? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const PAYMENT_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** Server-side pack catalog — the ONLY source of truth for credits + price. */
export const CRYPTO_PACKS: Record<string, { credits: number; usdc: string; label: string }> = {
  small: { credits: 1000, usdc: '5', label: '1,000 credits' },
  med: { credits: 5000, usdc: '20', label: '5,000 credits' },
  large: { credits: 15000, usdc: '50', label: '15,000 credits' },
};

export function isCryptoBillingConfigured(): boolean {
  return TREASURY.length > 0;
}

function connection(): Connection {
  return new Connection(RPC_URL, 'finalized');
}

export interface CreatePaymentResult {
  reference: string;
  url: string;
  credits: number;
  amount: string;
  network: string;
}

/**
 * Create a pending crypto payment for a pack + return the Solana Pay URL.
 * Throws if billing isn't configured or the pack id is unknown.
 */
export async function createCryptoPayment(userId: string, packId: string): Promise<CreatePaymentResult> {
  if (!isCryptoBillingConfigured()) throw new Error('Crypto billing is not configured');
  const pack = CRYPTO_PACKS[packId];
  if (!pack) throw new Error('Unknown pack');

  const reference = Keypair.generate().publicKey; // unique per payment
  const recipient = new PublicKey(TREASURY);
  const splToken = new PublicKey(USDC_MINT);
  const amount = new BigNumber(pack.usdc);

  const url = encodeURL({
    recipient,
    amount,
    splToken,
    reference,
    label: 'OpenOffice',
    message: `${pack.label} top-up`,
  }).toString();

  await prisma.cryptoPayment.create({
    data: {
      userId,
      reference: reference.toBase58(),
      credits: pack.credits,
      expectedAmount: pack.usdc,
      status: 'pending',
      network: NETWORK,
    },
  });

  return { reference: reference.toBase58(), url, credits: pack.credits, amount: pack.usdc, network: NETWORK };
}

export interface PaymentStatus {
  status: 'pending' | 'confirmed' | 'expired' | 'failed';
  credits: number;
  txSignature?: string;
}

/**
 * Check a pending payment: look for the on-chain transfer, validate it, and on
 * success credit the user (idempotent via tx signature). Tenant-scoped.
 * Returns the current status. Safe to poll repeatedly.
 */
export async function verifyAndSettle(userId: string, reference: string): Promise<PaymentStatus | null> {
  const payment = await prisma.cryptoPayment.findFirst({ where: { reference, userId } });
  if (!payment) return null;

  // Terminal states: return as-is.
  if (payment.status === 'confirmed') {
    return { status: 'confirmed', credits: payment.credits, txSignature: payment.txSignature ?? undefined };
  }
  if (payment.status === 'failed') return { status: 'failed', credits: payment.credits };

  // Expire old pending payments.
  if (Date.now() - payment.createdAt.getTime() > PAYMENT_TTL_MS) {
    await prisma.cryptoPayment.update({ where: { id: payment.id }, data: { status: 'expired' } });
    return { status: 'expired', credits: payment.credits };
  }

  const conn = connection();
  const refKey = new PublicKey(reference);

  // 1. Find the transfer tx that carries our reference.
  let signature: string;
  try {
    const found = await findReference(conn, refKey, { finality: 'finalized' });
    signature = found.signature;
  } catch (err) {
    if (err instanceof FindReferenceError) {
      return { status: 'pending', credits: payment.credits }; // not paid yet
    }
    throw err;
  }

  // 2. Validate the transfer matches recipient + mint + amount + reference.
  try {
    await validateTransfer(
      conn,
      signature,
      {
        recipient: new PublicKey(TREASURY),
        amount: new BigNumber(payment.expectedAmount),
        splToken: new PublicKey(USDC_MINT),
        reference: refKey,
      },
      { commitment: 'finalized' },
    );
  } catch {
    // Found a tx with our reference but it doesn't match the expected transfer.
    await prisma.cryptoPayment.update({ where: { id: payment.id }, data: { status: 'failed' } });
    return { status: 'failed', credits: payment.credits };
  }

  // 3. Credit the user — idempotent via signature as orderRef + unique column.
  await fulfillCreditPack(userId, payment.credits, signature);
  await prisma.cryptoPayment.update({
    where: { id: payment.id },
    data: { status: 'confirmed', txSignature: signature, confirmedAt: new Date() },
  });
  return { status: 'confirmed', credits: payment.credits, txSignature: signature };
}
