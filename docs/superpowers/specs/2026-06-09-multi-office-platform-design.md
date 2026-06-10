# Multi-Office AI Platform — Design Spec (MVP)

**Date:** 2026-06-09
**Status:** Approved for planning
**Author:** Brainstorming session (Sisyphus + user)

---

## 1. Vision

A hosted SaaS platform where users create **AI "offices"** — visible, living workspaces in which a team of AI agents collaborate on tasks. Inspired by `longyangxi/OpenOffice`, but reframed from a local single-team CLI tool into a **fully hosted, multi-tenant product** where the platform provides everything (compute, agents, API).

The signature feature is a **pixel-art office** (PixiJS) where each agent is a character sprite that moves and animates in real time as it works — making AI collaboration *visible* and creating product FOMO.

**Core user flow:**
```
Register/Login → Browse Template catalog → Create Office from template
→ (optional) Add/customize own agents → Give Office a Task
→ Agents work in turn (live in pixel office) → Review output
```

---

## 2. Core Concepts (3 entities)

```
Agent  ──(composed into)──>  Template  ──(instantiated as)──>  Office Instance
```

- **Agent** — the smallest reusable unit. Has: role, system prompt, allowed tools, knowledge docs, model config. Two kinds:
  - *Platform-provided* — seeded by us, available to everyone.
  - *User-created* — user configures their own ("trains" = sets system prompt + tools + uploads knowledge docs; NOT model fine-tuning in MVP).
  - Agent format is uniform so platform agents and user agents coexist in the same office.
- **Template** — a recipe that assembles agents + a workflow into a ready-to-use office type. Example "Dev Office" = planner + coder + reviewer with a plan→code→review workflow.
- **Office Instance** — created when a user instantiates a template. The template's agents are *copied* into the office (snapshot, so later template edits don't mutate live offices). Here the user can add their own agents, swap agents, and run tasks.

**Analogy:** Agent = employee (with own skills & tools); Template = ready-made team structure (job descriptions); Office = the real workplace where the user can also hire extra employees (their own agents).

---

## 3. Architecture (fully hosted — everything on our servers)

```
apps/
├── web/           # Next.js 15 — UI: template catalog, pixel office workspace, agent builder
└── orchestrator/  # Node.js daemon — workflow execution, LLM calls, tool running
packages/
├── db/            # Prisma schema + client (PostgreSQL)
├── agents/        # agent runtime: tool-calling loop, sandboxed file ops
└── shared/        # typed command/event contracts (Zod)
```

**Key decisions:**
- **Orchestrator is a separate long-running process** from the Next.js web app. Agents run for minutes; they must not block HTTP requests. Web ↔ orchestrator communicate over WebSocket + a job queue.
- **Office isolation (MVP):** each office gets its own scoped workspace folder. File/code tools may only touch that folder, enforced by a path guard. Full container-per-office (Docker) is deferred to post-MVP.
- **Real-time:** orchestrator emits Zod-validated events over WebSocket → web client → drives pixel sprites + activity feed.
- **Multi-tenancy from day one:** every Office belongs to users via `OfficeMembership`. Real-time human-to-human collaboration (presence, multi-cursor) is deferred to v2, but the schema already supports multiple human members per office.

---

## 4. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Next.js 15 (App Router), React, TypeScript | Matches OpenOffice lineage; strong SaaS base |
| Pixel rendering | PixiJS v8 | Same as reference; mature pixel/sprite engine |
| Client state | Zustand | Lightweight, matches reference |
| Styling | Tailwind CSS | Fast iteration |
| Orchestrator | Node.js + TypeScript (daemon) | Long-running agent execution off the request path |
| LLM access | Vercel AI SDK (single provider in MVP: Anthropic) | Hides provider behind one interface; cheap multi-backend later |
| Agent loop | Custom tool-calling loop | Full control over planner/coder/reviewer behavior |
| Database | PostgreSQL + Prisma ORM | Type-safe multi-tenancy |
| Contracts | Zod schemas (`packages/shared`) | Shared command/event validation across web + orchestrator |
| Monorepo | pnpm workspace + Turborepo | Matches reference; task orchestration |
| Auth | Auth.js (NextAuth v5) | Email/password or OAuth |
| Real-time | Native WebSocket | Simple, sufficient for MVP |

---

## 5. Data Model (core entities)

> Field lists are indicative; exact columns finalized in the implementation plan.

