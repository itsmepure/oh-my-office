# Build Plan — Closing the Gaps (Phase G1–G7)

Companion to plan.md + MONETIZATION_PLAN.md. This closes the product gaps found
in the end-to-end flow audit (2026-06-11). Phased, each phase has a verification
gate. Build order: highest user-impact + lowest risk first.

Conventions (carry over): kill `pnpm dev` before build/test; export
DATABASE_URL + KEY_ENCRYPTION_SECRET for DB tests; all cross-process payloads via
@repo/shared Zod; path guard on every workspace file op; multi-tenant scoping on
every query; no live LLM in CI (FakeProvider). Docker must be running (Postgres).

Audit baseline (what already EXISTS — do NOT rebuild):
- Task detail page renders artifacts (inline content + fileRef path) + activity log.
- Artifact rows show content in <pre> OR fileRef as plain text — but NO download.
- No workspace file listing/download anywhere.
- Office: only members DELETE exists. No office delete/rename.
- Agent builder uses knowledge docs but is NOT gated by canUseFullAgentBuilder.
- No onboarding. Checkout buttons exist but don't pass custom_data.user_id.

---

## Phase G1 — Task output: view + download (🔴 highest impact)

Goal: a user can SEE and DOWNLOAD everything a task produced — both DB artifacts
(text/code) and real files written into the office workspace.

- [ ] DB: `listWorkspaceFiles(officeId, userId)` in a new `@repo/db/workspace`
      module — tenant-scoped (membership check) → returns the office's
      workspacePath file tree (name, relPath, size, mtime). Uses the SAME path
      guard as the agent tools (no escape outside workspaceRoot).
- [ ] API `GET /api/offices/[id]/files` → list files (masked to relPath).
- [ ] API `GET /api/offices/[id]/files/download?path=` → stream a single file
      with the path guard; `Content-Disposition: attachment`. 403 on escape.
- [ ] API `GET /api/offices/[id]/files/zip` → zip the whole workspace, stream it
      (use node:zlib + a tar/zip lib already in deps, else archiver).
- [ ] Artifact download: `GET /api/tasks/[taskId]/artifacts/[artifactId]/download`
      → for inline content, return as a text file; for fileRef, stream the file.
- [ ] UI (task detail): add a Download button per artifact + "Download all" .
- [ ] UI (office page): a "Files" panel (or tab) listing workspace files with
      per-file download + "Download workspace (.zip)".
- [ ] Tests: path-guard escape rejected; list scoped to office; tenancy (non-member
      gets 404); download returns correct bytes.

**Gate G1:** run a task that writes a file → it appears in the Files panel →
download returns the exact bytes; non-member blocked; path escape rejected.

---

## Phase G2 — Office lifecycle: rename + delete (🔴)

Goal: users manage their offices (critical when FREE caps at 2).

- [ ] DB: `renameOffice(officeId, userId, name)` (owner-only),
      `deleteOffice(officeId, userId)` (owner-only) — cascade tasks/events/
      artifacts/officeAgents/memberships + remove the workspace folder on disk.
- [ ] API `PATCH /api/offices/[id]` (rename), `DELETE /api/offices/[id]` (delete).
- [ ] UI: office page header → rename (inline edit) + delete (confirm modal).
      Dashboard card → quick delete (confirm). After delete → redirect dashboard.
- [ ] Tenancy + tests: only owner can rename/delete; members cannot; FREE user
      who deletes an office can then create again (count drops).

**Gate G2:** rename persists; delete removes office + workspace folder + frees a
slot; non-owner blocked.

---

## Phase G3 — Entitlement enforcement everywhere (🟡 ties to monetize)

Goal: plan limits enforced consistently server-side + reflected in UI.

- [ ] Gate full agent builder: `canUseFullAgentBuilder` in the agent create/edit
      API (FREE → block knowledge docs + advanced fields, 402). Mirror in UI:
      knowledge-doc section disabled + "Pro feature" upsell for FREE.
- [ ] Dashboard: show office count vs limit ("1 / 2 offices") + disabled "New
      office" with upgrade prompt when at cap (currently only API 402s).
