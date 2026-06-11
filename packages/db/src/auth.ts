// @repo/db — Auth helpers.
// User lookup + creation primitives used by the web app's signup/login flows.
// Password hashing lives here so the algorithm + cost factor stay consistent
// across signup and login. Lives in @repo/db (not @repo/web) so the
// orchestrator daemon can also authenticate against the same user table later.

import bcrypt from 'bcryptjs';
import { prisma } from './index.js';

const BCRYPT_COST = 12;

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
}

/**
 * Hash a plaintext password with bcrypt.
 * Exported so the signup API route can hash in one place.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * Verify a plaintext password against a stored bcrypt hash.
 * Returns false on any error (invalid hash, etc.) — never throws.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/**
 * Look up a user by email (case-insensitive — Postgres citext is overkill for MVP).
 * Returns null when not found. Never throws on missing user.
 */
export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
}

/**
 * Look up a user by id. Returns null when not found.
 */
export async function getUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

/** Free-plan monthly credit grant for brand-new users (see MONETIZATION.md). */
const FREE_SIGNUP_CREDITS = 500;

/**
 * Create a new user. Throws on duplicate email (Prisma P2002).
 * Email is normalized to lowercase + trimmed before storage.
 *
 * Provisions the user's starting monetization state in the same transaction:
 * a FREE Subscription + a CreditBalance with 500 granted credits (~20 tasks).
 */
export async function createUser(input: CreateUserInput) {
  const passwordHash = await hashPassword(input.password);
  const grantResetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email.toLowerCase().trim(),
        name: input.name.trim(),
        passwordHash,
      },
    });
    await tx.subscription.create({
      data: { userId: user.id, plan: 'FREE', status: 'active' },
    });
    await tx.creditBalance.create({
      data: { userId: user.id, granted: FREE_SIGNUP_CREDITS, purchased: 0, grantResetAt },
    });
    await tx.creditLedger.create({
      data: { userId: user.id, delta: FREE_SIGNUP_CREDITS, reason: 'monthly_grant' },
    });
    return user;
  });
}
