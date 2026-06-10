# Session Handoff — 2026-06-10 (Phase 10 Complete — MVP DONE)

## Posisi Sekarang

| Phase | Status |
|---|---|
| Phase 0–7 | ✓ |
| Phase 8 — Pixel Office (PixiJS v8) | ✓ fungsional, visual PAUSED (lihat catatan) |
| Phase 9 — Output Review & Polish | ✓ |
| **Phase 10 — E2E Smoke & Hardening** | ✓ SELESAI |

MVP semua fase 0–10 selesai.

## Phase 10 — Apa yang dikerjakan

### 1. E2E Smoke Test (LLM mocked)
`apps/orchestrator/src/e2e-smoke.test.ts` — 6 test, full loop:
register user → create office dari template Dev Team → bikin custom agent + add ke office →
runTask() dengan FakeProvider (NO live LLM) → assert event sequence (4 step, step.start→thinking→output→done,
0 failed) + artifact final-output.txt + tenancy isolation (user lain → null).
Provider di-inject ke runTask, jadi nggak perlu ANTHROPIC_API_KEY (Non-Negotiable Rule #3).

### 2. CI Pipeline
`.github/workflows/ci.yml` — Postgres 16 service, pnpm install, prisma generate + migrate deploy,
seed, build, lint, typecheck, test. Sengaja NO ANTHROPIC_API_KEY (paksa FakeProvider).
DATABASE_URL password di file = `openoffice` (cocok sama service; tool display masking nampilin *** tapi di disk bener).

### 3. Demo Seed Data
`packages/db/src/seed.ts` ditambah demo user + office:
- Login: `demo@openoffice.local` / `demo1234`
- Office: `office-demo-001` "Demo Dev Team" (3 agent snapshot dari Dev Team template)
- Seed sekarang IDEMPOTEN: knowledgeDoc pakai count-guard, templateAgent pakai skipDuplicates,
  demo office pakai existence-check. Re-run aman tanpa error (sebelumnya crash UniqueConstraint).

## Gate (semua hijau, dev server OFF saat build)
- typecheck 9/9
- test 8/8 suites (shared 2, agents 1, db 4, web 7, orchestrator 3) — orchestrator +1 file (E2E)
- lint 8/8
- build 5/5

## Pixel Office — PAUSED (keputusan user)
User minta "biarkan seperti ini dulu" lalu lanjut Phase 10. Status visual:
- FUNGSIONAL: background asli + sprite LimeZu (16×32 frame, grid 56×20), state reducer, event flow, wander system semua jalan.
- BELUM SEMPURNA: posisi duduk + animasi per-state belum pas. AKAR MASALAH: vision tool (aux) NGASIH JAWABAN KEBALIK/INKONSISTEN — terbukti bilang row0 "hadap depan" padahal analisis pixel (deterministik) = row0 hadap BELAKANG (0 px wajah), row3 hadap depan.
- Yang PASTI dari analisis pixel: frame 16×32, row0=UP/punggung (buat duduk), row3=DOWN/wajah. Yang BELUM diketahui: baris mana = walk per arah (rambut pirang bikin heuristik mentok).
- SOLUSI saat lanjut: jangan nebak. Pakai user sebagai juri (mata andal) — bikin inspector page (sudah pernah dibuat, dihapus saat cleanup; bisa dibuat ulang) atau user ketik manual mapping baris→arah+anim.
- File: apps/web/src/components/pixel-office/{pixel-office-scene.tsx, sprite-canvas.ts}. Konstanta tunable di atas scene: DESK_SLOTS, ROAM_WAYPOINTS (sudah diverifikasi di lantai kosong via floor-detection), CHAR_H_FRAC, SPRITE_ANCHOR_Y=0.9, CLIPS.

## Cara jalanin
- `docker compose up -d postgres` (atau container openoffice-db sudah ada)
- DATABASE_URL dari root `.env` (export $(grep DATABASE_URL .env))
- `pnpm --filter @repo/db seed` — templates + demo office
- `pnpm dev` — web :3000 + orchestrator :3001
- PITFALL KRITIS: JANGAN `pnpm build`/`typecheck`/`test` (yang trigger build) sambil `pnpm dev` jalan — build nimpa apps/web/.next → dev server 500 (Cannot find module './XXX.js'). Fix: kill dev, rm -rf apps/web/.next, restart. Selalu matikan dev server dulu sebelum gate.
- Test DB-backed butuh DATABASE_URL di env.

## Sisa (opsional, post-MVP)
- Pixel office visual polish (butuh ground-truth mapping baris dari user)
- Hapus file char-generator .exe/.zip di apps/web/public/pixel-office/characters/ (tool, bukan asset, ~170MB)
