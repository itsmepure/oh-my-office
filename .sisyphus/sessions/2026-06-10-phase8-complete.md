# Session Handoff — 2026-06-10 (Phase 8 Complete)

## Posisi Sekarang

| Phase | Status |
|---|---|
| Phase 0 — Monorepo scaffold (pnpm + Turborepo) | ✓ |
| Phase 1 — Shared Contracts (Zod) | ✓ |
| Phase 2 — Database Layer (Postgres, 11 models) | ✓ |
| Phase 3 — Auth (NextAuth v5) | ✓ |
| Phase 4 — Template Catalog & Office Creation | ✓ |
| Phase 5 — Agent Builder & Office Composition | ✓ |
| Phase 6 — Orchestrator: Workflow Engine | ✓ |
| Phase 7 — Real-time Transport (WebSocket + replay) | ✓ |
| **Phase 8 — Pixel Office (PixiJS v8 scene)** | **✓** |

**Phase 9 NEXT** — Output Review & Polish (artifact detail view, task history, loading/empty states, responsive).

---

## What Was Built (Phase 8)

### 1. Pure event-to-state reducer

Files:
- `apps/web/src/components/pixel-office/event-to-state.ts`
- `apps/web/src/components/pixel-office/event-to-state.test.ts`

Exports `reduceEventsToAgentStates(events, knownAgentRefs)`:
- Takes the ordered list of `SharedEvent` records (from the realtime store, identical shape to the DB replay).
- Returns a per-agent snapshot:
  - `byAgent: Record<agentRef, 'idle' | 'thinking' | 'working' | 'done'>`
  - `activeAgent` — most recent non-idle `agentRef` (used for the "spotlight" bob)
  - `toolCallsByAgent`, `outputsByAgent` — per-agent counters
- Seeding rule: every `knownAgentRef` starts at `idle` so the scene shows every agent up front even when no events have been recorded yet.

Mapping rules (locked in by unit tests):
- `step.start`         → `working`
- `agent.thinking`    → `thinking`
- `agent.tool_call`    → `working`  (+ tool-call counter)
- `agent.output`       → `working`  (+ output counter)
- `step.done`          → `done`
- `step.failed`        → `done`     (settled — failed is still "done" for visuals)
- `task.status`        → ignored    (task-level, not bound to an agent)

Tests cover: empty input, known-ref seeding, every individual event type, multi-step workflow planner → coder → reviewer, the active-agent spotlight rule, and counter accumulation.

### 2. Procedural sprite styling (no third-party tileset)

Files:
- `apps/web/src/components/pixel-office/sprite-styling.ts`
- `apps/web/src/components/pixel-office/sprite-styling.test.ts`

Resolves the **open asset-licensing question** in `plan.md` §Phase 8:
- No third-party tileset is bundled. Each agent gets a deterministic color trio (body / accent / halo) derived from a stable djb2 hash of its `agentRef`.
- Curated 8-color palette so the room reads as deliberate pixel art, not noise.
- `brightnessFor(state)` returns a 0..1 dim factor used to darken the sprite body when idle and brighten it while working. Lets the user see at a glance which agent is active without animation.

### 3. Procedural canvas sprite renderer

File:
- `apps/web/src/components/pixel-office/sprite-canvas.ts`

- 32×32 pixel art drawn with `CanvasRenderingContext2D` pixel-by-pixel into a tiny canvas, then scaled ×3 by PixiJS (`imageSmoothingEnabled = false`).
- Drawn elements: head, hair, eyes, torso, arms, desk, status light, and a state-tinted "monitor" pixel.
- State-specific arm positions:
  - `idle` — slight forward lean
  - `thinking` — one arm on chin
  - `working` — both arms forward (typing)
  - `done` — arms relaxed at sides
- State-specific monitor color:
  - `working` → green
  - `thinking` → amber
  - `done` → blue
  - `idle` → gray

### 4. PixiJS v8 scene component

File:
- `apps/web/src/components/pixel-office/pixel-office-scene.tsx`

