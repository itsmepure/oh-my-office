# Session Handoff — 2026-06-10 (Phase 8 Rebuild / Hardening)

## Tujuan

Sebelum lanjut Phase 9, rebuild Phase 8 (Pixel Office) sampai "professional ready" —
bukan nambah fitur, tapi nutup defect correctness/robustness yang lolos dari verifikasi
sebelumnya. Bukti nyata only: DB SELECT, real-browser audit, console errors.

## Baseline saat mulai

```
typecheck  9/9
test       132 (web 50)
lint       8/8
build      5/5
Postgres   openoffice-db healthy
```

Semua hijau, tapi baca-kode ngungkap 5 defect nyata + 1 robustness bug.

---

## Defect yang diperbaiki

### 1. Dua reducer saling bertentangan (correctness bug)

- `reduceEventsToAgentStates` (event-to-state.ts) — kanonik, dipakai pixel scene.
- `deriveAgentStates` (realtime-store.ts) — dipakai activity-feed, **SALAH**:
  - `agent.output` dimap ke `done` (padahal agent masih kerja → harusnya `working`)
  - `step.start` diabaikan total (agent yang baru mulai nggak keliatan `working`)
- Akibat: feed & pixel office bisa nampilin state beda untuk agent yang sama.
- **Fix**: hapus `deriveAgentStates` + type `AgentVisualState` lokal dari realtime-store.
  Activity-feed sekarang pakai `reduceEventsToAgentStates(...).byAgent` (single source of truth).
  Hapus blok test `describe('deriveAgentStates')` (2 test buggy) — coverage state-mapping
  sudah lebih lengkap di event-to-state.test.ts. Net: web 50 → 48 test.

Files:
- `apps/web/src/lib/realtime-store.ts`
- `apps/web/src/app/offices/[id]/activity-feed.tsx`
- `apps/web/src/lib/realtime-store.test.ts`

### 2. `layoutDesks` ignore prop `height`

- Pakai `heightHint()` hardcoded `360`. Kalau scene di-render dengan height lain,
  posisi desk salah (ketinggian agent dihitung dari 360, bukan height asli).
- **Fix**: `layoutDesks(agentCount, width, height)` — terima height, hapus `heightHint()`.

File: `apps/web/src/components/pixel-office/pixel-office-scene.tsx`

### 3. `renderSprite` — async race + texture leak

- `canvas.toBlob` async; rapid state flip A→B→A bikin callback resolve nggak urut →
  sprite bisa mendarat di state lama.
- `Texture.from(img)` bikin texture baru tiap ganti state TANPA destroy yang lama →
  GPU memory leak selama task panjang (satu texture bocor per transisi state).
- **Fix**:
  - `SpriteSlot.renderToken` (monotonic). `cachedState` di-set sinkron di awal, token
    di-claim. Callback `toBlob`/`img.onload` cek `token !== slot.renderToken` → drop stale.
  - `SpriteSlot.texture` disimpan; texture lama `.destroy(true)` sebelum mount yang baru.

File: `apps/web/src/components/pixel-office/pixel-office-scene.tsx`

### 4. Dead imports + cast jelek + debug log

- `RealtimeEventRecord` & `AgentStateSnapshot` di-import tapi nggak kepake.
- `style.body as unknown as number` — hack cast (style.body sudah number).
- `let bootstrapError` di-set tapi nggak pernah dibaca (dead var).
- `console.log('[pixi] init done', ...)` nyampah ke console (4x per load).
- 2 komentar stale sisa refactor effect.
- **Fix**: semua dibersihkan. Init failure sekarang `console.error('[pixel-office] PixiJS init failed', err)`.

File: `apps/web/src/components/pixel-office/pixel-office-scene.tsx`

### 5. Regression test invariant `agentRef` (Pitfall #3 handoff lama)

Handoff Phase 8 nge-flag: bug `agentRef` mismatch lolos dari test, baru ketahuan pas
manual smoke. Sekarang ada guard-nya di `packages/agents`:
- `defaults agentRef to the agent display name when no override is given`
- `uses agentRefOverride on EVERY emitted event (cross-event invariant)` —
  set `agentRefOverride` ≠ display name, pastikan SEMUA event (thinking/tool_call/output)
  pakai override ref, bukan nama. Net: agents 16 → 18 test.

File: `packages/agents/src/index.test.ts`

### 6. BONUS — orchestrator WS EADDRINUSE crash (robustness)

