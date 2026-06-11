// Next.js middleware — protect authenticated routes.
// Runs on the Edge runtime, so it must NOT import anything Node-only
// (Prisma, pg, bcrypt). It uses the edge-safe `auth.config.ts` (no
// providers, no DB) via a standalone NextAuth instance.
//
// Sign-in itself still happens through the Node route handler at
// /api/auth/[...nextauth] (which uses the full auth.ts with Credentials).
// What the middleware does is read the session JWT cookie (also produced
// by auth.ts) to decide whether to redirect unauthenticated requests away
// from /dashboard/*.

import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

const { auth } = NextAuth(authConfig);

const authMiddleware: any = auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname, search } = req.nextUrl;

  // Only guard authenticated routes. Adjust this matcher below if the
  // protected set grows.
  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/templates') ||
    pathname.startsWith('/offices') ||
    pathname.startsWith('/agents') ||
    pathname.startsWith('/settings');

  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', `${pathname}${search}`);
    return Response.redirect(loginUrl);
  }
});

export default authMiddleware;

// Skip middleware for static assets, Next internals, and auth API routes
// (the auth route handler must be reachable for signin/signout to work).
export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};

