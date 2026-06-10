# Session Handoff — 2026-06-10 (Phase 3 Complete)

## Posisi Sekarang

| Phase | Status |
|---|---|
| Phase 0 — Monorepo scaffold (pnpm + Turborepo) | ✓ |
| Phase 1 — Shared Contracts (Zod, 34 tests) | ✓ |
| Phase 2 — Database Layer (PostgreSQL, 11 models, seeded) | ✓ |
| **Phase 3 — Auth (NextAuth v5 + signup/login + middleware)** | **✓** |

**Phase 4 NEXT** — Template catalog (browse 3 seeded templates, create office from template)

## What Was Built (Phase 3)

### 1. Auth helpers in `@repo/db`
- `packages/db/src/auth.ts` — `hashPassword`, `verifyPassword` (bcrypt, cost 12), `getUserByEmail`, `getUserById`, `createUser`
- Exposed via subpath: `@repo/db/auth` (added to `packages/db/package.json` exports + `main`/`module`/`types` for Bundler resolution)
- 4 unit tests (bcrypt round-trip, wrong password, malformed hash, salt uniqueness) ✅

### 2. NextAuth v5 config (`apps/web/src/`)
- `auth.config.ts` — edge-safe shared config (no DB, no Node built-ins). Used by middleware.
- `auth.ts` — full config with Credentials provider + DB access. Marked `import 'server-only'`. Spreads `authConfig`.
- `app/api/auth/[...nextauth]/route.ts` — catch-all GET/POST handlers
- `app/api/auth/signup/route.ts` — POST: Zod-validated, pre-checks email, handles Prisma P2002 race, returns 201/400/409/500
- `middleware.ts` — uses `auth.config.ts` only (Edge runtime safe). Protects `/dashboard/*`, redirects to `/login?callbackUrl=...`
- `app/(auth)/signup/page.tsx` — client form, calls `/api/auth/signup`, then `signIn('credentials')` for auto-login
- `app/(auth)/login/page.tsx` — client form, wrapped in `<Suspense>` (Next.js 15 useSearchParams requirement)
- `app/dashboard/page.tsx` — server component, shows user info + has `<form action={signOut}>` logout button

### 3. Tests
- `packages/db/src/auth.test.ts` — 4 tests
- `apps/web/src/app/api/auth/signup/route.test.ts` — 10 tests (validation, happy, conflict pre-check, P2002 race, 500 path, invalid JSON, schema sanity)
- `apps/web/vitest.config.ts` — workspace alias map (`@repo/db/auth` → source)

### 4. Environment
- `.env.example` updated with `AUTH_SECRET` placeholder
- `.env` has `AUTH_SECRET` + `AUTH_URL`
- `.env.local` (apps/web) also has both (Next.js prefers this over `.env`)

## Verification Gate — ALL GREEN

```
pnpm build      → 5/5 successful  (web, orchestrator, agents, db, shared)
pnpm typecheck  → 9/9 successful
pnpm test       → 8/8 files / 14 tests passing  (4 in db, 10 in web)
pnpm lint       → 8/8 successful
```

Build output:
```
Route (app)                   Size    First Load JS
┌ ○ /                         133 B   102 kB
├ ○ /_not-found               991 B   103 kB
├ ƒ /api/auth/[...nextauth]   133 B   102 kB
├ ƒ /api/auth/signup          133 B   102 kB
├ ƒ /dashboard                133 B   102 kB
├ ○ /login                    1.1 kB  105 kB
└ ○ /signup                   1.25 kB 105 kB
ƒ Middleware                  87.3 kB
```

## Manual Smoke Test (curl) — ALL PASS

| Step | Result |
|---|---|
| 1. `POST /api/auth/signup` with new email | 201 Created, user in DB |
| 2. `GET /api/auth/csrf` | 200, returns CSRF token |
| 3. `POST /api/auth/callback/credentials` | 302 → /dashboard, session cookie set |
| 4. `GET /api/auth/session` | 200, `{user: {id, name, email, ...}}` |
| 5. `GET /dashboard` (with cookie) | 200 (no redirect) |
| 6. `GET /dashboard` (no cookie) | 307 → /login (middleware enforces) |
| 7. `POST /api/auth/signout` | 302, session cleared |
| 8. `GET /dashboard` (post-signout) | 307 → /login |

## CRITICAL LEARNINGS (Phase 3)