Ketemu pas baca dev log: pas tsx hot-restart orchestrator (file db berubah), proses lama
belum lepas port 3001 → proses baru emit **unhandled 'error' event** → SELURUH daemon crash
dengan stack trace, karena `WebSocketServer` nggak punya `'error'` listener.

- **Fix**: tambah `wss.on('error', ...)` — kalau `EADDRINUSE`, log pesan jelas & `process.exit(1)`
  biar supervisor (tsx watch / pm2 / systemd) restart bersih pas port lepas.
- **Bukti fix bekerja live** (dari oo-dev2.log):
  ```
  [realtime] WebSocket server listening on port 3001
  [realtime] Port 3001 already in use — another orchestrator instance is still bound. Exiting so the supervisor can retry.
  ```
  Instance kedua exit anggun, instance pertama tetap LISTENING. Sebelumnya: stack trace + daemon mati.

File: `apps/orchestrator/src/realtime.ts`

---

## Verifikasi Final — SEMUA HIJAU

```
typecheck  9/9
test       132  (shared 31, db 24, agents 18, orchestrator 11, web 48)
lint       8/8
build      5/5
```

Catatan test count: web 50→48 (hapus 2 test deriveAgentStates buggy), agents 16→18
(+2 regression agentRef). Net total tetap 132.

## Real-Browser Audit — PASSED (server fresh)

Lingkungan: web :3000, orchestrator :3001, ANTHROPIC_API_KEY unset (task fail di thinking, intentional).

1. Signup → auto-login → dashboard ✓
2. Browse templates → Dev Team → create office `856c79a4-…` dengan 3 agent snapshot ✓
3. Office page load, **0 JS errors** di console ✓
4. Canvas 720×360 mounted, **3 sprite kerender** (vision-confirmed):
   Planner (merah), Coder (abu), Reviewer (teal), name labels di canvas, room lengkap
   (wall, floor, rug, window, clock, plant) ✓
5. Queue task → state transition live: Planner `idle→done`, Coder/Reviewer `idle` ✓
6. **DB ground-truth = UI** (invariant agentRef):
   ```
   task.status    |
   step.start     | c536a2aa
   agent.thinking | c536a2aa
   step.failed    | c536a2aa
   task.status    |
   ```
   Semua event 1 step share agentRef yang sama (UUID OfficeAgent), task.status tanpa ref ✓
7. Refresh → replay rebuild dari DB: Planner=done, Coder/Reviewer=idle, feed reconnect ✓

### Catatan penting: build-vs-dev `.next` collision

`pnpm build` SAAT `pnpm dev` jalan akan nimpa `apps/web/.next` → dev server kena
`Cannot find module './XXX.js'` (chunk webpack korup) → 500 di route. **Bukan defect kode.**
Fix: kill dev, `rm -rf apps/web/.next`, restart dev. Jangan `pnpm build` sambil dev jalan.
(Empty js_error yang sempat keliatan di audit pertama itu artifact ini, hilang di server fresh.)

---

## Files Modified

```
apps/web/src/lib/realtime-store.ts                       (hapus deriveAgentStates + type)
apps/web/src/lib/realtime-store.test.ts                  (hapus 2 test buggy)
apps/web/src/app/offices/[id]/activity-feed.tsx          (pakai reducer kanonik)
apps/web/src/components/pixel-office/pixel-office-scene.tsx  (height, race+leak fix, cleanup)
packages/agents/src/index.test.ts                        (+2 regression agentRef)
apps/orchestrator/src/realtime.ts                        (WS error handler / EADDRINUSE)
```

Tidak ada perubahan schema, API, atau dependency. Pure correctness/robustness hardening.

---

## Phase 9 NEXT — Output Review & Polish

Scope dari plan.md:
- Task detail view: artifacts (type/name/content), full activity log.
- Office dashboard task history.
- Loading / empty / error states; basic responsive layout.

Recommended starting prompt:
```
lanjut phase 9 openoffice. baca .sisyphus/sessions/2026-06-10-phase8-rebuild.md dulu
```

### Catatan untuk Phase 9
- DB ada banyak template sampah dari sesi test lama (AB, C1, T, T2, Snap, dst) — seed asli
  cuma Dev Team / Research Team / Content Team. Kalau ganggu, pertimbangkan reset+reseed,
  TAPI itu di luar scope Phase 8.
- Office test yang dipakai audit: `856c79a4-97f2-47e5-9155-42d759ea68b1` (user p8rebuild_…).

---

*Generated: 2026-06-10, Phase 8 rebuild/hardening.*
