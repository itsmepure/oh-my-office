# Session Handoff — 2026-06-10 (Phase 7 Complete)

## Posisi Sekarang

| Phase | Status |
|---|---|
| Phase 0 — Monorepo scaffold (pnpm + Turborepo) | ✓ |
| Phase 1 — Shared Contracts (Zod, 31 tests) | ✓ |
| Phase 2 — Database Layer (PostgreSQL, 11 models, seeded) | ✓ |
| Phase 3 — Auth (NextAuth v5 + signup/login + middleware) | ✓ |
| Phase 4 — Template Catalog & Office Creation | ✓ |
| Phase 5 — Agent Builder & Office Composition | ✓ |
| Phase 6 — Orchestrator: Workflow Engine | ✓ |
| **Phase 7 — Real-time Transport** | **✓** |

**Phase 8 NEXT** — Pixel Office (PixiJS scene, sprites, event-to-animation mapping).

## What Was Built (Phase 7)

### 1. Orchestrator WebSocket realtime server

Files:
- `apps/orchestrator/src/realtime.ts`
- `apps/orchestrator/src/realtime.test.ts`
- `apps/orchestrator/src/index.ts`
- `apps/orchestrator/src/events.ts`
- `apps/orchestrator/package.json`

Features:
- `RealtimeHub` pure/testable in-memory subscription hub.
- WebSocket server on `ORCHESTRATOR_WS_PORT` (default `3001`).
- Short-lived HMAC token auth handshake.
- Client sends:
  - `{ type: 'auth', token }`
  - `{ type: 'subscribe', officeId?, taskId? }`
- Orchestrator verifies:
  - token signature + expiry
  - office/task membership via DB before subscribing
- Events broadcast only after durable DB persistence.
- Broadcast payload includes DB `eventId` for client dedupe:
  - `{ type: 'event', eventId, event }`

### 2. `persistEvent()` wired to broadcast after DB write

File:
- `apps/orchestrator/src/events.ts`

Important behavior:
1. Insert Event row into Postgres.
2. After insert succeeds, call `broadcastPersistedEvent(event, row.id)`.
3. If realtime server is not running, broadcast is a no-op.

This preserves the invariant: **DB replay is source of truth; live stream is an optimization.**

### 3. Orchestrator env loading + graceful shutdown

File:
- `apps/orchestrator/src/index.ts`

Changes:
- Added `dotenv` loading for package cwd and monorepo root:
  - `.env.local`
  - `.env`
  - `../../.env.local`
  - `../../.env`
- Requires `AUTH_SECRET` for realtime token verification.
- Starts WS server before DB poll loop.
- Graceful shutdown closes WS server + clears poll interval.

### 4. Web realtime token API

Files:
- `apps/web/src/lib/realtime-token.ts`
- `apps/web/src/app/api/realtime/token/route.ts`

Endpoint:
- `GET /api/realtime/token`

Behavior:
- Requires NextAuth session.
- Mints short-lived HMAC token using server-side `AUTH_SECRET`.
- Returns:
  - `token`
  - `wsUrl` (`ORCHESTRATOR_WS_URL`, default `ws://localhost:3001`)
  - `expiresIn`

No secrets are returned client-side.

### 5. Replay API

Files:
- `apps/web/src/app/api/events/route.ts`
- `apps/web/src/app/api/events/route.test.ts`

Endpoint:
- `GET /api/events?officeId=...`
- `GET /api/events?taskId=...`
- `GET /api/events?officeId=...&taskId=...`

Behavior:
- Requires NextAuth session.
- Tenancy guarded:
  - `officeId` requires `OfficeMembership`.
  - `taskId` requires task's office membership.
- Returns ordered replay records:
  - `{ id, event, ts }`
- Payloads are validated with `eventSchema`; malformed rows are skipped.

### 6. Zustand realtime store

Files:
- `apps/web/src/lib/realtime-store.ts`
- `apps/web/src/lib/realtime-store.test.ts`

