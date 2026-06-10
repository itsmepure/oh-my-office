# Session Handoff — 2026-06-10 (Phase 4 Complete)

## Posisi Sekarang

| Phase | Status |
|---|---|
| Phase 0 — Monorepo scaffold (pnpm + Turborepo) | ✓ |
| Phase 1 — Shared Contracts (Zod, 31 tests) | ✓ |
| Phase 2 — Database Layer (PostgreSQL, 11 models, seeded) | ✓ |
| Phase 3 — Auth (NextAuth v5 + signup/login + middleware) | ✓ |
| **Phase 4 — Template Catalog & Office Creation (snapshot copy)** | **✓** |

**Phase 5 NEXT** — Agent Builder & Office Composition (user-owned agents, custom knowledge docs, reorder/remove from office).

## What Was Built (Phase 4)

### 1. Shared contracts (`packages/shared/src/views.ts`)
- `agentViewSchema` / `AgentView` — what the client sees of an agent (id, name, role, systemPrompt, tools, modelConfig)
- `templateStepSchema` — a single step in a template's workflow
- `templateViewSchema` / `TemplateView` — full template for the catalog (id, name, description, category, workflow[], agents[])
- `officeAgentSnapshotSchema` — an OfficeAgent's frozen agent config snapshot
- `officeViewSchema` / `OfficeView` — full office for dashboard + detail
- `createOfficeRequestSchema` / `CreateOfficeRequest` — input validator for POST /api/offices
- All wired into `@repo/shared` index re-exports

### 2. DB helpers (`packages/db/src/offices.ts`)
- `listTemplates()` — all 3 seeded templates with their agents
- `getTemplateById(id)` — single template view or null
- `createOfficeFromTemplate({ ownerId, templateId, name })` — **the critical one**:
  - Snapshots each `TemplateAgent.agent` config into `OfficeAgent.agentSnapshot` (JSON.stringify)
  - Creates Office + OfficeMembership(owner) in a Prisma transaction
  - Two-step workspace path: create with `'__pending__'`, then update to `workspacesRoot/officeId`
  - Provisions on-disk dir at `D:/vibecoding/openoffice/workspaces/<officeId>/` (best-effort)
  - Throws `OfficeNotFoundError` (→ 404) or `InvalidTemplateError` (→ 422)
- `listUserOffices(userId)` — scoped by `OfficeMembership` (multi-tenant safe)
- `getOfficeById(officeId, userId)` — same scoping, returns null on miss
- Internal: `toAgentView`, `toTemplateView`, `toOfficeView` — typed-view converters
- Reads Prisma `JsonValue` from `generated/internal/prismaNamespace.js` (Prisma 7 export location)
- Workspace root: `D:/vibecoding/openoffice/workspaces` (overridable via `WORKSPACES_ROOT` env)

### 3. API route (`apps/web/src/app/api/offices/route.ts`)
- `POST /api/offices` — auth-protected, Zod-validated
- Returns 201 (OfficeView), 400 (validation), 401 (no session), 404 (template not found), 422 (no agents), 500

### 4. Pages (all server components, all auth-protected via middleware)
- `/templates` (`apps/web/src/app/templates/page.tsx`) — catalog with 3 cards
  - Shows template name, category badge, description
  - Workflow steps visualized as numbered pills with arrows
  - Agent grid (name + role)
  - "Create office" button per card → `/templates/[id]/new`
- `/templates/[id]/new` (page.tsx + form.tsx) — create-office form
  - Pre-fills name with `My <Template Name>`
  - Client form: POST to /api/offices, redirect to /offices/[id] on success
- `/dashboard` (updated) — now lists the user's offices as cards
  - "Browse templates" link to /templates
  - Empty state with hint to browse the catalog
- `/offices/[id]` (new) — office detail page
  - Status badge, office id, workspace path
  - Workflow with each agent's name, role, system prompt, tools
  - "Run task" placeholder button (Phase 6)

### 5. Middleware update (`apps/web/src/middleware.ts`)
- Protected paths: `/dashboard/*`, `/templates/*`, `/offices/*`
- Redirects to `/login?callbackUrl=...` when no session