- Dynamic-imported (in the wrapper) so PixiJS is never in the SSR bundle. Scene itself is a plain client component.
- Boot lifecycle:
  1. Construct `Application`, `await app.init({ width, height, backgroundAlpha: 0 })`.
  2. Build the room (back wall, floor, rug, window, plant, wall clock) once via `Graphics`.
  3. Build one `SpriteSlot` per `OfficeAgent` at a deterministic desk position (centered row, spacing scales with agent count, max 8 fit comfortably).
  4. Mount the PixiJS canvas into the host `div`.
- Cleanup: `app.destroy(true, { children: true, texture: true })` in the `useEffect` return. HMR-safe.
- Per-slot visuals:
  - Halo `Graphics` circle (alpha = `HALO_ALPHA[state]`)
  - Body sprite (re-rendered only when state changes; the canvas is cached on the slot)
  - Bubble with status icon (`?` / `> ` / `OK` / empty for `idle`)
  - White name label below the sprite, tinted by accent color when active
- Ticker: gently bobs the most recently non-idle sprite up/down with `Math.sin(performance.now() / 220) * 3`, eased toward the target each frame.

### 5. React wrapper bound to the Zustand store

File:
- `apps/web/src/components/pixel-office/pixel-office.tsx`

- `PixelOffice` is the public component used by the office page.
- Reads `useRealtimeStore((s) => s.records)` via the React subscription.
- Reduces events → snapshot.
- Renders `<PixelOfficeScene agents={specs} />` plus a textual mirror list (`data-state`, `data-agent-ref`) for accessibility / quick visual reference.
- Stable: `useMemo` over `agents` and `records`.

### 6. Office page integration

File:
- `apps/web/src/app/offices/[id]/page.tsx`

- New section at the top of the page, above `ManageOfficeAgents`:
  - "Pixel Office" heading.
  - Embeds `<PixelOffice agents={office.agents} />`.
  - Empty state: "Add at least one agent below to see the pixel office." (dashes border, no canvas) when the office has zero `OfficeAgent`s.
- `office.agents` is already returned by `getOfficeById` (Phase 5) and is a `OfficeAgentSnapshot[]` — no new API endpoint was needed.

### 7. Bug fix: orchestrator `agentRef` inconsistency

Files:
- `packages/agents/src/loop.ts`
- `apps/orchestrator/src/runner.ts`

**Bug found during manual smoke**: `step.start` / `step.done` / `step.failed` events emitted `agentRef = oa.id` (an OfficeAgent UUID), but the inner agent-loop events (`agent.thinking`, `agent.tool_call`, `agent.output`) emitted `agentRef = config.agent.name` (e.g. `"Planner"`). The pixel-office scene couldn't map thinking bubbles back to the right sprite.

**Fix**:
1. Added `agentRefOverride?: string` to `LoopConfig`.
2. `loop.ts` now uses `config.agentRefOverride ?? config.agent.name`.
3. `runner.ts` passes `agentRefOverride: oa.id` to every `runAgentLoop(...)` call.
4. Now every event for one agent shares the same `agentRef` (the OfficeAgent UUID), so the scene map is consistent across `step.start → agent.thinking → step.failed`.

This is a correctness fix that the existing tests didn't catch (the orchestrator smoke test uses a hardcoded `agentRef: 'office_agent_smoke'` rather than asserting the cross-event invariant). A new regression test would be valuable in Phase 9.

### 8. Dependency added

File:
- `apps/web/package.json`

`pixi.js@^8` is the only new runtime dependency. Bundles into the `/offices/[id]` chunk via the dynamic import — page size is 6.46 kB / 125 kB first-load (the rest of the site is unchanged).

---

## Verification Gate — ALL GREEN

```text
pnpm build      → 5/5 successful
pnpm typecheck  → 9/9 successful
pnpm test       → 8/8 files / 132 tests passing  (+18 from Phase 7)
pnpm lint       → 8/8 successful
```

Test breakdown:
```text
@repo/shared        31 passed
@repo/db            24 passed
@repo/agents        16 passed
@repo/orchestrator  11 passed
@repo/web           50 passed   (32 prior + 18 new pixel-office tests)
TOTAL              132 passed
```