Features:
- `useRealtimeStore`
- Hydrate from `/api/events` before opening WS.
- Get token from `/api/realtime/token`.
- Connect WS, authenticate, subscribe.
- Append live events.
- Auto-reconnect with replay-before-reconnect to fill missed gaps.
- Dedupe by DB id when available; synthetic key fallback for id-less live events.
- Derive agent visual states for Phase 8:
  - `agent.thinking` → `thinking`
  - `agent.tool_call` → `working`
  - `agent.output` / `step.done` / `step.failed` → `done`

### 7. Office page visible Phase 7 UI

Files:
- `apps/web/src/app/offices/[id]/page.tsx`
- `apps/web/src/app/offices/[id]/activity-feed.tsx`
- `apps/web/src/app/offices/[id]/task-runner.tsx`

Features:
- `TaskRunner` form queues tasks via API.
- `ActivityFeed` hydrates from DB and streams live WS events.
- Shows connection status, last error, derived agent states, ordered activity feed.

### 8. Minimal task creation API

Files:
- `apps/web/src/app/api/tasks/route.ts`
- `apps/web/src/app/api/tasks/route.test.ts`

Endpoint:
- `POST /api/tasks`

Body:
```json
{ "officeId": "uuid", "prompt": "..." }
```

Behavior:
- Requires session.
- Requires membership in target office.
- Creates `Task` with `status='queued'`.
- Orchestrator picks it up from DB.

### 9. Env docs

File:
- `.env.example`

Added:
```bash
ORCHESTRATOR_WS_PORT=3001
ORCHESTRATOR_WS_URL=ws://localhost:3001
```

`AUTH_SECRET` is shared by web token minting and orchestrator token verification.

## Verification Gate — ALL GREEN

Commands run:

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

Results:

```text
pnpm build      → 5/5 successful
pnpm typecheck  → 9/9 successful
pnpm test       → 9/9 files / 114 tests passing
pnpm lint       → 8/8 successful
```

Test breakdown:

```text
@repo/shared        31 passed
@repo/db            24 passed
@repo/agents        16 passed
@repo/orchestrator  11 passed  (3 smoke + 8 realtime)
@repo/web           32 passed  (signup, offices, events, tasks, realtime-store)
TOTAL              114 passed
```

Build route additions:
- `/api/events`
- `/api/realtime/token`
- `/api/tasks`
- `/offices/[id]` now includes task runner + activity feed.

## Manual Smoke — PASSED

Environment:
- Postgres healthy.
- Web dev on `localhost:3000`.
- Orchestrator WS on `localhost:3001`.
- No live Anthropic key required; task fails safely after emitting events.

Steps and evidence:

1. `GET /login` returned `200`.
2. Signup returned `201`.
3. Credentials signin returned `302`.
4. Session endpoint returned `200` with authenticated user id.
5. `POST /api/offices` using `template-dev-001` returned `201` and created office:
   - `e767b1bd-89d1-40c3-b628-27f0ed08c673`
6. Initial replay:
   - `GET /api/events?officeId=...` returned `200` and `events: []`.
7. Token endpoint:
   - `GET /api/realtime/token` returned `wsUrl=ws://localhost:3001`, token length 128, `expiresIn=600`.
8. WS foreground smoke script:
   - received `auth.ok`
   - received `subscribed`
   - queued task via `POST /api/tasks` → `201`
   - received 5 live WS events:
     1. `task.status` → `running`
     2. `step.start`
     3. `agent.thinking`
     4. `step.failed` with error `ANTHROPIC_API_KEY is not set`
     5. `task.status` → `failed`
9. Replay after stream:
   - `GET /api/events?officeId=...` returned `replay_count=15` total events for that smoke office.
   - Last 5 replay types matched live WS event sequence:
     - `task.status, step.start, agent.thinking, step.failed, task.status`
   - All last 5 replay records had DB ids (`has_event_ids=True`).