### 6. Tests
- `packages/db/src/offices.test.ts` — **9 tests** against real Postgres:
  - `listTemplates`: returns seeded + new, agents in step order
  - `createOfficeFromTemplate`: basic create, OfficeMembership(owner), missing template
  - **CRITICAL**: editing source agent prompt AFTER office creation → office's snapshot UNCHANGED
  - **CRITICAL**: editing template composition (add agent) AFTER office creation → office's snapshot UNCHANGED
  - `listUserOffices`: scoping (other user's office not visible)
  - `getOfficeById`: scoping (returns null for non-member)
- `apps/web/src/app/api/offices/route.test.ts` — **9 tests** for the API route:
  - 401 no session
  - 400 invalid JSON, empty name, too-long name, missing templateId
  - 201 happy path (verifies ownerId from session, name trimmed by Zod)
  - 404 / 422 / 500 error mapping

## Verification Gate — ALL GREEN

```
pnpm build      → 5/5 successful
pnpm typecheck  → 9/9 successful
pnpm test       → 8/8 files / 66 tests passing  (31 shared + 13 db + 3 orchestrator + 19 web)
pnpm lint       → 8/8 successful
```

Build output (relevant routes):
```
┌ ƒ /api/offices                          133 B   102 kB
├ ƒ /dashboard                            133 B   102 kB
├ ƒ /offices/[id]                         167 B   106 kB
├ ƒ /templates                            167 B   106 kB
└ ƒ /templates/[id]/new                 1.01 kB   106 kB
ƒ Middleware                             87.4 kB
```

## Manual Smoke Test (curl + real Postgres) — ALL PASS

| Step | Result |
|---|---|
| 1. POST /api/auth/signup | 201, user created |
| 2. POST /api/auth/callback/credentials | 302, session cookie set |
| 3. GET /api/auth/session | 200, `{user: {id, name, email}}` |
| 4. POST /api/offices (templateId=template-dev-001, name=`  My Dev Office  `) | 201, name trimmed to `My Dev Office`, 3 agents snapshotted, workspacePath=`D:\vibecoding\openoffice\workspaces\<id>` |
| 5. Workspace dir created on disk | ✓ dir exists |
| 6. GET /dashboard (auth) | 200, shows `My Dev Office` card |
| 7. GET /templates (auth) | 200, shows Dev/Research/Content Team |
| 8. GET /offices/[id] (auth) | 200, shows office + 3 agents with original prompts |
| 9. GET /offices/[id] (no cookie) | 302 → /login?callbackUrl=... |
| 10. **MUTATE** source agent (planner systemPrompt → "MUTATED — ...") | succeeds |
| 11. GET /offices/[id] again | 200, agent prompt STILL original "You are a strategic Planner", `grep -c MUTATED` = **0** |
| 12. Restore source agent | prompt back to original |

## CRITICAL LEARNINGS (Phase 4)

### 1. Prisma 7 + `JsonValue` import path
Prisma 7 does NOT export `JsonValue` from `@prisma/client/runtime/library` (that was Prisma 6). The export lives at `<your-generated-client-path>/internal/prismaNamespace.ts`. Use:
```ts
import * as PrismaTypes from './generated/internal/prismaNamespace.js';
type JsonValue = PrismaTypes.JsonValue;
```

### 2. Prisma `Json` columns vs `string`
Prisma's `Json` type is NOT `string` — it's a `JsonValue` union. Code that reads/writes these columns needs to be typed against `JsonValue`, then `JSON.stringify`/`JSON.parse` at the boundary. Forgetting this = TS2345 mismatch on every Prisma query result.

### 3. Two-step transaction for path-from-id
Prisma's `cuid()`/`uuid()` defaults generate the id in-row; you can't reference the new id in the same `create` call. Pattern:
```ts
const created = await tx.office.create({ data: { ..., workspacePath: '__pending__' } });
const wp = pathFor(created.id);
return tx.office.update({ where: { id: created.id }, data: { workspacePath: wp } });
```

### 4. Workspace path on a Windows host
The path uses `D:/vibecoding/openoffice/workspaces` with forward slashes — `path.resolve` handles the conversion. The mkdir is best-effort (logged, not fatal): a mkdir failure means the orchestrator (Phase 6) will retry on first task. This avoids a transaction-abort on a disk error.

### 5. Tenancy in `getOfficeById`
Single arg isn't enough. Always pass `userId` and use `findFirst({ where: { id, memberships: { some: { userId } } } })`. Returns null on miss = 404 from the page. This is the **only** safe way to fetch a single office.

### 6. Test cleanup must respect FK order
Postgres `FOREIGN KEY` constraints in this schema are strict (no `onDelete: Cascade` configured for all). Tests that create throwaway users + their offices must delete **offices first**, then the user. Same for templates that have offices pointing at them. Failing this = `P2003` / `P2010` errors during teardown.

### 7. Zod `.trim()` runs before downstream
`createOfficeRequestSchema` applies `.trim()` to the name, so the API helper receives the cleaned value. Tests must assert on the trimmed string, not the raw input. Lesson: test data should match post-validation shape.

### 8. Top-level await in test files
Vitest supports TLA in test files only when the tsconfig `module` is set to `es2022`+ (and `target` ≥ es2017). The web tsconfig has `module: ESNext` which TSC sometimes complains about in lint. Workaround: stash imports in a `const x = await import(...)` immediately after mocks — keeps the await inside an `await` chain that TSC is happy with. (The runtime works fine because vitest's loader is async.)

### 9. Port 3000 zombie processes on Windows
After `pnpm dev` SIGTERM, the port can stay held by a zombie process for a few seconds. If the next `pnpm dev` fails with `EADDRINUSE`, kill the holding PID with PowerShell:
```bash
powershell -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"
powershell -Command "Stop-Process -Id <PID> -Force"
```

### 10. `node:fs/promises` and `node:path` in server-only code
`mkdir` from `node:fs/promises` works in Next.js server components and route handlers. Bundler resolves it cleanly. The `node:` prefix is required for ESM.

## Files Created / Modified

### Created
- `packages/shared/src/views.ts` (Zod view schemas)
- `packages/db/src/offices.ts` (DB helpers)
- `packages/db/src/offices.test.ts` (9 tests, real DB)
- `apps/web/src/app/api/offices/route.ts` (POST handler)
- `apps/web/src/app/api/offices/route.test.ts` (9 tests, mocked DB)
- `apps/web/src/app/templates/page.tsx` (catalog)
- `apps/web/src/app/templates/[id]/new/page.tsx` (create form page)
- `apps/web/src/app/templates/[id]/new/form.tsx` (create form client)
- `apps/web/src/app/offices/[id]/page.tsx` (office detail)

### Modified
- `packages/shared/src/index.ts` (re-export views)
- `packages/db/package.json` (added `@repo/shared` dep + `./offices` subpath export)
- `apps/web/src/middleware.ts` (protect `/templates/*` and `/offices/*`)
- `apps/web/src/app/dashboard/page.tsx` (list offices, "Browse templates" link)

### On-disk
- `D:\vibecoding\openoffice\workspaces\` — 30+ per-office subdirs from prior test runs (one per office created during smoke + dev iterations). Safe to leave; each office owns its own dir. Cleanup is not part of MVP.

## Startup Commands (unchanged from Phase 3)

```bash
cd D:\vibecoding\openoffice
docker compose up -d
pnpm install
pnpm build && pnpm typecheck && pnpm test && pnpm lint
pnpm dev
```

Web at `http://localhost:3000`. Smoke flow: signup → `/templates` → pick a template → name → submit → land on `/offices/[id]` with snapshotted agents visible.

## Non-Negotiable Rules (all upheld)

1. ✓ No secrets client-side (UNCHANGED — only server env)
2. ✓ All cross-process payloads Zod-validated (`createOfficeRequestSchema` at API boundary; `views.ts` for client-bound data)
3. ✓ LLM behind provider interface (still N/A — ready for Phase 6)
4. ✓ File tools through path guard (still N/A — workspace dir created and ready for Phase 6's path guard)
5. ✓ **Snapshots over references — PROVEN via curl smoke test and 2 dedicated tests**
6. ✓ **Multi-tenant by default — `listUserOffices`/`getOfficeById` always scope by `memberships.some.userId`; tested with 2-user isolation tests**
7. ✓ Pixel office is core feature (still N/A, ready for Phase 8)

---

*Generated: 2026-06-10, end of Phase 4.*
*Next: Phase 5 — Agent Builder (user-owned agents + custom knowledge docs + add/remove/reorder in office).*
