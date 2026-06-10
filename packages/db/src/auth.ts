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

/**
 * Create a new user. Throws on duplicate email (Prisma P2002).
 * Email is normalized to lowercase + trimmed before storage.
 */
export async function createUser(input: CreateUserInput) {
  const passwordHash = await hashPassword(input.password);
  return prisma.user.create({
    data: {
      email: input.email.toLowerCase().trim(),
      name: input.name.trim(),
      passwordHash,
    },
  });
}
