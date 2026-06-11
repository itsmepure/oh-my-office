# Session Handoff — 2026-06-11 (Monetization M0→M2)

## Posisi Sekarang
Monetization M0–M2 SELESAI & terverifikasi (gate hijau + browser e2e). Lihat
docs/MONETIZATION.md (spec) + docs/MONETIZATION_PLAN.md (M0–M5 plan). M3–M5 belum.

## Model Bisnis (final, disepakati user)
- Subscription buka kapabilitas. Credit bayar compute AGENT KITA. Task UNLIMITED.
- Credit kepotong HANYA saat platform agent (Agent.ownerId=null) jalan di key kita.
- BYOK / agent sendiri = 0 credit.
- Free = 500 credit (~20 task, ~25 credit/task). Pro $15 (5000). Team $49 (20000 pooled).
- Billing: Lemon Squeezy (M3, belum).

## Yang Dibangun M0–M2 (semua VERIFIED)

### M0 — Schema + credit core
- prisma/schema.prisma: enum Plan, model Subscription/CreditBalance/CreditLedger/LlmKey + Task.priority. Applied via `prisma db push` (BUKAN migrate — history lama sqlite; migration_lock.toml sudah diubah ke postgresql).
- packages/db/src/credits.ts (subpath @repo/db/credits): getBalance, reserve, settle, release, grantMonthly, addPurchased, tokensToCredits, canAffordMinStep, InsufficientCreditsError. TOKENS_PER_CREDIT=6000 (env-tunable), MIN_STEP_CREDITS=1. Reserve→settle pattern, grant-before-purchased, never-negative, ledger append. 13 unit test.
- seed.ts: demo user FREE sub + 500 credit (idempotent upsert).

### M1 — Metering di runner
- FakeProvider: tambah optional `usage` di response (buat test token cost).
- apps/orchestrator/src/runner.ts: resolve platform-vs-user per step (lookup Agent.ownerId by snapshot.id). Platform step → reserve(25) sebelum loop → settle(actual tokens) sesudah. User step → 0 credit. Pre-flight guard: kalau ada billable step & owner can't afford min → fail SEBELUM LLM call (task.status failed). Step gagal → release reservation.
- packages/db/src/auth.ts createUser: sekarang grant FREE sub + 500 credit dalam transaksi (signup auto-provision).
- apps/orchestrator/src/credit-metering.test.ts: platform debit / user no-debit / zero-balance blocked (provider.calls===0).

### M2 — BYOK
- packages/db/src/keys.ts (subpath @repo/db/keys): AES-256-GCM encrypt/decrypt (env KEY_ENCRYPTION_SECRET, 64-hex). createLlmKey/listLlmKeys (MASKED: provider/model/last4 only)/deleteLlmKey/resolveOfficeKey (office→account→platform). Pakai findFirst (bukan composite-unique upsert, karena officeId nullable).
- runner.ts: resolveOfficeKey → kalau BYOK, usingPlatformKey=false (0 credit) + build provider dari key (OpenAICompatibleProvider, atau makeByokProvider factory buat test).
- apps/web/src/app/api/keys/route.ts: GET/POST/DELETE, plaintext nggak pernah balik.
- apps/web/src/app/settings/{page.tsx,key-manager.tsx}: credit balance cards + BYOK manager. AppHeader nav +Settings.
- credit-metering.test.ts +1: BYOK office → platform agents 0 credit, factory dipakai.

## Gate (HIJAU)
typecheck 9/9, test 8/8 suites (db 42 +13 credits, orchestrator 21 +4 metering, web 50), lint 8/8, build 5/5.
turbo.json: test task tambah `passThroughEnv` (DATABASE_URL, AUTH_SECRET, KEY_ENCRYPTION_SECRET, LLM_*, TOKENS_PER_CREDIT) — WAJIB, kalau nggak turbo strip env → test BYOK gagal.
.github/workflows/ci.yml: tambah KEY_ENCRYPTION_SECRET (64 nol buat CI).

## Verifikasi browser (e2e, deterministik)
- Settings page render: credit cards (500/0/500), BYOK manager.
- Add key via UI → banner "BYOK active", tampil masked sk-…9999, ciphertext di DB opaque (plaintext nggak bocor).
- Queue task di office BYOK → balance tetap 500, 0 debit ledger (task failed krn key dummy — expected; dengan key asli sukses & tetap 0 credit).

## ENV penting
- .env (root, orchestrator): KEY_ENCRYPTION_SECRET=*** (64 hex), LLM_API_KEY (DeepSeek), LLM_MODEL=deepseek-v4-pro, DATABASE_URL, AUTH_SECRET.
- apps/web/.env.local: HARUS punya KEY_ENCRYPTION_SECRET yang SAMA dgn root .env (web encrypt, orchestrator decrypt — beda key = decrypt gagal). DATABASE_URL + AUTH_SECRET juga di sini.
- JANGAN tulis secret via heredoc (masking ngerusak); pakai write_file ke tmp lalu grep-append, atau grep dari .env.

## Cara Resume
1. `cd /d/vibecoding/openoffice && pnpm dev` (web :3000 + orchestrator :3001).
2. Login demo@openoffice.local / demo1234. Settings: http://localhost:3000/settings.
3. PITFALL: jangan build/typecheck/test sambil dev jalan (nimpa .next→500); kill dev + rm -rf apps/web/.next dulu.
4. PITFALL: orchestrator tsx-watch sering kena "port 3001 in use" → daemon poll mati. Kalau task nyangkut queued, kill semua 3000+3001 + restart. Cek poll hidup: grep "Polling for queued" di log.
5. Test DB butuh export DATABASE_URL + KEY_ENCRYPTION_SECRET.

## NEXT (M3–M5)
- M3: entitlements (office limit FREE=2, agent-builder PRO+) + Lemon Squeezy checkout + webhook (set Plan + grantMonthly) + monthly grant refresh + billing UI.
- M4: Team tier (pooled credits, shared office via OfficeMembership, priority queue via Task.priority + dequeue order).
- M5: low-credit warnings, usage dashboard, onboarding, E2E credit lifecycle.
- BELUM commit ke git (oh-my-office). .env JANGAN ke-commit.
- Pixel office visual masih PAUSED.

## File Kunci
- prisma/schema.prisma, prisma/migrations/migration_lock.toml
- packages/db/src/{credits.ts, keys.ts, auth.ts, seed.ts, credits.test.ts}
- apps/orchestrator/src/{runner.ts, credit-metering.test.ts, e2e-smoke.test.ts}
- packages/agents/src/provider.ts (FakeProvider usage)
- apps/web/src/app/api/keys/route.ts, apps/web/src/app/settings/{page,key-manager}.tsx
- apps/web/src/components/chrome/app-header.tsx (+Settings nav)
- turbo.json (passThroughEnv), .github/workflows/ci.yml
