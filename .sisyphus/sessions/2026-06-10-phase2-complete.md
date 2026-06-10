# Session Handoff — 2026-06-10

## Posisi Sekarang

**Phase 0 ✓** — Monorepo scaffold (pnpm + Turborepo)
**Phase 1 ✓** — Shared Contracts (Zod schemas, 34 tests)
**Phase 2 ✓** — Database Layer (PostgreSQL, 11 models, seeded)

**Phase 3 NEXT** — Auth (NextAuth v5 + sign-up/login API routes + middleware)

## Environment

- **OS**: Windows 11
- **Project root**: `D:\vibecoding\openoffice`
- **Database**: PostgreSQL 17 Alpine via Docker Compose
- **DATABASE_URL**: `postgresql://openoffice:openoffice@localhost:5432/openoffice`

## Startup Commands (reset after PC restart)

```bash
cd D:\vibecoding\openoffice

# 1. Start PostgreSQL (pastikan Docker Desktop nyala)
docker compose up -d

# 2. Verify database is running
docker ps

# 3. Run full verification
pnpm install
pnpm build && pnpm typecheck && pnpm test && pnpm lint

# 4. Start dev mode
pnpm dev
```

Web runs at `http://localhost:3000`, orchestrator daemon runs in background.

## Project Structure (what matters now)

```
apps/web/              → Next.js 15 App Router (scaffold only, home page saja)
apps/orchestrator/     → Node+TS daemon (stub with heartbeat)
packages/shared/       → Zod schemas (events + commands) + 31 tests ✅
packages/db/           → Prisma client + schema + seed script ✅
packages/agents/       → Empty stub (Phase 6 fills it)
prisma/schema.prisma   → 11 models, PostgreSQL provider
prisma.config.ts       → Database URL config
docker-compose.yml     → PostgreSQL container
```

## Database — What's Seeded

**6 platform agents** (fixed IDs):
- `agent-planner-001` — Planner, temp 0.3
- `agent-coder-001` — Coder, temp 0.2
- `agent-reviewer-001` — Reviewer, temp 0.1
- `agent-researcher-001` — Researcher, temp 0.5
- `agent-writer-001` — Writer, temp 0.7
- `agent-editor-001` — Editor, temp 0.3

Each has knowledge docs, tools, and modelConfig.

**3 templates**:
| ID | Name | Steps |
|---|---|---|
| `template-dev-001` | Dev Team | Planner → Coder → Reviewer |
| `template-research-001` | Research Team | Planner → Researcher → Reviewer |
| `template-content-001` | Content Team | Planner → Researcher → Writer → Editor |

## CRITICAL LEARNINGS (baca ini dulu!)

### 1. `tsc incremental:true` = FOOTGUN
**Problem**: `incremental: true` di tsconfig.base.json bikin tsc baca `.tsbuildinfo` stale, pikir "udah compiled", dan diam-diam NGGAK EMIT apa-apa. Cold start dengan `dist/` kosong → build gagal karena package lain gak nemu output.

**Fix**: `incremental: false` di tsconfig.base.json DAN di semua child tsconfig. Jangan dihidupkan lagi tanpa ngetes cold-start build.

### 2. Turbo web#typecheck dependsOn web#build
Next.js typecheck via `tsc --noEmit` butuh `.next/types/*` yang dihasilkan oleh `next build`. Turbo `^build` cuma nunggu upstream. Harus ada override di `turbo.json`:
```json
"@repo/web#typecheck": {
  "dependsOn": ["^build", "@repo/web#build"]
}
```

### 3. Prisma 7 breaking changes
- **No `url` di datasource block** — pindah ke `prisma.config.ts`
- **Generator**: `provider = "prisma-client"` (bukan `"prisma-client-js"`)
- **PrismaClient butuh driver adapter**: `PrismaPg` buat PostgreSQL, `PrismaBetterSqlite3` buat SQLite
- **Generated client**: entry point `client.ts` (bukan `index.js`). Import dari `./generated/client.js`
- **Generated output harus di dalam `src/`** (rootDir constraint)

### 4. `prisma generate` on Windows
**Problem**: `npx prisma generate` crash silent dengan error "get-dmmf wasm" saat schema punya >8 model atau ada kompleksitas tertentu.

**Fix**: Tambahin `--schema=prisma/schema.prisma`:
```bash
npx prisma generate --schema=prisma/schema.prisma
```

**Alternative**: `prisma db push` juga works buat sync database tapi belum tentu regenerate client. Kalau generated client stale, delete folder `packages/db/src/generated/` terus `prisma generate --schema=prisma/schema.prisma`.

### 5. ESLint 9 flat config — no-unused-vars
ESLint 9 ga auto-treat `_` prefix sebagai unused. Harus explicit:
```js
'@typescript-eslint/no-unused-vars': ['error', {
  argsIgnorePattern: '^_',
  varsIgnorePattern: '^_',
  destructuredArrayIgnorePattern: '^_',
  caughtErrorsIgnorePattern: '^_',
  ignoreRestSiblings: true,
}]
```

### 6. vitest 2.x — passWithNoTests
Package kosong exit code 1 tanpa flag ini. Tambahin `--passWithNoTests` di packages yang belum punya test.

## Build Rules (User-defined)

1. **Kerjakan di dalam session utama**, JANGAN pakai sub-agent tanpa izin user
2. Kalau TERPAKSA butuh sub-agent, TANYA DULU ke user
3. Semua build commands: `pnpm build && pnpm typecheck && pnpm test && pnpm lint`
4. Bahasa komunikasi: Indonesia (user prefer)

## Phase 3 — What to Build

Per `plan.md`:

1. **Auth.js v5 setup**: Install NextAuth, bikin `auth.ts` di root web, configure providers
2. **Database adapter**: NextAuth Prisma adapter (connect ke packages/db/prisma)
3. **Sign-up page**: `app/(auth)/signup/page.tsx` — email + name + password
4. **Login page**: `app/(auth)/login/page.tsx` — email + password
5. **API routes**: `app/api/auth/[...nextauth]/route.ts`
6. **Middleware**: `middleware.ts` untuk protect routes
7. **Secrets**: `AUTH_SECRET` di `.env`

## Non-Negotiable Rules (from CLAUDE.md)
1. No secrets client-side
2. All cross-process payloads Zod-validated
3. LLM behind provider interface, FakeProvider in CI
4. File tools through path guard
5. Snapshots over references (OfficeAgent)
6. Multi-tenant by default
7. Pixel office is core feature

## Verification Gate (jalankan sebelum claim done)

```bash
pnpm build && pnpm typecheck && pnpm test && pnpm lint
```

Harus 100% green sebelum lanjut phase berikutnya.

---

*Generated: 2026-06-10, end of Phase 2.*
*Next: Phase 3 — Auth (NextAuth v5)*