10. Dev servers killed after smoke.
   - Ports 3000/3001 had no LISTENING PIDs left (only TIME_WAIT sockets).

## Critical Learnings / Pitfalls

### 1. Broadcast after DB write, never before
Live websocket events must never be the only source of truth. `persistEvent()` writes Postgres first, then broadcasts. If broadcast fails, replay still works.

### 2. Include `eventId` in WS payloads
Without DB ids in live payloads, reconnect replay can duplicate live events. The WS payload now includes `eventId`, and client store dedupes by id.

### 3. Auth token lives server-side only
The web API mints short-lived HMAC tokens using `AUTH_SECRET`; the client only receives token + wsUrl. The orchestrator verifies token with the same `AUTH_SECRET`.

### 4. Orchestrator needs dotenv loading
`tsx` / `pnpm --filter @repo/orchestrator dev` does not reliably load root `.env` by default. Phase 7 adds explicit dotenv loading for package and root env paths.

### 5. MSYS `/tmp` vs Node on Windows
Git Bash `/tmp/foo` may be interpreted by Node/Windows as `D:\tmp\foo`. For Node smoke scripts, use project-local files instead of `/tmp`, or pass data through env/stdin.

### 6. Netscape cookie jar `#HttpOnly_` lines are real cookies
Curl writes HttpOnly cookies with `#HttpOnly_` prefix. Do not skip all `#` lines when converting cookie jar to an HTTP `Cookie` header.

### 7. Hermes background Node scripts can fail with `stdin is not a tty`
For the WS smoke, a foreground self-contained Node script worked better than a background `node ... &` or Hermes background Node process. It subscribed, then queued the task itself after receiving `subscribed`.

### 8. No live LLM needed for realtime smoke
With `ANTHROPIC_API_KEY` unset, the orchestrator still emits useful realtime sequence:
- task running
- step start
- agent thinking
- step failed
- task failed

That is enough to verify WS + persistence + replay without spending tokens.

## Files Added / Modified

```text
apps/orchestrator/package.json
apps/orchestrator/src/events.ts
apps/orchestrator/src/index.ts
apps/orchestrator/src/realtime.ts
apps/orchestrator/src/realtime.test.ts

apps/web/src/app/api/events/route.ts
apps/web/src/app/api/events/route.test.ts
apps/web/src/app/api/realtime/token/route.ts
apps/web/src/app/api/tasks/route.ts
apps/web/src/app/api/tasks/route.test.ts
apps/web/src/app/offices/[id]/activity-feed.tsx
apps/web/src/app/offices/[id]/page.tsx
apps/web/src/app/offices/[id]/task-runner.tsx
apps/web/src/lib/realtime-store.ts
apps/web/src/lib/realtime-store.test.ts
apps/web/src/lib/realtime-token.ts

.env.example
pnpm-lock.yaml
```

## Known Deferred Work

Not in Phase 7:
- PixiJS pixel office scene (Phase 8).
- Visual sprite state tests (Phase 8).
- Production-grade multi-worker queue locking (`FOR UPDATE SKIP LOCKED`) — still MVP single worker.
- WebSocket deployment/proxy config for production.
- Real Anthropic success path smoke (blocked unless `ANTHROPIC_API_KEY` is set and user explicitly wants live API usage).

## Next Phase — Phase 8 Pixel Office

Recommended starting prompt:

```text
lanjut phase 8 openoffice. baca .sisyphus/sessions/2026-06-10-phase7-complete.md dulu
```

Phase 8 scope from `plan.md`:
- PixiJS v8 scene.
- Office room background.
- One sprite per OfficeAgent at a desk.
- Map Phase 7 events → sprite states:
  - idle / thinking / working / done
- Activity feed already exists from Phase 7.
- Refresh/reconnect should rebuild scene from DB replay via Zustand store.

---

*Generated: 2026-06-10, end of Phase 7.*
