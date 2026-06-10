// @repo/shared/views — Zod schemas for data the web app returns to the client.
// These describe the shape of catalog listings, office views, and request bodies
// the web app's API routes accept. The Prisma client generates its own types
// from the DB schema; these Zod schemas are the wire-format validators (and
// also drive inferred types via z.infer).
//
// Why both Zod and Prisma types? Prisma is the source of truth for the DB
// (one shape). Zod is the source of truth for the HTTP boundary (a different
// shape — e.g. agents get a `role` but not internal DB fields, and we add
// `knowledgeDocCount` to the agent view). The cost of duplicating is small
// and the boundary validation is explicit.

import { z } from 'zod';
import { idSchema } from './ids.js';
import { eventSchema } from './events.js';

// ── Agent CRUD ─────────────────────────────────────────────────────────────

/** Whitelist of tool names available for agents (Phase 5 builder). */
export const AGENT_TOOL_WHITELIST = [
  'read_file',
  'write_file',
  'search',
  'execute_command',
  'web_search',
] as const;
export type AgentTool = (typeof AGENT_TOOL_WHITELIST)[number];

/** POST /api/agents — create a new agent. */
export const agentCreateInputSchema = z.object({
  name: z.string().min(1, 'name is required').max(120).trim(),
  role: z.string().min(1, 'role is required').max(80).trim(),
  systemPrompt: z.string().min(1, 'system prompt is required').max(4000),
  tools: z.array(z.enum(AGENT_TOOL_WHITELIST)).min(1, 'at least one tool required'),
  modelConfig: z.record(z.string(), z.unknown()).optional(),
  knowledgeDocs: z
    .array(
      z.object({
        title: z.string().min(1, 'doc title is required').max(200).trim(),
        content: z.string().min(1, 'doc content is required').max(10000),
      }),
    )
    .max(10, 'max 10 knowledge docs')
    .optional(),
});
export type AgentCreateInput = z.input<typeof agentCreateInputSchema>;

/** PATCH /api/agents/[id] — partial update of an agent. */
export const agentUpdateInputSchema = z.object({
  name: z.string().min(1).max(120).trim().optional(),
  role: z.string().min(1).max(80).trim().optional(),
  systemPrompt: z.string().min(1).max(4000).optional(),
  tools: z.array(z.enum(AGENT_TOOL_WHITELIST)).min(1).optional(),
  modelConfig: z.record(z.string(), z.unknown()).optional(),
});
export type AgentUpdateInput = z.infer<typeof agentUpdateInputSchema>;

// ── Knowledge doc (public view) ────────────────────────────────────────────

export const knowledgeDocViewSchema = z.object({
  id: idSchema,
  agentId: idSchema,
  title: z.string(),
  content: z.string().nullable(),
  createdAt: z.string(),
});
export type KnowledgeDocView = z.infer<typeof knowledgeDocViewSchema>;

// ── Office agent management ────────────────────────────────────────────────

/** POST /api/offices/[id]/agents — add an existing agent to an office. */
export const addAgentToOfficeSchema = z.object({
  agentId: idSchema,
  stepOrder: z.number().int().min(1, 'stepOrder must be >= 1'),
});
export type AddAgentToOfficeInput = z.infer<typeof addAgentToOfficeSchema>;

/** PATCH /api/offices/[id]/agents/reorder — bulk reorder. */
export const reorderOfficeAgentsSchema = z.object({
  items: z.array(
    z.object({
      id: idSchema,
      stepOrder: z.number().int().min(1),
    }),
  ),
});
export type ReorderOfficeAgentsInput = z.infer<typeof reorderOfficeAgentsSchema>;

// ── Office create (Phase 4) ────────────────────────────────────────────────

/** POST /api/offices — input from the create-office form. */
export const createOfficeRequestSchema = z.object({
  templateId: idSchema,
  name: z.string().min(1, 'office name is required').max(120).trim(),
});
export type CreateOfficeRequest = z.infer<typeof createOfficeRequestSchema>;

// ── Agent view (used inside TemplateView and OfficeView) ──────────────────

export const agentViewSchema = z.object({
  id: idSchema,
  name: z.string(),
  role: z.string(),
  systemPrompt: z.string(),
  tools: z.array(z.string()),
  modelConfig: z.record(z.string(), z.unknown()),
});
export type AgentView = z.infer<typeof agentViewSchema>;

// ── Template view (catalog listing) ────────────────────────────────────────

/** A single step in a template's workflow. */
export const templateStepSchema = z.object({
  order: z.number().int().positive(),
  agentRole: z.string(),
  label: z.string(),
});
export type TemplateStep = z.infer<typeof templateStepSchema>;

export const templateViewSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string(),
  category: z.string(),
  workflow: z.array(templateStepSchema),
  agents: z.array(agentViewSchema),
});
export type TemplateView = z.infer<typeof templateViewSchema>;

// ── Office view (dashboard + detail) ───────────────────────────────────────

/** A snapshot of an agent as it lives inside an office (immutable copy). */
export const officeAgentSnapshotSchema = z.object({
  id: idSchema, // OfficeAgent id
  stepOrder: z.number().int().positive(),
  // The full Agent config copied at office creation time. The exact shape is
  // intentionally left loose here — Phase 5 will add per-field validation.
  agent: agentViewSchema,
});
export type OfficeAgentSnapshot = z.infer<typeof officeAgentSnapshotSchema>;

export const officeViewSchema = z.object({
  id: idSchema,
  name: z.string(),
  templateId: idSchema,
  templateName: z.string(),
  status: z.string(),
  workspacePath: z.string(),
  createdAt: z.string(), // ISO timestamp
  agents: z.array(officeAgentSnapshotSchema),
});
export type OfficeView = z.infer<typeof officeViewSchema>;

// ── Task & Artifact views (Phase 9 — output review) ───────────────────────

/**
 * A produced artifact (e.g. final-output.txt). `content` holds inline text for
 * `type: 'text'`; `fileRef` points at an on-disk path for binary/large output.
 */
export const artifactViewSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  type: z.string(),
  name: z.string(),
  content: z.string().nullable(),
  fileRef: z.string().nullable(),
  createdAt: z.string(), // ISO timestamp
});
export type ArtifactView = z.infer<typeof artifactViewSchema>;

/** Compact task row for the office dashboard task-history list. */
export const taskSummaryViewSchema = z.object({
  id: idSchema,
  officeId: idSchema,
  prompt: z.string(),
  status: z.string(),
  createdAt: z.string(), // ISO timestamp
  finishedAt: z.string().nullable(),
  eventCount: z.number().int().nonnegative(),
  artifactCount: z.number().int().nonnegative(),
});
export type TaskSummaryView = z.infer<typeof taskSummaryViewSchema>;

/** Full task detail: the task, its ordered events, and its artifacts. */
export const taskDetailViewSchema = z.object({
  id: idSchema,
  officeId: idSchema,
  officeName: z.string(),
  prompt: z.string(),
  status: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  events: z.array(eventSchema),
  artifacts: z.array(artifactViewSchema),
});
export type TaskDetailView = z.infer<typeof taskDetailViewSchema>;