Build route additions:
- `/offices/[id]` now ships the PixiJS pixel-office scene bundle.

---

## Manual Smoke — PASSED

Environment:
- Postgres healthy.
- Web dev on `localhost:3000`.
- Orchestrator WS on `localhost:3001`.
- `ANTHROPIC_API_KEY` unset — every task fails at `agent.thinking` (intentional, matches Phase 7 smoke).

Steps and evidence:

1. `GET /login` returned `200`.
2. Signup returned `201` (`phase8smoke_1781051803@test.local`).
3. Credentials signin returned `302`.
4. Session endpoint returned `200` with user id `3916e143-…`.
5. `POST /api/offices` with `template-dev-001` returned `201` and created office `b2dd46c5-2c08-4ac4-abb2-cde94c54a5f2` with three snapshot agents:
   - `48f4cfe5-…` → Planner
   - `fc33b2e6-…` → Coder
   - `5f88e562-…` → Reviewer
6. `GET /offices/[id]` returned `200` (53 kB HTML) and the rendered page contains:
   - "Pixel Office" section heading
   - "Loading pixel office…" placeholder text (PixiJS dynamic-import)
   - 3 `data-testid="agent-state-row"` list items (textual mirror)
7. **Bug caught**: first task queued (`/api/tasks` → `201`) showed `agent.thinking` events with `agentRef=Planner` (string) while `step.start` / `step.failed` used `48f4cfe5-…` (UUID). Confirmed mismatched refs in `apps/orchestrator/src/runner.ts` and `packages/agents/src/loop.ts`.
8. Fix applied: `agentRefOverride: oa.id` in `runAgentLoop`. Orchestrator restarted.
9. Second task queued, replay inspected:
   ```text
   total events: 10
   last 5 events for the new task:
     task.status          (task-level)
     step.start           agentRef=48f4cfe5-…  uuid=True
     agent.thinking       agentRef=48f4cfe5-…  uuid=True  ← fixed
     step.failed          agentRef=48f4cfe5-…  uuid=True
     task.status          (task-level)
   ```
   All `agentRef` values for a given step now match.
10. Reducer applied to the full replay:
    ```text
    byAgent:
      "48f4cfe5-…" → done      ← Planner (step 1, failed, settled)
      "fc33b2e6-…" → idle      ← Coder (never ran)
      "5f88e562-…" → idle      ← Reviewer (never ran)
    activeAgent: 48f4cfe5-…    ← Planner halo brightest
    toolCalls:   {}
    outputs:     {}
    ```
    Matches the expected sequence: planner starts → thinking → fails (no API key) → task failed; coder and reviewer never get a turn.
11. Dev servers killed (ports 3000/3001 freed).

---

## Critical Learnings / Pitfalls

### 1. PixiJS v8 is browser-only — must dynamic-import
`pixi.js` touches `document` / `WebGLRenderingContext` at module load. Importing it from a server component will crash the SSR render. The wrapper component uses `next/dynamic({ ssr: false })` with a Tailwind-ish loading state.

### 2. Procedural sprites > third-party tileset (for MVP)
`plan.md` flagged the asset-licensing question as open. Procedural pixel art (32×32 drawn with `fillRect`) is:
- zero-license
- deterministic (same agent → same colors across reloads)
- trivially editable when the design needs to change
- good enough for a Phase 8 verification gate
A real tileset swap is a Phase 9+ polish item.

### 3. `agentRef` must be consistent across events from one step
The Phase 7 tests validated the *shape* of events but not the cross-event invariant that every event for one step shares the same `agentRef`. The pixel-office scene needs that invariant to map events back to sprites, so we hit this during smoke and fixed it in Phase 8. **A new regression test in `packages/agents` or `apps/orchestrator` would have caught this earlier — Phase 9 candidate.**

### 4. `OfficeAgent.id` is the right ref, not `Agent.id`
The orchestrator emits `agentRef: oa.id` (the `OfficeAgent.id` row in the `OfficeAgent` table). That's what the scene's `spec.ref` must match. The `OfficeAgentSnapshot.agent.id` is the *original* `Agent.id` — different value, different scope, not what we want for sprite routing.

