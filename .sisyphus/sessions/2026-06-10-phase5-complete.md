# Session Handoff — 2026-06-10 (Phase 5 Complete)

## Posisi Sekarang

| Phase | Status |
|---|---|
| Phase 0 — Monorepo scaffold (pnpm + Turborepo) | ✓ |
| Phase 1 — Shared Contracts (Zod, 31 tests) | ✓ |
| Phase 2 — Database Layer (PostgreSQL, 11 models, seeded) | ✓ |
| Phase 3 — Auth (NextAuth v5 + signup/login + middleware) | ✓ |
| Phase 4 — Template Catalog & Office Creation | ✓ |
| **Phase 5 — Agent Builder & Office Composition** | **✓** |

**Phase 6 NEXT** — Orchestrator: Workflow Engine (task execution pipeline).

## What Was Built (Phase 5)

### 1. Shared contracts (`packages/shared/src/views.ts`)
- `AGENT_TOOL_WHITELIST` — 5 tools: read_file, write_file, search, execute_command, web_search
- `agentCreateInputSchema` / `AgentCreateInput` — POST /api/agents validator
- `agentUpdateInputSchema` / `AgentUpdateInput` — PATCH /api/agents/[id] partial update
- `knowledgeDocViewSchema` / `KnowledgeDocView` — public doc shape
- `addAgentToOfficeSchema` / `reorderOfficeAgentsSchema` — office agent management

### 2. DB layer — Agent CRUD (`packages/db/src/agents.ts`)
- `createAgent(ownerId, input)` — creates agent + optional knowledge docs in transaction
- `listUserAgents(userId)` — scoped by ownerId
- `getAgentById(agentId, userId, { includeDocs? })` — scoped + knowledge docs opt-in
- `updateAgent(agentId, userId, input)` — partial update, returns null if not owned
- `deleteAgent(agentId, userId)` — cascade deletes knowledge docs, returns false if not owned
- `createKnowledgeDoc(agentId, userId, input)` — adds doc to owned agent
- `deleteKnowledgeDoc(docId, userId)` — verifies agent ownership before delete
- Exported as `@repo/db/agents` subpath

### 3. DB layer — Office agent management (`packages/db/src/offices.ts`)
- `addAgentToOffice(officeId, userId, { agentId, stepOrder })` — snapshots agent config, shifts existing agents right
- `removeAgentFromOffice(officeId, oaId, userId)` — removes + re-numbers trailing agents left
- `reorderOfficeAgents(officeId, userId, { items: [{ id, stepOrder }] })` — bulk reorder

### 4. API routes
- `POST /api/agents` + `GET /api/agents` — create (with knowledge docs) + list
- `GET/PATCH/DELETE /api/agents/[id]` — read (with docs), update (partial), delete
- `POST/DELETE /api/offices/[id]/agents` — add (snapshot), remove (with oaId query param)
- All auth-protected, Zod-validated, scoped to session.user.id

### 5. Pages
- `/agents` — list user's agents with edit/view links + "Create agent" button
- `/agents/new` — builder form (AgentBuilderForm client component)
  - Fields: name, role, system prompt, tools (multi-select from whitelist), model, temperature
  - Knowledge docs: 0-10 inline markdown docs with title + content
- `/agents/[id]` — detail: prompt, tools, knowledge docs (with server-action delete)
- `/agents/[id]/edit` — pre-filled form (reuses AgentBuilderForm)
- `/offices/[id]` — **enhanced** with `ManageOfficeAgents` client component:
  - Dropdown to add any user-owned agent not yet in the office (appended at end)
  - "Remove" button per agent (delete + re-number)
  - After mutation, `router.refresh()` to re-render

### 6. Middleware
- Protected paths now include `/agents/*`

### 7. Tests
- `packages/db/src/agents.test.ts` — **11 tests** against real Postgres:
  - Agent CRUD: create, list scoping, partial update, delete non-owner guard
  - Knowledge doc: create/delete with ownership check, cascade on agent delete
  - **CRITICAL**: adding agent to office snapshots config → editing source agent → office snapshot unchanged
  - Remove agent: verifies step re-numbering (1,2,3 → remove position 2 → 1,2 with correct agents)

## Verification Gate — ALL GREEN

```
pnpm build      → 5/5 successful
pnpm typecheck  → 9/9 successful
pnpm test       → 8/8 files / 77 tests passing  (31 shared + 24 db + 3 orchestrator + 19 web)
pnpm lint       → 8/8 successful
```

Build output (Phase 5 routes):
```
┌ ƒ /agents                                   172 B   106 kB
├ ƒ /agents/[id]                              171 B   106 kB
├ ƒ /agents/[id]/edit                        1.43 kB   107 kB
├ ƒ /agents/new                              1.82 kB   108 kB
├ ƒ /api/agents                               140 B   102 kB
├ ƒ /api/agents/[id]                          139 B   102 kB
├ ƒ /api/offices/[id]/agents                  140 B   102 kB
└ ƒ /offices/[id] (enhanced)                1.50 kB   107 kB
ƒ Middleware                                  87.4 kB
```

