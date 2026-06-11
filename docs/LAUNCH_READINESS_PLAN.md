# Launch Readiness Plan — Prototype → Launchable (Phase L1–L10)

Companion to plan.md / MONETIZATION_PLAN.md / GAP_BUILD_PLAN.md. This takes the
feature-complete prototype to a product that lives on the internet and can be
used safely by strangers who pay money.

Status legend: 🔴 blocker (blocks launch) · 🟡 required for trust/ops · 🟢 polish.

Guiding principle: ship the SMALLEST thing that is real, then harden. Don't
gold-plate before it's deployed. Each phase has a verification gate.

Current baseline (what's true today):
- All features work locally via `pnpm dev`. NOT committed to git. No hosting.
- Orchestrator = single-worker DB poller (one global task at a time).
- Workspace = local filesystem (web + orchestrator assumed same machine).
- No resource limits on agent execution. Path guard only.
- Billing code ready; no Lemon Squeezy account/env.
- No email, no legal pages, no landing page, no error tracking, no DB backups.
- Postgres in local Docker.

═══════════════════════════════════════════════════════════════════════════
PART A — 🔴 BLOCKERS (must clear before any public launch)
═══════════════════════════════════════════════════════════════════════════

## L1 — Source control + CI/CD foundation
Goal: code is versioned, pushed, and every push is verified.
- [ ] Commit current state to git; push to github.com/itsmepure/oh-my-office.
      Ensure .env / .env.local / workspaces/ are gitignored (audit first).
- [ ] Confirm CI (.github/workflows/ci.yml) runs green on the pushed repo
      (Postgres service + KEY_ENCRYPTION_SECRET already wired).
- [ ] Add a production env template (.env.example) documenting every var:
      DATABASE_URL, AUTH_SECRET, KEY_ENCRYPTION_SECRET, LLM_*, LEMON_*.
- [ ] Branch protection on main (PRs + CI pass).
**Gate L1:** repo pushed, CI green, secrets confirmed absent from history.

## L2 — Deploy v1 (make it real on the internet)
Goal: web + orchestrator + DB live at a URL, talking to each other.
Decisions to make (pick before building):
  - Host split: Web on Vercel (Next.js native) + Orchestrator on a long-lived
    host (Railway / Fly.io / Render / small VPS). DB on managed Postgres
    (Neon / Supabase / Railway PG).  ← RECOMMENDED
  - OR everything on one VPS via Docker Compose (simpler ops, less elastic).
- [ ] Provision managed Postgres; run prisma db push + seed against it.
- [ ] Deploy web (Vercel): env vars, build, custom domain later.
- [ ] Deploy orchestrator (Railway/Fly): long-lived process, same DB, env vars
      incl. KEY_ENCRYPTION_SECRET (MUST match web for BYOK decrypt).
- [ ] Wire the WebSocket URL (realtime) for the deployed orchestrator; update
      the token route + client to use the prod WS origin.
- [ ] Smoke test on prod: signup → create office → run task (FakeProvider or a
      cheap real key) → events stream → artifact appears.
**Gate L2:** a stranger can hit the URL, sign up, and run a task end-to-end.

## L3 — Production execution architecture (the deepest rework)
Goal: more than one user can run tasks concurrently, and files survive a
multi-machine deployment.
- [ ] Job claiming: replace naive findFirst+update with atomic claim
      (`UPDATE ... WHERE status='queued' ... RETURNING` or SELECT … FOR UPDATE
      SKIP LOCKED) so N workers don't double-claim. Keep priority ordering.
- [ ] Concurrency: run a small pool (e.g. 3–5 concurrent tasks) with a global
      cap; respect Team priority. Tune to credit/cost budget.
- [ ] Shared workspace storage: move file ops from local disk to object storage
      (S3/R2) OR a shared volume. The path guard + @repo/db/workspace + agent
      tools must all read/write the same backing store. This is the riskiest
      change — design first, write an adapter, keep the guard.
- [ ] Heartbeat + stuck-task reaper that works across workers (current
      reconcileStuckTasks assumes single instance).
**Gate L3:** two users run tasks at the same time; both get their files; no
double-execution; killing a worker mid-task recovers cleanly.

## L4 — Agent execution safety (abuse + cost control)
Goal: an anonymous free user cannot blow up cost or the box.
- [ ] Per-task wall-clock timeout (kill runaway tasks) + max LLM iterations cap
      (already have maxIterations — enforce + surface as failure).
- [ ] Workspace quota: max file size + max total workspace bytes per office;
      reject writes past the limit (in the guarded write path).
- [ ] Per-user concurrent-task cap (e.g. 1 running for FREE, more for paid) on
      top of the existing rate limit.
- [ ] Hard credit pre-check already exists (M1) — verify it triggers before any
      spend under concurrency.
- [ ] Tool allowlist review: ensure no tool can reach network/secrets/host.
**Gate L4:** a deliberately abusive task (huge file, infinite loop, long run) is
contained and billed/blocked correctly.

## L5 — Billing live
Goal: real money in.
- [ ] Create Lemon Squeezy store + products (Pro $15, Team $49, 3 credit packs).
- [ ] Fill env: LEMON_WEBHOOK_SECRET, LEMON_VARIANT_*, LEMON_CHECKOUT_*,
      LEMON_PORTAL_URL (all documented in MONETIZATION.md §7).
- [ ] Point the webhook at the deployed /api/billing/webhook; verify signature
      check passes with a real test event.
- [ ] Test-mode purchase → plan flips, credits granted; pack → credits added;
      cancel → downgrade. (Logic already unit-tested; this is live wiring.)
**Gate L5:** a test-mode checkout upgrades a real account on the deployed app.

═══════════════════════════════════════════════════════════════════════════
PART B — 🟡 TRUST & OPERATIONS (required before charging strangers)
═══════════════════════════════════════════════════════════════════════════

## L6 — Transactional email
Goal: users can recover accounts + get receipts.
Decision: email provider (Resend / Postmark / SES).
- [ ] Wire provider + from-domain (SPF/DKIM).
- [ ] Password reset flow (request → tokenized link → set new password).
- [ ] Email verification on signup (optional gate, recommended for paid).
- [ ] Basic transactional emails: welcome, payment receipt (or rely on Lemon's).
**Gate L6:** forgot-password works end-to-end on prod.

## L7 — Legal + public-facing pages
Goal: a stranger trusts it enough to pay.
- [ ] Public landing page (what it is, the pixel-office hook, CTA to sign up).
- [ ] Public pricing page (Free/Pro/Team + credit model explainer).
- [ ] Terms of Service + Privacy Policy (generated baseline, reviewed).
- [ ] Footer links, contact/support email.
**Gate L7:** logged-out visitor can understand the product, see pricing, read
ToS/Privacy, and sign up.

## L8 — Observability + durability
Goal: when prod breaks, you know; when DB dies, data survives.
- [ ] Error tracking (Sentry) on web + orchestrator.
- [ ] Structured logs + request-id correlation web→orchestrator.
- [ ] Uptime monitoring (health endpoint + external ping) for web + orchestrator
      + WS.
- [ ] Managed Postgres with automated backups + tested restore.
- [ ] Alerts: orchestrator down, queue backing up, error rate spike.
**Gate L8:** trigger a test error → it appears in Sentry; restore a DB backup to
a scratch instance successfully.

═══════════════════════════════════════════════════════════════════════════
PART C — 🟢 POLISH (improves conversion/retention; not launch-blocking)
═══════════════════════════════════════════════════════════════════════════

## L9 — Pixel office polish (signature hook)
- [ ] Calibrate desk positions/facing + idle vs working behavior (user = judge,
      deterministic position math, NOT vision-tool loop).
- [ ] Make it shareable (it's the marketing magnet).
**Gate L9:** user approves the look.

## L10 — Product polish
- [ ] Task-complete notification (in-app toast / unread badge).
- [ ] Deeper usage dashboard (per-office / per-agent / over time).
- [ ] Onboarding refinements based on first real users.
**Gate L10:** no gate — iterate on real feedback.

═══════════════════════════════════════════════════════════════════════════
SEQUENCING & STRATEGY
═══════════════════════════════════════════════════════════════════════════

Critical path to a SOFT launch (paid, small scale):
  L1 → L2 → L3 → L4 → L5 → L6 → L7 → L8   (then L9/L10 in parallel/after)

Fastest path to a PRIVATE BETA (free, invite-only, no payment):
  L1 → L2 → (L3 lite: just concurrency claim + keep single host so local FS
  still works) → L4 → L8 lite (Sentry + backups).  Skip L5/L6/L7 until you
  charge money. This de-risks early — real users on a real URL without the full
  production-architecture lift.  ← RECOMMENDED FIRST MOVE

Biggest risk / most effort: **L3** (shared storage + concurrency). Everything
else is wiring + accounts + content. L3 is genuine design work — do it
deliberately, behind a storage adapter, with the path guard intact.

Cost note: every blocker except L3 is mostly "set up an account + wire env".
L3 + L4 are where real engineering time goes.

OPEN DECISIONS (need user input before L2/L3):
  1. Hosting shape: Vercel+Railway+Neon (elastic) vs single VPS+Compose (simple)?
  2. Storage: object storage (S3/R2) vs shared volume for workspaces?
  3. Launch shape: private free beta first, or straight to paid soft launch?
  4. Domain name?
  5. Email provider preference?