### 5. MSYS /tmp is unreliable from Node on Windows
Repeating the Phase 7 lesson: writing `/tmp/foo.json` from the curl smoke gets read by Node as `D:\tmp\foo.json` and silently fails. Use `scripts/.p8_*.json` (project-local, prefixed with `.` to keep git quiet).

### 6. Render only on state change
Re-rendering the canvas every event would thrash. Each `SpriteSlot` caches `cachedState`; we only redraw the body sprite when the state actually changes (cheap JSON-equality key over the whole `byAgent` map catches the cross-agent case too).

### 7. PixiJS application destroy in HMR
`app.destroy(true, { children: true, texture: true })` is needed to prevent canvas leaks on Next.js HMR reload. The `try/catch` around it swallows the "destroy during teardown" race that sometimes throws on Windows.

### 8. PixiJS v8 + canvas source is NOT a one-liner
The "obvious" path `Texture.from(canvas)` silently fails at GPU upload — the canvas is in the stage tree but never paints. The reliable v8 path for runtime-drawn canvases is: `canvas.toBlob → URL.createObjectURL → new Image() → Texture.from(img)`. PixiJS' `ImageSource` path then properly decodes and uploads. Discovered via real-browser audit (curl/SSR couldn't catch it).

### 9. Two-effect ordering race with async init
`app.init()` is async, so a *second* `useEffect` that reads `slotsRef.current` will see `[]` on first render and short-circuit. Combined the boot effect, the ticker subscription, the initial paint, and the store subscription into one sequential effect that runs after `await app.init()`. Cleaned up via `slotUnsubRef` for the store subscription.

### 10. WebGL canvas + `preserveDrawingBuffer: false` is invisible to `toDataURL`
The default `preserveDrawingBuffer: false` means `toDataURL()` reads the cleared back buffer. Any automated screenshot test that uses `toDataURL` will see a blank canvas even when the scene is rendered correctly. Set `preserveDrawingBuffer: true` for the pixel office — there's no perf cost for a 720x360 scene.

