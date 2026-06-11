# Monetization Implementation Plan — OpenOffice

Companion to `docs/MONETIZATION.md`. Phased, each phase has a verification gate.
Build order minimizes risk: metering core first (so we never lose money), then
BYOK (so users can escape credits), then plans/billing, then Team.

Conventions: follow existing repo patterns. All credit logic in one module.
No live LLM in CI (FakeProvider). Kill `pnpm dev` before any build/typecheck/test.

---

## Phase M0 — Schema + credit core (foundation)

Goal: DB tables + a single credit module. No UI yet.

- [ ] Prisma: add `Plan` enum, `Subscription`, `CreditBalance`, `CreditLedger`,
      `LlmKey` models; add `priority Int @default(0)` to `Task`. Migrate.
- [ ] Seed: give demo user a FREE `Subscription` + `CreditBalance` (granted=500,
      grantResetAt = now+30d). Make seed idempotent.
- [ ] `packages/db/src/credits.ts`:
      - `getBalance(userId)` → { granted, purchased, total }
      - `reserve(userId, estimateCredits)` → reservation id | throws InsufficientCredits
      - `settle(reservationId, actualCredits)` (adjust grant→purchased order)
      - `grantMonthly(userId, amount)` / `addPurchased(userId, amount)`
      - `tokensToCredits(input, output)` using TOKENS_PER_CREDIT from config
      - every mutation writes a `CreditLedger` row, all in one tx
- [ ] Unit tests: spend order (grant before purchased), insufficient → throw,
      reserve/settle math, ledger append, never-negative invariant.

**Gate M0:** typecheck + tests green; `getBalance` returns 500 for demo user.

---

## Phase M1 — Wire metering into the run pipeline (the money path)

Goal: platform-agent steps burn credits; user/BYOK steps don't. Tasks stay
unlimited.

- [ ] Provider already returns `usage {input, output}` — ensure both providers
      populate it (Anthropic + OpenAICompatible). Add to FakeProvider for tests.
- [ ] `apps/orchestrator/src/runner.ts`, per step:
      - resolve effective key for the office (office BYOK → account BYOK → platform)
      - if step agent `ownerId == null` AND key is platform → `reserve()` worst-case
        before LLM call; after call `settle()` with real tokens; write ledger
      - else → 0 credits (skip metering)
- [ ] Pre-task / pre-step guard: if platform key + balance can't cover the
      minimum step → emit `step.failed` (reason: "out_of_credits") and
      `task.status: failed`; do NOT call the LLM. (Task still "ran", just stopped.)
- [ ] Integration test (FakeProvider with fake usage): platform agent debits
      correct credits; BYOK office debits 0; zero-balance platform task is
      rejected before any provider call.

**Gate M1:** run-task integration tests prove correct debit/no-debit/blocked.
Manual: demo task drops balance ~25; BYOK task leaves balance unchanged.

---

## Phase M2 — BYOK (bring your own key)

Goal: users attach their own LLM key → their offices stop burning credits.

- [ ] AES-GCM encrypt/decrypt util (key from env `KEY_ENCRYPTION_SECRET`).
- [ ] DB: `createLlmKey`, `listLlmKeys` (return masked: provider/model/last4 only),
      `deleteLlmKey`, `resolveOfficeKey(officeId)` (office → account → platform).
- [ ] API routes (server-only): POST/GET/DELETE `/api/keys`; never return plaintext.
- [ ] Settings UI page: add/remove key, choose provider/model, set as
      account-default or per-office. Show "BYOK active → tasks free" banner.
- [ ] Orchestrator uses `resolveOfficeKey` to pick provider + key per task.

**Gate M2:** add a BYOK key in UI → run task → ledger shows 0 debit, task uses
the BYOK key (verify via orchestrator log + DB). Key never appears in browser.

---

## Phase M3 — Plans, entitlements, billing

Goal: enforce tier limits + take money.

- [ ] Entitlements module: `can(userId, "create_office")`, office-count limit
      (FREE=2), agent-builder-full (PRO+), etc. Enforce server-side in the
      relevant API routes + show in UI (disabled states, upgrade prompts).
- [ ] Lemon Squeezy: products (Pro $15, Team $49, credit packs). Checkout links.
- [ ] Webhook `/api/billing/webhook`: on subscription create/renew → set Plan +
      `grantMonthly`; on pack purchase → `addPurchased`; on cancel/past_due →
      downgrade entitlements at period end.
- [ ] Monthly grant refresh job (cron or lazy-on-read: if now > grantResetAt,
      reset granted to plan amount, bump grantResetAt +30d).
- [ ] Billing UI: current plan, credit balance + usage history (from ledger),
      upgrade/manage buttons, buy credit pack.

**Gate M3:** test-mode checkout → webhook flips FREE→PRO, grants 5,000 credits;
office-count limit blocks 3rd office on FREE with upgrade prompt.

---

## Phase M4 — Team tier

Goal: multi-member, shared office, pooled credits, priority queue.

- [ ] Team = org owner holds Subscription + pooled CreditBalance; members linked
      via existing `OfficeMembership`. Member's platform-agent steps debit the
      org pool.
- [ ] Invite flow (email/link), seat management, per-seat billing line.
- [ ] Shared office: members see/run the same office (tenancy already supports
      membership; relax owner-only checks to member-allowed where appropriate).
- [ ] Priority queue: `dequeueTask` orders by `priority DESC, createdAt ASC`;
      Team offices enqueue with priority=10.
- [ ] Tests: pooled debit across members; tenancy still blocks non-members;
      priority ordering.

**Gate M4:** two members in one Team office both run tasks → org pool debits
correctly; non-member blocked; Team task dequeues before Free task.

---

## Phase M5 — Polish + launch readiness

- [ ] Low-credit warnings (banner at <50, modal at 0 with BYOK/topup CTA).
- [ ] Usage dashboard: credits over time, per-office, per-agent (from ledger).
- [ ] Onboarding: explain "tasks free, our agents cost credits, BYOK = free".
- [ ] Idempotent webhook handling (replay-safe), refund path → ledger.
- [ ] Full gate + E2E smoke (mocked LLM): signup → free 500 → run → debit →
      hit 0 → add BYOK → run free.

**Gate M5:** full gate green; E2E covers the whole credit lifecycle.

---

## Risk notes / sequencing rationale

- **M0+M1 first** = we can never lose money once metering is live, even before
  billing exists (free users are capped at 500).
- **M2 before M3** = BYOK is the pressure valve; ship it before asking for money
  so the "out of credits" wall always has a free escape hatch.
- **M3 before M4** = single-user paid must work before multi-seat complexity.
- Reuse what exists: provider interface (BYOK injection), job queue (priority
  column), `OfficeMembership` (Team), event/ledger pattern (credit audit).
- Keep `TOKENS_PER_CREDIT` and pack prices in config — tune after observing real
  DeepSeek token usage in production, don't hardcode assumptions.