- **User** — `id`, `email`, `name`, `passwordHash`/OAuth, `createdAt`.
- **Agent** — `id`, `ownerId` (null = platform-provided), `name`, `role`, `systemPrompt`, `tools` (string[]), `modelConfig` (json), `createdAt`. Knowledge via `KnowledgeDoc`.
- **KnowledgeDoc** — `id`, `agentId`, `title`, `content`/`fileRef`, `createdAt`. (MVP: plain text/markdown injected into context; vector RAG deferred.)
- **Template** — `id`, `name`, `description`, `category`, `workflow` (json: ordered steps), `createdAt`. Composition via `TemplateAgent`.
- **TemplateAgent** — `id`, `templateId`, `agentId`, `stepOrder`/`roleInTemplate`.
- **Office** — `id`, `name`, `templateId` (origin), `ownerId`, `workspacePath`, `status`, `createdAt`.
- **OfficeMembership** — `id`, `officeId`, `userId`, `role` (owner/member). Enables multi-human offices later.
- **OfficeAgent** — `id`, `officeId`, `agentSnapshot` (json: copied agent config), `stepOrder`. Snapshot decouples live office from source agent/template edits.
- **Task** — `id`, `officeId`, `prompt`, `status` (queued/running/done/failed), `createdAt`, `finishedAt`.
- **Event** — `id`, `taskId`, `officeId`, `agentRef`, `type` (e.g. `agent.thinking`, `agent.tool_call`, `agent.output`, `step.start`, `step.done`), `payload` (json), `ts`. Drives live pixel office + feed.
- **Artifact** — `id`, `taskId`, `type` (file/text/code), `name`, `content`/`fileRef`, `createdAt`.

---

## 6. Workflow Engine (MVP: deterministic pipeline)

A template defines an **ordered list of steps**, each step bound to one agent role.

```
Task in → Step 1 (Planner) → Step 2 (Coder) → Step 3 (Reviewer) → Output
```

- Each step: the assigned agent receives `task prompt + accumulated context (prior step outputs) + its knowledge docs`, runs a tool-calling loop, produces output.
- Output of step N becomes input context to step N+1.
- Each meaningful action emits an `Event` (start, thinking, tool call, output, done) → drives the pixel office.
- Deterministic and easy to demo. **Dynamic leader-delegation is v2.**

---

## 7. Pixel Office (signature feature)

- **PixiJS v8** renders a pixel-art office room. Each office agent = a character sprite at a desk.
- Agent visual states map to events:
  - `idle` — at desk, subtle idle animation.
  - `thinking` — thought bubble / animation while LLM is generating.
  - `working` — active animation during tool calls (typing, etc.).
  - `done` — checkmark / return to idle.
- Orchestrator events (WebSocket) move/animate sprites in real time; current speaker/worker highlighted.
- **Activity feed** is a secondary, complementary panel (text log of events), not the primary view.
- Pixel art assets: start from open/free pixel office tilesets (reference acknowledges `pixel-agents`); exact assets chosen during implementation.

---

## 8. Real-time Event Flow

```
Orchestrator (executing step)
   │  emits Zod-validated Event
   ▼
WebSocket server (in orchestrator or gateway)
   │
   ▼
Next.js web client (Zustand store)
   ├──> PixiJS scene (animate sprite for agentRef)
   └──> Activity feed (append event)
```

All event shapes defined once in `packages/shared` (Zod) and imported by both sides.

---

## 9. Error Handling

- **LLM call failure** → retry with backoff (bounded); on final failure, emit `step.failed`, mark task `failed`, surface in UI. Office stays usable.
- **Tool error** (e.g., file op out of scope) → blocked by path guard, returned to agent as a tool error so it can recover; logged as Event.
- **Orchestrator crash mid-task** → task left `running` is reconciled to `failed` on restart (MVP); resumable tasks are post-MVP.
- **WebSocket disconnect** → client auto-reconnects and re-syncs latest task/events from DB (events are persisted, so the feed/scene can rebuild).
- **Path guard** is the security boundary for MVP isolation; any path escaping `workspacePath` is rejected.

---

## 10. Testing Strategy

- **Unit:** workflow engine step sequencing; path guard (in-scope vs escape attempts); Zod event/command contracts; agent snapshot copy logic.
- **Integration:** create-office-from-template (agents copied correctly); run-task pipeline end-to-end against a mocked LLM provider (deterministic outputs); event emission order.
- **E2E (smoke):** register → create office → run a canned task → see events arrive → artifact produced. LLM mocked in CI.
- LLM provider is behind an interface, so tests inject a fake provider — no live API calls in CI.

---

## 11. MVP Scope — IN vs OUT

**IN (required for MVP):**
- User auth (Auth.js)
- Template catalog with 2–3 seed templates (Dev, Research, Content)
- Create Office from template (agent snapshots copied in)
- Agent builder (role + system prompt + tool selection + knowledge doc upload)
- Add user's own agent into an office
- Run task → deterministic workflow pipeline → output artifacts
- **Pixel office (PixiJS) with live agent sprites** — signature feature
- Live activity feed (WebSocket, persisted events)
- Multi-tenant data model (`OfficeMembership` present)

**OUT (deferred):**
- Real-time human collaboration UI (presence, multi-cursor) — schema ready, UI later
- Multiple AI backends (single provider in MVP)
- Billing/payments (usage tracking only, if any)
- Git worktree isolation, Telegram control, desktop (Tauri) app
- True agent fine-tuning
- Dynamic leader delegation (deterministic pipeline only)
- Container-per-office isolation (folder + path guard in MVP)
- Vector RAG for knowledge (plain-text context injection in MVP)

---

## 12. Open Questions (resolve during planning)

- Pixel art asset source/licensing for the office scene.
- Exact seed template definitions (agents + steps per template).
- Job queue choice between web→orchestrator (e.g., DB-backed queue vs lightweight broker).
- Auth method for MVP: email/password vs OAuth-only.
