// Edge-safe auth config — no Node-only deps (no Prisma, no bcrypt).
// Used by middleware (which runs on the Edge runtime) and as the base
// configuration for the full auth.ts in the Node runtime.
//
// `auth.config.ts` exports `authConfig` (no provider.authorize() function)
// and `auth` (the middleware-ready wrapper). For the full Credentials
// provider with DB access, see `./auth.ts` which spreads this config and
// adds the Node-only `authorize` callback.

import type { NextAuthConfig } from 'next-auth';

// AUTH_SECRET is the only required env var for Auth.js. Next.js should
// auto-inject process.env.AUTH_SECRET into the config, but we read it
// explicitly here to make the contract clear and avoid a runtime
// "MissingSecret" error if the env var is unset at module-eval time.
const authSecret = process.env['AUTH_SECRET'];
if (!authSecret) {
  // We don't throw at module load — that would break the build. Instead we
  // log a single warning the first time the config is evaluated.
  // eslint-disable-next-line no-console
  console.warn('[auth] AUTH_SECRET is not set. Sign-in and session lookup will fail at runtime.');
}

export const authConfig: NextAuthConfig = {
  secret: authSecret,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  // Providers are added in auth.ts (Node runtime). The Edge config has none
  // because the only provider in this app — Credentials with bcrypt — needs
  // the DB. Sign-in from the browser still works because signin posts to
  // /api/auth/[...nextauth] which is a Node route handler using auth.ts.
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email ?? undefined;
        token.name = user.name ?? undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
        session.user.email = token.email ?? session.user.email;
        session.user.name = token.name ?? session.user.name;
      }
      return session;
    },
  },
};