## CRITICAL LEARNINGS (Phase 5)

### 1. Zod `.default()` vs `z.input<>` for optional fields
When a Zod schema uses `.optional().default([])`, the inferred type (`z.infer<>`) always includes the field as REQUIRED (because the default means "it's always there"). But runtime callers may not supply it. For DB-layer functions that are called both from the API (Zod-validated) and from tests (bare TS), use `z.input<>` instead of `z.infer<>` — this gives the "before transform" type where optional is truly optional.

### 2. FK teardown order in tests
Test cleanup must follow the FK graph in reverse order. For this project:
```
Office → (cascade deletes OfficeAgent, OfficeMembership)
Agent ← TemplateAgent ← Template
```
So: delete offices → delete templateAgents → delete agents → delete templates → delete users.

### 3. Snapshot isolation for user agents
Same as Phase 4 for template agents, but now for user-owned agents:
- `addAgentToOffice` calls `toAgentView(agent)` and `JSON.stringify`'s the result into `OfficeAgent.agentSnapshot`
- Editing the source agent via `updateAgent` does NOT mutate the snapshot
- Proved with a dedicated test in `agents.test.ts`

### 4. `router.refresh()` for server-component rehydration
The office detail page uses a client component (`ManageOfficeAgents`) for add/remove. After mutating via fetch, `router.refresh()` triggers Next.js to re-fetch the server component (the page) with fresh data. Without it, the user sees stale agent lists.

### 5. `<details>/<summary>` for dropdown ui
The "Add agent" button uses `<details><summary>+ Add agent</summary><ul>...</ul></details>` — zero JS, works in all browsers. Perfect for a simple dropdown without pulling in a headless-ui library.

### 6. Agent builder form code reuse
`/agents/new/form.tsx` is a client component that accepts optional `initial` + `agentId` props. `/agents/[id]/edit/page.tsx` imports it with `../../new/form` and passes pre-filled values. The form detects edit mode (`!!agentId`) and switches between POST /api/agents and PATCH /api/agents/[id].

### 7. `@repo/db` subpath vs shared re-export chain
When web imports `@repo/db/agents`, the Bundler resolution chain is:
```
web/node_modules/@repo/db → symlink → packages/db
packages/db/dist/agents.js → imports @repo/shared → packages/shared/dist
```
`pnpm install` after adding the `./agents` subpath export + `@repo/shared` dep is all that's needed. The `transpilePackages` in `next.config.ts` handles the ESM chain.

## Files Created / Modified

### Created
- `packages/shared/src/views.ts` (extended with Agent CRUD schemas)
- `packages/db/src/agents.ts` (agent CRUD + knowledge docs)
- `packages/db/src/agents.test.ts` (11 tests, real DB)
- `apps/web/src/app/api/agents/route.ts` (POST + GET)
- `apps/web/src/app/api/agents/[id]/route.ts` (GET/PATCH/DELETE)
- `apps/web/src/app/api/offices/[id]/agents/route.ts` (POST/DELETE)
- `apps/web/src/app/agents/page.tsx` (list)
- `apps/web/src/app/agents/[id]/page.tsx` (detail)
- `apps/web/src/app/agents/[id]/edit/page.tsx` (edit)
- `apps/web/src/app/agents/new/page.tsx` (create)
- `apps/web/src/app/agents/new/form.tsx` (AgentBuilderForm)
- `apps/web/src/app/offices/[id]/manage-agents.tsx` (ManageOfficeAgents)

### Modified
- `packages/shared/src/views.ts` — Agent CRUD, knowledge doc, office agent schemas
- `packages/db/package.json` — added `./agents` subpath
- `packages/db/src/offices.ts` — added addAgentToOffice, removeAgentFromOffice, reorderOfficeAgents
- `apps/web/src/middleware.ts` — protect `/agents/*`
- `apps/web/src/app/offices/[id]/page.tsx` — integrated ManageOfficeAgents

## Startup Commands (unchanged)

```bash
cd D:\vibecoding\openoffice
docker compose up -d
pnpm install
pnpm build && pnpm typecheck && pnpm test && pnpm lint
pnpm dev
```

Web at `http://localhost:3000`. Post-login flow: `/agents` → create → `/agents/[id]` → edit → go to `/offices/[id]` → "Add agent" dropdown → remove/reorder.

---

*Generated: 2026-06-10, end of Phase 5.*
*Next: Phase 6 — Orchestrator: Workflow Engine (daemon, job queue, tool-calling loop, path guard, provider interface).*
