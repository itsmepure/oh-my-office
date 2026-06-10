# Implementation Plan — Multi-Office AI Platform (MVP)

**Date:** 2026-06-09
**Related:** `docs/PRD.md`, `docs/superpowers/specs/2026-06-09-multi-office-platform-design.md`

This plan breaks the MVP into ordered phases. Each phase has a goal, concrete tasks, and a verification gate that must pass before moving on. Build vertically where possible: get a thin end-to-end slice working early, then deepen.

---

## Phase 0 — Monorepo Scaffold & Tooling

**Goal:** A working pnpm + Turborepo monorepo with shared TS config and empty packages wired together.

**Tasks:**
1. Init pnpm workspace (`pnpm-workspace.yaml`) + Turborepo (`turbo.json`).
2. Create structure:
   ```
   apps/web/            # Next.js 15 (App Router, TS)
   apps/orchestrator/   # Node + TS daemon
   packages/db/         # Prisma
   packages/agents/     # agent runtime
   packages/shared/     # Zod contracts
   ```
3. Root `tsconfig.base.json`; per-package tsconfig extending it.
4. ESLint + Prettier + `.gitignore`.
5. Scripts: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm test`.

**Verification:** `pnpm install && pnpm build && pnpm lint` all pass on empty scaffold. `pnpm dev` boots Next.js + orchestrator stub concurrently.

---

## Phase 1 — Shared Contracts (`packages/shared`)

**Goal:** Single source of truth for command/event types via Zod.

**Tasks:**
1. Define **Event** schemas: `step.start`, `step.done`, `step.failed`, `agent.thinking`, `agent.tool_call`, `agent.output`, `task.status`.
2. Define **Command** schemas: `task.create`, `office.create`.
3. Export inferred TS types. Add a `parseEvent`/`parseCommand` helper.
4. Unit-test that valid payloads parse and invalid ones throw.

**Verification:** `pnpm test` green for shared; types importable from both web and orchestrator.

---

## Phase 2 — Database Layer (`packages/db`)

**Goal:** Postgres schema modeling all core entities.

**Tasks:**
1. Prisma schema for: `User`, `Agent`, `KnowledgeDoc`, `Template`, `TemplateAgent`, `Office`, `OfficeMembership`, `OfficeAgent`, `Task`, `Event`, `Artifact` (per spec Section 5).
2. Relations + indexes (`ownerId`, `officeId`, `taskId`).
3. Migration + Prisma client export.
4. **Seed script:** 3 templates (Dev, Research, Content) with their platform agents + workflow steps.

**Verification:** `prisma migrate dev` applies cleanly; seed populates 3 templates; a query lists templates with their agents.

---

## Phase 3 — Auth & Tenancy (`apps/web`)

**Goal:** Users can register, log in; data scoped per user.

**Tasks:**
1. Auth.js (NextAuth v5) with credentials (email/password) — Prisma adapter.
2. Protected routes/layouts; session helper.
3. Tenancy guard: queries filtered by `userId`; users only see their own offices/agents.

**Verification:** Register → login → access dashboard. Logged-out access redirects. A second user cannot see the first user's offices (integration test).

---

## Phase 4 — Template Catalog & Office Creation

**Goal:** Browse templates and create an office (snapshot copy).

**Tasks:**
1. Catalog page: list seed templates with composition (agents + steps).
2. `office.create` action: copy `TemplateAgent` configs into `OfficeAgent` snapshots; create `Office` + `OfficeMembership(owner)`; provision scoped `workspacePath` on disk.
3. Dashboard: list user's offices; open/delete.

**Verification:** Create office from "Dev Office" → office has correct agent snapshots + workspace folder created; editing a template afterward does NOT change the existing office (snapshot test).

---

## Phase 5 — Agent Builder & Office Composition

**Goal:** Users create their own agents and add them to an office.

**Tasks:**
1. Agent builder form: name, role, system prompt, tool multiselect (from whitelist), knowledge doc upload (text/markdown).
2. CRUD for user-owned agents (`ownerId = userId`).
3. Office editor: add/remove/reorder `OfficeAgent`s; user agent inserted as snapshot with step position.

**Verification:** Create a custom agent → add to an office → it appears in workflow at chosen position; knowledge doc persisted.

---

## Phase 6 — Orchestrator: Workflow Engine (`apps/orchestrator` + `packages/agents`)

**Goal:** Deterministic pipeline executes a task end-to-end (LLM mockable).

**Tasks:**
1. Daemon process; job intake (DB-backed queue: poll `Task` where `status=queued`).
2. **Provider interface** for LLM (Vercel AI SDK, Anthropic impl + a `FakeProvider` for tests/CI).
3. **Tool-calling loop** in `packages/agents`: given agent config + context, call LLM, execute tool calls, collect output.
4. **Tools (MVP set):** `read_file`, `write_file`, `list_files` — all routed through **path guard** bound to office `workspacePath`.
5. **Pipeline runner:** for each `OfficeAgent` in step order, run loop with `task prompt + prior outputs + agent knowledge`; persist `Event`s and `Artifact`s; update `Task.status`.
6. Error handling: bounded LLM retries; `step.failed`→`task.failed`; path-escape rejected as tool error.

**Verification:** With `FakeProvider`, running a task executes all steps in order, emits correct event sequence, writes artifacts, and ends `done`. Path guard unit tests: in-scope ok, escape attempts rejected. Orchestrator restart reconciles stuck `running`→`failed`.

---

## Phase 7 — Real-time Transport

**Goal:** Events flow orchestrator → web client live, with persistence + replay.

**Tasks:**
1. WebSocket server (in orchestrator/gateway); auth handshake; subscribe by `officeId`/`taskId`.
2. Persist every event to DB before/along with broadcast.
3. Web client: Zustand store consuming WS; on connect, hydrate from DB then stream live.
4. Auto-reconnect + re-sync.

**Verification:** Run a task; events appear live in client store. Kill WS mid-task → client reconnects and rebuilds full event history from DB.

---

## Phase 8 — Pixel Office (Signature Feature)

**Goal:** PixiJS scene visualizes agents and their live states.

**Tasks:**
1. PixiJS v8 scene: office room background; one sprite per `OfficeAgent` at a desk.
2. Map events→animations: `idle/thinking/working/done`; highlight active agent.
3. Bind scene to Zustand event store (from Phase 7).
4. Activity feed panel (secondary) listing ordered events.
5. Source/choose pixel tileset + character sprites (resolve licensing open question).

**Verification:** Running a task animates the correct sprites in sequence matching events; active agent highlighted; refresh/reconnect rebuilds scene to current state. Manual visual QA + event-to-state unit tests.

---

## Phase 9 — Output Review & Polish

**Goal:** Users review artifacts and logs; rough edges smoothed.

**Tasks:**
1. Task detail view: artifacts (type/name/content), full activity log.
2. Office dashboard task history.
3. Loading/empty/error states; basic responsive layout.

**Verification:** After a task, artifacts + log viewable and persist across refresh. US-1..US-8 acceptance criteria all met.

---

## Phase 10 — End-to-End Smoke & Hardening

**Goal:** Full loop verified; CI green.

**Tasks:**
1. E2E smoke (LLM mocked): register → create office → add custom agent → run task → events arrive → artifact produced.
2. CI pipeline: install, build, lint, unit + integration + e2e (mocked).
3. Seed/demo data for showcasing the pixel office.

**Verification:** CI green end-to-end; manual run of the complete demo flow with no errors.

---

## Cross-Cutting Conventions

- **No secrets client-side.** API keys live only in orchestrator/server env.
- **All cross-process payloads validated** with `packages/shared` Zod schemas.
- **LLM always behind the provider interface** — never imported directly in pipeline code.
- **Every file/code tool call goes through the path guard.** No exceptions.
- **Snapshots over references** for office agents (decouple from template/agent edits).
- **Tests use `FakeProvider`** — no live LLM calls in CI.

---

## Deferred (post-MVP, do not build now)

Real-time human collaboration UI · multiple AI backends · billing · git worktree isolation · Telegram · Tauri desktop · model fine-tuning · dynamic leader delegation · container-per-office · vector RAG.

---

## Suggested Build Order Rationale

Phases 0–2 lay foundations. Phase 3–5 give a usable product shell (auth, templates, agents) with no execution yet. Phase 6–7 add the engine + live transport — the technical heart. Phase 8 delivers the signature pixel office on top of the working event stream. Phases 9–10 finish and verify. A thin slice is demoable after Phase 8; fully shippable after Phase 10.
