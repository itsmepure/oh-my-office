# Session Handoff — 2026-06-10 (Phase 6 Complete)

## Posisi Sekarang

| Phase | Status |
|---|---|
| Phase 0 — Monorepo scaffold (pnpm + Turborepo) | ✓ |
| Phase 1 — Shared Contracts (Zod, 31 tests) | ✓ |
| Phase 2 — Database Layer (PostgreSQL, 11 models, seeded) | ✓ |
| Phase 3 — Auth (NextAuth v5 + signup/login + middleware) | ✓ |
| Phase 4 — Template Catalog & Office Creation | ✓ |
| Phase 5 — Agent Builder & Office Composition | ✓ |
| **Phase 6 — Orchestrator: Workflow Engine** | **✓** |

**Phase 7 NEXT** — Real-time Transport (WebSocket server, live event broadcast, Zustand store).

## What Was Built (Phase 6)

### 1. Provider Interface (`packages/agents/src/provider.ts`)
- `Provider` interface — `generate(params)` → `GenerateResult`
- `FakeProvider` — deterministic, pre-configured response queue (for tests/CI, Non-Negotiable Rule #3)
- `AnthropicProvider` — direct fetch to Anthropic Messages API with tool-use support
- Types: `GenerateParams`, `GenerateResult`, `ToolCall`, `ToolDefinition`

### 2. Path Guard + Tools (`packages/agents/src/tools.ts`)
- `guardPath(workspaceRoot, requestedPath)` — resolves + prefix-checks, throws `PathEscapeError`
- `safeReadFile` / `safeWriteFile` / `safeListFiles` — all route through guard
- `createToolRegistry(workspaceRoot)` — returns `{ read_file, write_file, list_files }` with tool definitions + execute closures
- Non-Negotiable Rule #4: every path escape attempt (`../../../etc/passwd`, absolute paths outside root) → `PathEscapeError`

### 3. Agent Loop (`packages/agents/src/loop.ts`)
- `runAgentLoop(config)` — iterative tool-calling:
  1. Build system prompt (base + knowledge docs)
  2. Provider.generate() with tools
  3. Execute any tool calls via toolRegistry
  4. Feed tool results back as user prompts
  5. Loop until text response (no tool calls) or maxIterations exhausted
- Emits `LoopEvent`s via `onEvent` callback: `agent.thinking`, `agent.tool_call`, `agent.output`
- Returns `LoopResult` with output, turns, token usage
- Configurable `maxIterations` (default 10, safety valve)

### 4. Event Persistence (`apps/orchestrator/src/events.ts`)
- `persistEvent(event: SharedEvent)` — writes to Postgres Event table (Zod-typed)

### 5. Job Queue (`apps/orchestrator/src/queue.ts`)
- `dequeueTask()` — poll `Task where status=queued` → lock to `running`, emit `task.status(running)` event
- `completeTask(taskId, officeId, status)` — mark done/failed + emit `task.status` event
- `reconcileStuckTasks()` — startup recovery: any `Task` stuck in `running` → `failed` (prevents queue block)

### 6. Pipeline Runner (`apps/orchestrator/src/runner.ts`)
- `runTask(task, { provider, maxIterations })` — the heart of execution:
  1. Load office + OfficeAgents (sorted stepOrder)
  2. For each OfficeAgent:
     - Parse agentSnapshot (JSON → AgentView)
     - Load knowledge docs (best-effort)
     - Create tool registry bound to office.workspacePath
     - Build task context (prompt + prior step outputs)
     - Emit `step.start`
     - Run AgentLoop with agent config + knowledge text
     - Emit `step.done` (success) or `step.failed` (error) + mark task failed
  3. On full success: persist combined output as Artifact, mark task done
- All events persisted via `persistEvent` after each step

### 7. Orchestrator Daemon (`apps/orchestrator/src/index.ts`)
- Startup: reconcile stuck tasks, init Anthropic provider, enter poll loop (5s interval)
- Graceful shutdown on SIGINT/SIGTERM

### 8. Tests
- `packages/agents/src/index.test.ts` — **16 tests**:
  - FakeProvider: ordered responses, reset, exhaustion default
  - Path guard: in-scope ok, `../` escape, absolute escape, Windows drive edge
  - Tools: real filesystem read, write (with parent dirs), list; path escape rejection
  - Agent loop: single-turn (no tools), multi-turn (tool calls), event emission, maxIterations safety

## Verification Gate — ALL GREEN

```
pnpm build      → 5/5 successful
pnpm typecheck  → 9/9 successful
pnpm test       → 9/9 files / 93 tests passing  (31 shared + 24 db + 19 web + 3 orchestrator + 16 agents)
pnpm lint       → 8/8 successful
```

## File structure (Phase 6 additions)

```
packages/agents/src/
  provider.ts        — Provider interface, FakeProvider, AnthropicProvider
  tools.ts           — PathGuard + 3 MVP tools (read_file, write_file, list_files)
  loop.ts            — runAgentLoop (tool-calling loop with event emission)
  index.ts           — re-exports
  index.test.ts      — 16 tests

apps/orchestrator/src/
  events.ts          — persistEvent to DB
  queue.ts           — dequeue + complete + reconcile
  runner.ts          — runTask (pipeline execution)
  index.ts           — daemon main (rewritten from stub)
```

## CRITICAL LEARNINGS (Phase 6)

### 1. Path Guard must use `resolve()` + prefix check
String-based `startsWith` on paths is vulnerable to sibling attacks (`/workspaces/office-1` vs `/workspaces/office-10`). The guard:
- `resolve(workspaceRoot, requestedPath)` — flattens `.` and `..`
- `safe.startsWith(root + sep)` — ensures sibling dirs don't match

### 2. Tool registry is a closure over workspaceRoot
Each office gets its own tool registry at pipeline time. The `execute()` closures capture the office's `workspacePath`, so the orchestrator daemon handles multiple offices concurrently without path confusion.

### 3. Prisma `Json` column needs `JSON.parse(JSON.stringify(obj))`
TypeScript types don't narrow well from `Record<string, unknown>` to `InputJsonValue`. The safe pattern is `JSON.parse(JSON.stringify(event))` — strips non-JSON props and makes TSC happy.

### 4. FakeProvider + real filesystem test pattern
Agent loop tests use `FakeProvider` for deterministic LLM responses, but tools use a real temp directory. This covers the full tool-calling pipeline without Anthropic API calls while still exercising actual file I/O and path guard enforcement.

### 5. `??` vs `||` for the loop fallthrough
When the agent loop exhausts maxIterations, it returns the last result text. `??` doesn't catch empty string (`''`), so a FakeProvider returning empty-text tool-call-only responses would return `''` instead of the fallback message. Use `||` for "text or fallback".

### 6. Startup reconciliation prevents queue deadlock
Any task stuck in `running` on daemon restart (crash, SIGKILL, OOM) is transitioned to `failed` via `reconcileStuckTasks()`. Without this, the queue would be permanently blocked waiting for a task that no worker is processing.

### 7. Knowledge docs loaded at pipeline time (not snapshot time)
Docs are fetched from `KnowledgeDoc` table for each agent's source config during pipeline execution. This means docs added to an agent AFTER an office is created DO affect running tasks (unlike the agent config, which is snapshotted). This is the intended behavior — knowledge is mutable context, agent config is immutable architecture.

### 8. Orchestrator has its own `@repo/db` instance
The daemon imports `prisma` from `@repo/db` directly, sharing the same Prisma client config as the web app. Both processes connect to the same Postgres instance. No separate connection is needed.

## Non-Negotiable Rules (all upheld)

1. ✓ No secrets client-side (ANTHROPIC_API_KEY only in orchestrator env)
2. ✓ All cross-process payloads Zod-validated (Event schemas in shared, validated at persist + emit)
3. ✓ **LLM behind provider interface** (FakeProvider for tests, AnthropicProvider for real)
4. ✓ **Every file/code tool through path guard** (proven via escape-rejection tests)
5. ✓ Snapshots over references (OfficeAgent.agentSnapshot used in pipeline)
6. ✓ Multi-tenant by default (unchanged — Task queries scoped by office which is scoped by ownership)
7. ✓ Pixel office is core feature (Phase 8 — event stream ready for it)

## Startup Commands

```bash
cd D:\vibecoding\openoffice
docker compose up -d
pnpm install
pnpm build && pnpm typecheck && pnpm test && pnpm lint

# Start both web app + orchestrator daemon:
pnpm dev

# Or run orchestrator standalone:
pnpm --filter @repo/orchestrator dev
```

Set `ANTHROPIC_API_KEY` in the orchestrator's `.env` (or root `.env`). Without it, the daemon warns and LLM calls fail.

To create a task (via curl after signup):
```bash
POST http://localhost:3000/?  # This would need a task.create API route (not yet exposed from web)
# For now, tasks are created directly in the DB or via the API (Phase 6 focus is execution, not task creation UI)
```

Phase 7 will add the WebSocket server for live event streaming. The event persistence infrastructure built here is ready for it — the `persistEvent` helper is the single write point where broadcast will be layered on.

---

*Generated: 2026-06-10, end of Phase 6.*
*Next: Phase 7 — Real-time Transport (WebSocket + Zustand + hydration replay).*
