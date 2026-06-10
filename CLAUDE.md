# CLAUDE.md — Multi-Office AI Platform

Guidance for AI agents (Claude Code and others) working in this repository.

---

## What This Project Is

A **hosted, multi-tenant SaaS platform** where users create AI "offices" — visible workspaces in which a team of AI agents collaborate on tasks. Everything (compute, agents, LLM access) runs on **our servers**. The signature feature is a **pixel-art office** (PixiJS) where each agent is an animated sprite working in real time.

Inspired by `longyangxi/OpenOffice` (a local CLI tool), but reframed as a fully hosted product.

**Read these first:**
- `docs/PRD.md` — product requirements, user stories, acceptance criteria.
- `plan.md` — phased implementation plan (build order + verification gates).
- `docs/superpowers/specs/2026-06-09-multi-office-platform-design.md` — full design spec.

---

## Core Mental Model

```
Agent  ──(composed into)──>  Template  ──(instantiated as)──>  Office Instance
```

- **Agent** — reusable unit: role + system prompt + tools + knowledge docs + model config. Platform-provided or user-created. "Training" an agent = configuring prompt/tools/knowledge (NOT model fine-tuning).
- **Template** — recipe: agents + ordered workflow steps.
- **Office Instance** — created from a template; agents are **snapshot-copied** in. Users add/swap agents and run tasks here.
- **Task** — a goal run through the office's deterministic step pipeline.

---

## Architecture

```
apps/
├── web/           # Next.js 15 (App Router) — UI, auth, pixel office
└── orchestrator/  # Node daemon — workflow execution, LLM calls, tools
packages/
├── db/            # Prisma + Postgres
├── agents/        # agent runtime: tool-calling loop, sandboxed file ops
└── shared/        # Zod command/event contracts (shared by web + orchestrator)
```

**Why orchestrator is separate:** agents run for minutes. Execution must stay OFF the Next.js HTTP request path. Web and orchestrator communicate via WebSocket + a DB-backed job queue.

---

## Tech Stack

- **Frontend:** Next.js 15, React, TypeScript, PixiJS v8, Zustand, Tailwind.
- **Orchestrator:** Node.js + TypeScript daemon.
- **LLM:** Vercel AI SDK — single provider in MVP (Anthropic), always behind a provider interface.
- **DB:** PostgreSQL + Prisma.
- **Contracts:** Zod (`packages/shared`).
- **Monorepo:** pnpm workspace + Turborepo.
- **Auth:** Auth.js (NextAuth v5).
- **Real-time:** native WebSocket.

---

## Non-Negotiable Rules

These are architectural invariants. Violating them breaks the design.

1. **No secrets client-side.** LLM API keys live ONLY in orchestrator/server env. Never ship them to the browser.
2. **All cross-process payloads validated** with `packages/shared` Zod schemas. Define the schema there once; import on both sides.
3. **LLM always behind the provider interface.** Never import the AI SDK directly in pipeline logic. Tests use `FakeProvider` — no live LLM calls in CI.
4. **Every file/code tool call goes through the path guard.** Tools may only touch the office's `workspacePath`. Any path escape is rejected.
5. **Snapshots over references.** When creating an office, COPY agent configs into `OfficeAgent` snapshots. Editing a template/agent later must NOT mutate live offices.
6. **Multi-tenant by default.** Every query is scoped to the user. Offices link to users via `OfficeMembership`. A user must never see another user's data.
7. **Pixel office is a core feature, not optional.** It is the product's signature. Do not treat it as deferrable.

---

## What's IN vs OUT (MVP)

**IN:** auth, template catalog (3 seeds), create office from template, agent builder, add user agents to office, task execution pipeline, **pixel office (PixiJS)**, live activity feed, multi-tenant schema.

**OUT (do NOT build now):** real-time human collaboration UI, multiple AI backends, billing, git worktree isolation, Telegram, Tauri desktop, model fine-tuning, dynamic leader delegation, container-per-office (use folder + path guard), vector RAG (use plain-text context injection).

---

## Workflow Engine (MVP)

Deterministic pipeline. Template defines ordered steps; each step bound to one agent role:

```
Task → Step 1 (Planner) → Step 2 (Coder) → Step 3 (Reviewer) → Output
```

Each step: agent receives `task prompt + prior step outputs + its knowledge docs`, runs a tool-calling loop, emits events + artifacts. Output of step N feeds step N+1. **Dynamic leader delegation is v2 — not now.**

---

## Real-time Events

Orchestrator emits Zod-validated events → persisted to DB → broadcast over WebSocket → Zustand store → drives PixiJS sprites + activity feed. On reconnect, hydrate from DB then resume streaming. Event types: `step.start`, `step.done`, `step.failed`, `agent.thinking`, `agent.tool_call`, `agent.output`, `task.status`.

Agent sprite states: `idle / thinking / working / done`.

---

## Development Workflow

- **Follow `plan.md` phase order.** Each phase has a verification gate — pass it before moving on.
- `pnpm install` · `pnpm dev` (web + orchestrator) · `pnpm build` · `pnpm lint` · `pnpm test`.
- Prisma: `pnpm --filter db prisma migrate dev`, then run the seed script for the 3 templates.

---

## Testing Expectations

- **Unit:** workflow step sequencing, path guard (in-scope vs escape), Zod contracts, snapshot copy logic.
- **Integration:** create-office-from-template, run-task pipeline with `FakeProvider`, event order, tenancy isolation.
- **E2E smoke:** register → create office → add custom agent → run task → events arrive → artifact produced.
- **No live LLM calls in CI** — always inject `FakeProvider`.

---

## When Unsure

- Check `plan.md` for the current phase and its verification gate.
- Check the spec Section 12 / PRD Section 10 for known open questions (asset licensing, seed template definitions, job queue choice, auth method).
- Prefer the smallest change that satisfies the current phase. Do not pull deferred features forward.
- If a change would violate a Non-Negotiable Rule, stop and reconsider the approach.
