# Product Requirements Document — Multi-Office AI Platform

**Version:** 1.0 (MVP)
**Date:** 2026-06-09
**Status:** Approved
**Related:** `docs/superpowers/specs/2026-06-09-multi-office-platform-design.md`

---

## 1. Overview

A hosted, multi-tenant SaaS platform where users create **AI "offices"** — visible workspaces in which a team of AI agents collaborate on tasks. The platform provides everything: compute, agents, and LLM access run entirely on our servers.

The signature, FOMO-driving feature is a **pixel-art office** where each agent is an animated character sprite that moves and works in real time.

**One-line pitch:** *Hire a team of AI agents into a living pixel office, give them a task, and watch them work.*

---

## 2. Problem & Goals

### Problem
Working with AI agents today is invisible and isolated — a single chat box, one model, no sense of a team. There is no shared, watchable workspace where specialized agents collaborate on a goal, and no easy way to assemble or reuse your own trained agents across projects.

### Goals (MVP)
1. Let a user spin up a working AI team in under 2 minutes via templates.
2. Make agent collaboration **visible** and engaging (pixel office, live activity).
3. Let users **bring their own agents** (configured with prompt + tools + knowledge) into any office.
4. Prove the core loop: *template → office → task → visible multi-agent output*.

### Non-Goals (MVP)
- Real-time human-to-human collaboration UI.
- Multiple LLM backends.
- Billing/payments.
- True model fine-tuning.
- Self-hosting/desktop distribution.

---

## 3. Target Users

- **Primary:** Indie developers & AI tinkerers who want to assemble and watch AI agent teams without wiring up infra themselves.
- **Secondary:** Small teams exploring AI-native workflows (research, content, dev) who want reusable, shareable agent setups.

---

## 4. Core Concepts

| Concept | Definition |
|---|---|
| **Agent** | Smallest reusable unit: role + system prompt + allowed tools + knowledge docs + model config. Platform-provided or user-created. |
| **Template** | A recipe assembling agents + a workflow into a ready-made office type (e.g. "Dev Office"). |
| **Office Instance** | A live workspace created from a template. Agents are snapshot-copied in; user can add/swap agents and run tasks. |
| **Task** | A user-issued goal run through the office's workflow. |
| **Workflow** | Ordered pipeline of steps; each step bound to one agent role. |

---

## 5. User Stories & Acceptance Criteria

### US-1 — Authentication
*As a user, I can register and log in so my offices are private to me.*
- **AC:** Email/password (or OAuth) registration + login; unauthenticated users cannot access offices; each user only sees their own offices/agents.

### US-2 — Browse Templates
*As a user, I can browse a catalog of office templates and see what each contains.*
- **AC:** Catalog lists ≥3 seed templates (Dev, Research, Content); each shows name, description, category, and its agent roster + workflow steps.

### US-3 — Create Office from Template
*As a user, I can create an office from a template in one action.*
- **AC:** "Create Office" copies template's agents as snapshots into a new office; a scoped workspace folder is provisioned; office appears in my dashboard; original template is unaffected by later office changes.

### US-4 — Build a Custom Agent
*As a user, I can create my own agent by setting its role, system prompt, tools, and uploading knowledge docs.*
- **AC:** Agent builder form saves a user-owned agent; tools chosen from an allowed list; knowledge docs (text/markdown) stored and injected into the agent's context at runtime.

### US-5 — Add My Agent to an Office
*As a user, I can add one of my agents into an existing office and place it in the workflow.*
- **AC:** User agent appears as an `OfficeAgent` snapshot with a step position; it participates in subsequent task runs.

### US-6 — Run a Task
*As a user, I can give my office a task and watch the agents work.*
- **AC:** Submitting a task starts the workflow pipeline; each step runs the bound agent; events stream live; final artifacts are produced and viewable; task status transitions queued→running→done/failed.

### US-7 — Watch the Pixel Office
*As a user, I can see agents as animated sprites reflecting their current state.*
- **AC:** Each office agent is a sprite; states `idle/thinking/working/done` animate from live events; active agent highlighted; scene rebuilds correctly on reconnect.

### US-8 — Review Output
*As a user, I can review the artifacts and the activity log of a task.*
- **AC:** Artifacts listed with type/name/content; activity feed shows ordered events; both persist and reload after refresh.

---

## 6. Functional Requirements

1. **Auth & tenancy** — per-user isolation; offices linked to users via `OfficeMembership`.
2. **Template catalog** — read-only seed templates; show composition.
3. **Office lifecycle** — create from template (snapshot copy), provision workspace folder, list/open/delete.
4. **Agent builder** — CRUD for user agents; tool whitelist; knowledge doc upload (text/markdown).
5. **Office composition** — add/remove/reorder agents within an office.
6. **Task execution** — deterministic step pipeline via separate orchestrator process; LLM behind provider interface; tool-calling loop per step.
7. **Sandbox** — file/code tools restricted to office `workspacePath` via path guard.
8. **Real-time** — Zod-validated events over WebSocket; persisted to DB; drive pixel scene + feed.
9. **Pixel office** — PixiJS scene mapping agents→sprites and events→animations.
10. **Artifacts** — capture and display step/task outputs.

---

## 7. Non-Functional Requirements

- **Isolation/Security:** path guard enforced server-side; no tool may escape an office workspace. Secrets/API keys server-side only, never sent to client.
- **Resilience:** bounded LLM retries; tasks reconciled to `failed` on orchestrator restart; WebSocket auto-reconnect with event replay from DB.
- **Performance:** task execution off the HTTP request path (daemon); UI remains responsive during long runs.
- **Testability:** LLM provider mockable; no live API calls in CI.
- **Extensibility:** provider interface and multi-human schema in place so multi-backend and collaboration land without schema rewrites.

---

## 8. Success Metrics (MVP)

- Time-to-first-task < 2 minutes from registration.
- A user can run the full loop (create office → run task → see pixel agents work → get artifact) without errors.
- ≥1 user-created agent successfully participates in a task.
- Pixel office reflects live agent state with no manual refresh.

---

## 9. Release Scope

See spec Section 11 (IN/OUT). MVP ships US-1 through US-8 with the pixel office as a core, non-deferrable feature.

---

## 10. Open Questions

- Pixel-art asset source & licensing.
- Exact seed template definitions (agents + steps).
- Job queue mechanism (DB-backed vs lightweight broker).
- Auth method: email/password vs OAuth-only for MVP.