### 1. Auth.js v5 split-config pattern (CRITICAL)
Middleware runs on **Edge runtime** which does NOT support Node built-ins (`node:path`, `pg`, Prisma's `node:` imports). Split into:
- `auth.config.ts` — edge-safe (no providers, no DB)
- `auth.ts` — full config, `import 'server-only'`, adds Credentials provider + DB
- `middleware.ts` imports `auth.config.ts` only
- API routes / server components import `auth.ts`

This is the standard Auth.js v5 pattern. Skipping it = unfixable `node:path` webpack errors.

### 2. `tsc` portability errors with NextAuth
When re-exporting NextAuth's wrapped handlers (`handlers`, `signIn`, `signOut`, `auth`), TypeScript can't infer portable types because they reference internal `@auth/core` paths. Fix: capture into local const, then re-export with `typeof nextAuth.handlers` etc.

### 3. Prisma 7 + Next.js 15 build configuration
- `transpilePackages: ['@repo/db', 'next-auth']` — Next transpiles them (otherwise ESM `import './auth.js'` extensions + `next-auth/lib/env.js`'s `import 'next/server'` break)
- `serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg', 'bcryptjs', '@auth/core']` — keep these Node-only
- `transpilePackages` and `serverExternalPackages` MUTUALLY EXCLUDE the same package. Pick one.

### 4. Webpack `vitest.config.ts` resolution
Next.js webpack scans all `.ts` in app root by default. If `vitest.config.ts` uses `node:path`, it fails to bundle. Fix:
- `tsconfig.json` `include: ["src/**/*.ts", "src/**/*.tsx"]` (NOT `**/*.ts`)
- `next.config.ts` webpack `module.rules.push({ test: /vitest\.config\.ts$/, loader: 'ignore-loader' })`

### 5. Next.js 15 useSearchParams needs Suspense
`useSearchParams()` in client components throws "should be wrapped in a suspense boundary" during static prerendering. Wrap the form in `<Suspense fallback={...}>`.

### 6. `server-only` package
Adding `import 'server-only'` at the top of `auth.ts` gives a build-time error if a client component accidentally imports it. Works alongside the split-config pattern.

### 7. AUTH_SECRET env loading
Next.js dev prefers `.env.local` over `.env`. If AUTH_SECRET only in `.env`, you get "MissingSecret" at runtime. Solution: keep secrets in BOTH `.env` (for production) and `apps/web/.env.local` (for dev).

### 8. .env file output is sanitized
When Hermes (or any tooling) reads `.env`, secrets show as `***` for safety. The actual file content is correct. Use `grep` to verify, don't trust `cat`.

## Files Created / Modified

### Created
- `packages/db/src/auth.ts` (+ `auth.test.ts`)
- `apps/web/src/auth.config.ts`
- `apps/web/src/auth.ts`
- `apps/web/src/middleware.ts`
- `apps/web/src/app/api/auth/[...nextauth]/route.ts`
- `apps/web/src/app/api/auth/signup/route.ts` (+ `route.test.ts`)
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/(auth)/signup/page.tsx`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/vitest.config.ts`
- `.env.example` (updated)
- `.env` (updated with AUTH_SECRET)
- `apps/web/.env.local` (dev-only)

### Modified
- `apps/web/package.json` (deps: next-auth, @auth/prisma-adapter, bcryptjs, zod, @repo/db, server-only, ignore-loader; types: bcryptjs)
- `apps/web/next.config.ts` (transpilePackages, serverExternalPackages, webpack rules)
- `apps/web/tsconfig.json` (incremental:false, include:src/**, exclude:vitest.config.ts)
- `packages/db/package.json` (added `./auth` subpath export, main/module/types)

## Startup Commands (unchanged from Phase 2)

```bash
cd D:\vibecoding\openoffice
docker compose up -d
pnpm install
pnpm build && pnpm typecheck && pnpm test && pnpm lint
pnpm dev
```

Web at `http://localhost:3000`. Smoke-tested signup → login → dashboard → logout flow end-to-end via curl.

## Non-Negotiable Rules (all upheld)

1. ✓ No secrets client-side (AUTH_SECRET only in .env / .env.local, server-side config)
2. ✓ All cross-process payloads Zod-validated (signup API uses z.object + safeParse)
3. ✓ LLM behind provider interface (still N/A in Phase 3, ready for Phase 6)
4. ✓ File tools through path guard (still N/A in Phase 3, ready for Phase 6)
5. ✓ Snapshots over references (OfficeAgent — still N/A, ready for Phase 5)
6. ✓ Multi-tenant by default (every query scopes by user; OfficeMembership in Phase 5)
7. ✓ Pixel office is core feature (still N/A, ready for Phase 7)

---

*Generated: 2026-06-10, end of Phase 3.*
*Next: Phase 4 — Template catalog (browse 3 seeded templates).*
