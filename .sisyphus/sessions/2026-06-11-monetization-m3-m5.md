# Session Handoff — 2026-06-11 (Monetization M3→M5 COMPLETE)

## Posisi Sekarang
**Monetization M0–M5 SEMUA SELESAI & verified.** Full SaaS billing system live.
Spec: docs/MONETIZATION.md. Plan: docs/MONETIZATION_PLAN.md.
Prev handoff: .sisyphus/sessions/2026-06-11-monetization-m0-m2.md (M0-M2 detail).

## Model Bisnis (final)
Subscription buka kapabilitas. Credit bayar compute AGENT KITA (platform agent ownerId=null di key kita). Task UNLIMITED. BYOK/agent sendiri = 0 credit.
Free 500cr(~20task)/Pro $15(5000)/Team $49(20000 pooled). Billing: Lemon Squeezy.

## M3 — Entitlements + Billing (DONE)
- packages/db/src/entitlements.ts (@repo/db/entitlements): PLAN_LIMITS (FREE maxOffices=2/no full-builder; PRO unlimited/5000cr; TEAM unlimited/multi-member/priority/20000cr). getPlan, getLimits, canCreateOffice, canUseFullAgentBuilder, getEntitlements.
- credits.ts: refreshGrantIfDue (lazy-on-read di getBalance) — refill granted ke jatah plan kalau grantResetAt lewat, purchased nggak disentuh.
- packages/db/src/billing.ts (@repo/db/billing): activateSubscription (set plan+grantMonthly), markPastDue, cancelSubscription(→FREE), fulfillCreditPack(idempotent via orderRef), refundCredits.
- /api/offices POST: enforce canCreateOffice → 402 + upgradeTo kalau lewat limit.
- /api/billing/webhook: HMAC-SHA256 verify, variant→plan/pack config-driven (env LEMON_*), user match custom_data.user_id/email.
- Settings page: PLAN card + upgrade buttons (config-driven checkout), CREDITS cards, USAGE dashboard, USAGE HISTORY (ledger), BYOK manager.

## M4 — Team tier (DONE)
- POOLED CREDITS: runner sudah bill office.ownerId → Team pool otomatis benar (member's run debit owner pool).
- SHARED OFFICE: getOfficeById/listUserOffices sudah scope by membership; /api/tasks pakai membership (bukan owner-only) → member bisa run.
- packages/db/src/members.ts (@repo/db/members): addOfficeMember (Team-owner only, by email), removeOfficeMember, listOfficeMembers. Errors: NotTeamPlanError/NotOfficeOwnerError/UserNotFoundError.
- /api/offices/[id]/members route (GET/POST/DELETE).
- PRIORITY QUEUE: Task.priority (Team=10 set di /api/tasks based on OWNER plan), dequeueTask orderBy [priority desc, createdAt asc].
- UI: apps/web/src/app/offices/[id]/team-members.tsx panel — hanya muncul kalau viewer=owner & plan=TEAM.

## M5 — Polish (DONE)
- LOW-CREDIT BANNER: apps/web/src/components/credit-warning.tsx — <50 warn, =0 hard "out of credits" + Add key/Top up. Hidden kalau BYOK. Dipasang di office page top (bill office owner pool, skip kalau BYOK). VERIFIED: balance 0 → banner muncul.
- USAGE DASHBOARD: credits.ts getUsageSummary (totalSpent/spentLast30d/agentRuns) → Settings USAGE cards. VERIFIED live (3 runs).
- IDEMPOTENT WEBHOOK: fulfillCreditPack(orderRef) cek ledger agentRef='order:<id>' → skip replay. Webhook pass evt.data.id.
- REFUND: refundCredits (purchased first, never negative).
- E2E: apps/orchestrator/src/credit-lifecycle.test.ts — signup 500→run debit→drain 0→blocked(0 LLM call)→BYOK→free. 4 test.

## Gate (HIJAU)
typecheck 9/9, test 8/8 suites, lint 8/8, build 5/5.
Counts: db 63, web 53, orchestrator 26.
New test files: db/{entitlements,billing,members}.test.ts, orchestrator/{priority-queue,credit-lifecycle}.test.ts. Updated: web tasks/route.test.ts + offices/route.test.ts (mock entitlements).

## PITFALL kritis (dari sesi ini)
1. **Docker Desktop bisa mati** → Postgres down → orchestrator crash "Can't reach DB ::1:5432". Fix: nyalain Docker (powershell Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'), `docker start openoffice-db`. `docker compose up` ke-block sama tool guard — pakai `docker start`.
2. **Dev daemon racing test DB**: priority-queue/credit test bisa gagal kalau dev orchestrator jalan (dequeue tasks test). SELALU kill dev sebelum gate.
3. **Vitest mock**: kalau route import subpath @repo/db baru, test yang vi.mock('@repo/db') HARUS juga mock subpath itu (@repo/db/entitlements dll) atau "Cannot find module".
4. **turbo passThroughEnv**: test butuh DATABASE_URL + KEY_ENCRYPTION_SECRET di turbo.json passThroughEnv (sudah ada).
5. **/api/tasks officeId**: validasi DILONGGARKAN dari .uuid() ke string (office demo id = slug 'office-demo-001', bukan UUID). Tenancy dijaga membership check.

## Cara Resume
1. Docker Desktop ON → `docker start openoffice-db` (tunggu healthy).
2. `cd /d/vibecoding/openoffice && pnpm dev`. Login demo@openoffice.local/demo1234.
3. Settings: http://localhost:3000/settings. Office: /offices/office-demo-001.
4. Demo balance saat ini = 497.

## ENV (opsional, buat aktifin billing nyata)
.env + apps/web/.env.local (HARUS sinkron KEY_ENCRYPTION_SECRET):
LEMON_WEBHOOK_SECRET, LEMON_VARIANT_PRO/TEAM/PACK_SMALL/MED/LARGE, LEMON_CHECKOUT_PRO/TEAM/PACK_MED.
Tanpa ini: webhook 503, upgrade buttons hidden, UI tetap jalan.

## SISA / NEXT
- Monetization SELESAI total (M0-M5). Tinggal: bikin akun Lemon Squeezy + isi env + bikin produk/variant.
- BELUM commit ke git (oh-my-office). .env JANGAN ke-commit.
- Pixel office visual masih PAUSED (fungsional OK, posisi/animasi belum sempurna).
- Belum ada: onboarding modal interaktif (cuma copy di settings), real cron buat grant refresh (pakai lazy-on-read, cukup).