- [ ] Audit every mutating route for the right gate; add where missing.
- [ ] Tests: FREE blocked on knowledge docs; PRO allowed; UI disabled states.

**Gate G3:** FREE user cannot create knowledge docs (API + UI); at-cap FREE sees
disabled create + upgrade path; PRO unrestricted.

---

## Phase G4 — Onboarding + first-run guidance (🔴 ties to monetize)

Goal: a new user understands credits/BYOK/how-to-start within seconds.

- [ ] Post-signup welcome screen (or dashboard banner for users with 0 tasks):
      explains "tasks are unlimited, our agents cost credits, BYOK = free",
      with 3 quick actions: create office from template / add BYOK key / run a
      sample task. Dismissible (persist dismissed flag on User or localStorage).
- [ ] Empty states nudge the next action (dashboard → "Create your first office",
      agents → "Build an agent or use ours").
- [ ] A short "How credits work" link in the credit cards → Settings explainer.
- [ ] Test: new user sees onboarding; dismiss persists; returning user skips.

**Gate G4:** fresh signup lands on a guided screen; dismiss sticks; existing
users unaffected.

---

## Phase G5 — Checkout wiring completeness (🟡 monetize)

Goal: the paid path works end-to-end once Lemon keys are set.

- [ ] Pass `checkout[custom][user_id]` (and prefilled email) on every checkout
      link via a server helper that builds the URL from env + session user id.
      Webhook already reads custom_data.user_id — this closes the match gap.
- [ ] Billing portal link (Lemon customer portal) on Settings for managing/
      cancelling a subscription (env LEMON_PORTAL or per-sub URL from webhook).
- [ ] "Buy credits" buttons for all 3 packs (small/med/large), not just med.
- [ ] Document the full env set + Lemon product/variant setup in MONETIZATION.md.
- [ ] Test: checkout URL builder injects user_id + email; missing env → button
      hidden (graceful).

**Gate G5:** checkout URL contains the user id; webhook (already tested) maps it;
buttons render only when configured.

---

## Phase G6 — Pixel office visual polish (🟡 signature feature, was PAUSED)

Goal: bring the signature visualization to a presentable bar.

- [ ] Fix sitting position / facing (use the Python-composite ground truth, NOT
      vision) — agents sit at desks facing monitors when working.
- [ ] idle = subtle wander/idle anim; working = seated + working anim; done →
      idle. Map from the reducer states already wired.
- [ ] Verify deterministically (frame math + computed positions), user = judge.
- [ ] No test gate (visual) — user approval gate instead.

**Gate G6:** user approves the pixel office look (judge), no regressions in the
event→sprite reducer tests.

---

## Phase G7 — Hardening + niceties (🟢)

Goal: production-readiness touches.

- [ ] Rate limiting on task creation + auth endpoints (simple in-memory or DB
      token bucket per user) to protect platform-key spend + abuse.
- [ ] Task-complete notification (in-app toast / unread badge on the office;
      optional, no email infra yet).
- [ ] Password reset + email verification — DEFERRED unless email infra added;
      document as a known gap.
- [ ] Idempotency + replay safety already done for billing; add request-id log
      correlation across web→orchestrator for debugging.
- [ ] Final full E2E smoke covering: signup → onboarding → create office → run →
      view+download output → hit credit wall → BYOK → run free → upgrade (mock
      webhook) → unlimited offices.

**Gate G7:** full gate green; E2E smoke covers the whole product loop.

---

## Sequencing rationale
- G1 first: the product's core promise (agents produce work) is unusable without
  retrieving output. Highest impact, self-contained.
- G2 next: office management unblocks FREE users stuck at the 2-office cap.
- G3+G4 tie directly to the monetization we just built — enforce + explain it.
- G5 makes the paid path real (pending Lemon account).
- G6 polishes the signature feature (was deliberately paused).
- G7 hardens for launch.

## Risk notes
- G1 path guard: reuse the EXACT guard from packages/agents tools — do not write
  a second path-resolution implementation. Any escape = reject.
- G2 delete: destructive (removes workspace folder). Confirm modal in UI; API
  owner-only; never delete another tenant's office.
- Keep `pnpm dev` off during every gate; Docker/Postgres up for DB tests.
