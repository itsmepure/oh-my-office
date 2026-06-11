// @repo/db/keys — BYOK (bring-your-own-key) storage + resolution (Phase M2).
//
// Users can attach their own LLM API key so their offices run on THEIR key,
// which means platform-agent steps cost ZERO credits (see MONETIZATION.md).
//
// Keys are encrypted at rest with AES-256-GCM. The plaintext key is NEVER
// returned to callers after creation — list/read return masked metadata only
// (provider, model, last4). Decryption happens server-side in the orchestrator
// via `resolveOfficeKeyPlaintext`, which is the ONLY function that returns the
// raw key, and is only called inside the daemon (never the web/browser path).

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { prisma } from './index.js';

// 32-byte key from env (hex or base64 or raw 32 chars). Required for BYOK.
function encryptionKey(): Buffer {
  const raw = process.env['KEY_ENCRYPTION_SECRET'] ?? '';
  if (!raw) throw new Error('KEY_ENCRYPTION_SECRET is not set (required for BYOK encryption)');
  // Accept hex (64 chars), base64, or a raw string; normalize to 32 bytes.
  let buf: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) buf = Buffer.from(raw, 'hex');
  else {
    const b64 = Buffer.from(raw, 'base64');
    buf = b64.length === 32 ? b64 : Buffer.from(raw.padEnd(32, '0').slice(0, 32), 'utf-8');
  }
  if (buf.length !== 32) throw new Error('KEY_ENCRYPTION_SECRET must resolve to 32 bytes');
  return buf;
}

interface Encrypted {
  ciphertext: string;
  iv: string;
  authTag: string;
}

function encrypt(plaintext: string): Encrypted {
  const iv = randomBytes(12); // GCM standard nonce size
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

function decrypt(e: Encrypted): string {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(e.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(e.authTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(e.ciphertext, 'base64')), decipher.final()]).toString('utf-8');
}

export interface LlmKeyView {
  id: string;
  officeId: string | null; // null = account-default
  provider: string;
  baseUrl: string | null;
  model: string | null;
  last4: string;
  createdAt: string;
}

export interface CreateLlmKeyInput {
  userId: string;
  officeId?: string | null;
  provider?: string;
  baseUrl?: string | null;
  model?: string | null;
  apiKey: string; // plaintext — encrypted before storage, never persisted raw
}

function toView(row: {
  id: string;
  officeId: string | null;
  provider: string;
  baseUrl: string | null;
  model: string | null;
  last4: string;
  createdAt: Date;
}): LlmKeyView {
  return {
    id: row.id,
    officeId: row.officeId,
    provider: row.provider,
    baseUrl: row.baseUrl,
    model: row.model,
    last4: row.last4,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Create (or replace) a BYOK key for a user, optionally scoped to one office.
 * The @@unique([userId, officeId]) constraint means one key per scope; this
 * upserts so re-adding replaces. Returns the MASKED view (never plaintext).
 */
export async function createLlmKey(input: CreateLlmKeyInput): Promise<LlmKeyView> {
  const raw = input.apiKey.trim();
  if (raw.length < 8) throw new Error('API key looks too short');
  const enc = encrypt(raw);
  const last4 = raw.slice(-4);
  const officeId = input.officeId ?? null;

  const data = {
    userId: input.userId,
    officeId,
    provider: input.provider ?? 'deepseek',
    baseUrl: input.baseUrl ?? null,
    model: input.model ?? null,
    last4,
    ciphertext: enc.ciphertext,
    iv: enc.iv,
    authTag: enc.authTag,
  };

  // Prisma can't target a composite unique with a NULL member, so we manually
  // find-then-create/update instead of upsert.
  const existing = await prisma.llmKey.findFirst({
    where: { userId: input.userId, officeId },
  });
  const row = existing
    ? await prisma.llmKey.update({ where: { id: existing.id }, data })
    : await prisma.llmKey.create({ data });
  return toView(row);
}

/** List a user's keys (masked). Never returns plaintext/ciphertext. */
export async function listLlmKeys(userId: string): Promise<LlmKeyView[]> {
  const rows = await prisma.llmKey.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toView);
}

/** Delete a key the user owns. Returns true if a row was removed. */
export async function deleteLlmKey(userId: string, keyId: string): Promise<boolean> {
  const res = await prisma.llmKey.deleteMany({ where: { id: keyId, userId } });
  return res.count > 0;
}

export interface ResolvedKey {
  /** true = a BYOK key was found (office or account); platform-agent steps are
   * FREE. false = no BYOK; fall back to the platform key (bills credits). */
  isByok: boolean;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  provider?: string;
}

/**
 * Resolve the effective LLM key for an office, server-side only (orchestrator).
 * Precedence: office-scoped BYOK → account-default BYOK → platform (no key).
 * Returns the DECRYPTED key when BYOK is found. The orchestrator passes it to
 * the provider; it must never cross into the browser.
 */
export async function resolveOfficeKey(officeId: string, ownerId: string): Promise<ResolvedKey> {
  // Office-scoped key first, then account-default (officeId = null).
  const office = await prisma.llmKey.findFirst({
    where: { userId: ownerId, officeId },
  });
  const account = office
    ? null
    : await prisma.llmKey.findFirst({
        where: { userId: ownerId, officeId: null },
      });
  const row = office ?? account;
  if (!row) return { isByok: false };

  const apiKey = decrypt({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag });
  return {
    isByok: true,
    apiKey,
    baseUrl: row.baseUrl ?? undefined,
    model: row.model ?? undefined,
    provider: row.provider,
  };
}