### 11. WebGL2 needs explicit background — `backgroundAlpha: 0` + WebGL compositing
With `backgroundAlpha: 0` and `preserveDrawingBuffer: true`, the canvas is *transparent*, so anything behind it (the host div's `background: '#1a1f2c'`) shows through. With `preserveDrawingBuffer: false`, `toDataURL` reads cleared buffer (transparent). The cleanest setup is `background: 0x1a1f2c` + `preserveDrawingBuffer: true` so the canvas itself is the visible scene and is also screenshot-friendly.

---

## Files Added / Modified

```text
apps/web/package.json                                 (+ pixi.js@^8)
apps/web/pnpm-lock.yaml                               (regen)
apps/web/src/app/offices/[id]/page.tsx                (Phase 8 embed)
apps/web/src/components/pixel-office/
  ├── event-to-state.ts
  ├── event-to-state.test.ts          (11 tests)
  ├── sprite-styling.ts
  ├── sprite-styling.test.ts          (7 tests)
  ├── sprite-canvas.ts
  ├── pixel-office-scene.tsx          (PixiJS v8 client component)
  └── pixel-office.tsx                (React wrapper, dynamic import)

apps/orchestrator/src/runner.ts                       (agentRefOverride)
packages/agents/src/loop.ts                           (agentRefOverride)
```

---

## Known Deferred Work

Not in Phase 8:
- Task detail view (artifacts + full activity log) — Phase 9.
- Office dashboard task history — Phase 9.
- Loading / empty / error states on the office page — partially done (empty-agents placeholder added); other states in Phase 9.
- Responsive layout / mobile pass — Phase 9.
- Regression test for the `agentRef` invariant — Phase 9 candidate.
- Real tileset / animated sprite sheets — Phase 9+ polish, post-MVP.
- Per-desk speech bubbles for the LLM output (currently just a generic `>` icon) — Phase 9+.

## Next Phase — Phase 9 Output Review & Polish

Recommended starting prompt:

```text
lanjut phase 9 openoffice. baca .sisyphus/sessions/2026-06-10-phase8-complete.md dulu
```

Phase 9 scope from `plan.md`:
- Task detail view: artifacts (type/name/content), full activity log.
- Office dashboard task history.
- Loading / empty / error states; basic responsive layout.

---

## Post-Phase-8 Hardening (Real-Browser Audit)

A real-browser audit (driving the live Next.js + orchestrator through a headless browser, capturing actual canvas screenshots) caught **three runtime bugs** that the curl smoke test could not. The audit found them by signing up a fresh user, creating an office, navigating to the detail page, and inspecting what the browser actually painted.

### Bug A — Two-effect ordering race crashed the app

**Symptom**: A Next.js Runtime TypeError dialog appeared in the browser: `app.ticker.add` is not a function. The second `useEffect` (the ticker loop) ran *before* `app.init()` resolved, so `app.ticker` did not exist yet.

**Root cause**: The first effect created `const app = new Application()` and then `await app.init(...)`. The second effect ran synchronously in the same render cycle, immediately tried `app.ticker.add(tick)`, and crashed.

**Fix**: Combined the boot effect, ticker, initial paint, and store subscription into one effect that runs sequentially after `await app.init()`. Cleaned up the store subscription via a new `slotUnsubRef`.

### Bug B — PixiJS v8 silently failed to render Sprite from canvas

**Symptom**: All `Graphics` and `Text` rendered (window, clock, plant, name labels) but no `Sprite` body — sprites never appeared on screen, even though the stage tree showed them. The console showed `init done`, `mounted`, and the store reducer fired correctly.

**Root cause**: PixiJS v8 does **not** accept raw `HTMLCanvasElement` as a `TextureSource.resource` reliably. The texture was created, the sprite was added to the scene graph, the GPU upload silently failed, and nothing was painted. PixiJS emitted no warning.

**Fix**: Round-trip through `Image`. `canvas.toBlob → URL.createObjectURL → new Image() → Texture.from(img)`. This goes through PixiJS' `ImageSource` path, which the v8 uploader handles correctly on every browser.

### Bug C — `toDataURL` returned transparent PNG even when scene was rendered

**Symptom**: Captured canvas screenshots via `toDataURL` came back blank, even after Bug B was fixed. Looked like the scene still wasn't rendering.

**Root cause**: WebGL canvases default to `preserveDrawingBuffer: false`. `toDataURL` reads the cleared back buffer. The scene *was* rendering, but the capture saw a blank.

**Fix**: Set `preserveDrawingBuffer: true` and `background: 0x1a1f2c` on the Application. The canvas itself is now the visible scene and is screenshot-friendly.

### Verification

All three bugs were caught by the real-browser audit and fixed in-place. Re-running the same browser flow after the fixes:

- Signup → auto-login → dashboard ✓
- Browse templates → click "Create office" on Dev Team → 201 with 3 agents ✓
- Office page loads with no error overlay ✓
- "PIXEL OFFICE" section visible, canvas mounted, 720x360 WebGL ✓
- All 3 sprites visible: Planner (purple), Coder (red), Reviewer (gray) at desks ✓
- Room renders: floor, wall, plant, clock ✓
- Queue task → 5 events emitted with consistent `agentRef: 0fb4b09f-…` (Planner) ✓
- After task: state rows update to Planner=`done`, Coder=`idle`, Reviewer=`idle` ✓
- Replay after task: 5 events in DB with `0fb4b09f` as agentRef throughout ✓
- No JS errors in console ✓
- `pnpm build` / `pnpm typecheck` / `pnpm test` (132) / `pnpm lint` all green ✓

### New pitfalls added to the list above

- Pitfall #8: PixiJS v8 + canvas source is NOT a one-liner.
- Pitfall #9: Two-effect ordering race with async init.
- Pitfall #10: WebGL `preserveDrawingBuffer: false` makes `toDataURL` see a blank canvas.
- Pitfall #11: WebGL2 needs explicit `background` (or accept transparent canvas with div behind).

---

*Generated: 2026-06-10, end of Phase 8 + post-audit hardening.*
