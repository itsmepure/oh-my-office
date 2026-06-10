// NextAuth v5 configuration for the web app.
// Pure JWT session strategy + Credentials provider (email + password).
// No Prisma adapter — Credentials provider is JWT-only by design and the
// orchestrator daemon authenticates against the same User table directly.
//
// `server-only` is a marker that throws if this module is ever imported by a
// client component. This prevents webpack from trying to bundle Prisma/pg/
// bcryptjs and the `node:path` schemes they pull in for the browser bundle.
//
// This file lives in the Node runtime (API routes + server components). The
// Edge-safe config (no DB) lives in `./auth.config.ts` and is what
// `src/middleware.ts` imports.
//
// Auth.js v5 docs: https://authjs.dev/getting-started

import 'server-only';
import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { getUserByEmail, verifyPassword } from '@repo/db/auth';
import { authConfig } from '@/auth.config';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
    } & DefaultSession['user'];
  }
}

const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

const nextAuth = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await getUserByEmail(parsed.data.email);
        if (!user) return null;

        const ok = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
});

export const handlers: typeof nextAuth.handlers = nextAuth.handlers;
export const signIn: typeof nextAuth.signIn = nextAuth.signIn;
export const signOut: typeof nextAuth.signOut = nextAuth.signOut;
export const auth: typeof nextAuth.auth = nextAuth.auth;
