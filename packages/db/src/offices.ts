// @repo/db/offices — read + write helpers for the catalog and office lifecycle.
//
// Per Non-Negotiable Rule #5 (snapshots over references): when an office is
// created from a template, the Agent config is DEEPLY COPIED into
// `OfficeAgent.agentSnapshot` (JSON). Subsequent edits to the source template
// or its agents do NOT mutate existing offices.
//
// Per Non-Negotiable Rule #6 (multi-tenant by default): every read scoped to
// `ownerId` or `OfficeMembership.userId`. Users see only their own offices.
//
// `workspacePath` is provisioned on the local filesystem under
// `<workspacesRoot>/<officeId>/` so the orchestrator daemon can chroot file
// tools to it later (Phase 6).

import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as PrismaTypes from './generated/internal/prismaNamespace.js';
import { prisma } from './index.js';
import type {
  AgentView,
  OfficeAgentSnapshot,
  OfficeView,
  TemplateView,
} from '@repo/shared';

type JsonValue = PrismaTypes.JsonValue;

// ── Configuration ─────────────────────────────────────────────────────────

/**
 * Root directory for per-office workspaces. Each office gets its own subfolder
 * named after its id. The orchestrator (Phase 6) will chroot file tools to
 * this path. Override with env var for tests / different deploys.
 */
const WORKSPACES_ROOT = resolve(
  process.env['WORKSPACES_ROOT'] ?? 'D:/vibecoding/openoffice/workspaces',
);

function workspacePathFor(officeId: string): string {
  return resolve(WORKSPACES_ROOT, officeId);
}

// ── Internal: JSON column helpers ─────────────────────────────────────────

/** Prisma `Json` columns can store any JSON; we always write strings there
 *  (JSON.stringify of an array/object) and re-parse on read. */
function readJsonString(raw: JsonValue): string {
  if (typeof raw === 'string') return raw;
  // Defensive: if someone wrote a non-string JSON value, stringify it.
  return JSON.stringify(raw);
}

function parseTools(raw: JsonValue): string[] {
  try {
    const parsed = JSON.parse(readJsonString(raw)) as unknown;
    if (Array.isArray(parsed) && parsed.every((t) => typeof t === 'string')) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

function parseModelConfig(raw: JsonValue): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readJsonString(raw)) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function parseWorkflowSteps(raw: JsonValue): Array<{ order: number; agentRole: string; label: string }> {
  try {
    const parsed = JSON.parse(readJsonString(raw)) as unknown;
    if (Array.isArray(parsed)) return parsed as Array<{ order: number; agentRole: string; label: string }>;
    return [];
  } catch {
    return [];
  }
}

function toAgentView(agent: {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  tools: JsonValue;
  modelConfig: JsonValue;
}): AgentView {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    systemPrompt: agent.systemPrompt,
    tools: parseTools(agent.tools),
    modelConfig: parseModelConfig(agent.modelConfig),
  };
}

function toTemplateView(template: {
  id: string;
  name: string;
  description: string;
  category: string;
  workflow: JsonValue;
  templateAgents: Array<{ stepOrder: number; agent: Parameters<typeof toAgentView>[0] }>;
}): TemplateView {
  const workflow = parseWorkflowSteps(template.workflow);
  const sortedAgents = [...template.templateAgents].sort((a, b) => a.stepOrder - b.stepOrder);
  const agents: AgentView[] = sortedAgents.map((ta) => toAgentView(ta.agent));

  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    workflow,
    agents,
  };
}

function toOfficeView(office: {
  id: string;
  name: string;
  templateId: string;
  workspacePath: string;
  status: string;
  createdAt: Date;
  officeAgents: Array<{ id: string; stepOrder: number; agentSnapshot: JsonValue }>;
  template: { name: string };
}): OfficeView {
  const agents: OfficeAgentSnapshot[] = [...office.officeAgents]
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .map((oa) => {
      const snap = JSON.parse(readJsonString(oa.agentSnapshot)) as AgentView;
      return { id: oa.id, stepOrder: oa.stepOrder, agent: snap };
    });

  return {
    id: office.id,
    name: office.name,
    templateId: office.templateId,
    templateName: office.template.name,
    status: office.status,
    workspacePath: office.workspacePath,
    createdAt: office.createdAt.toISOString(),
    agents,
  };
}

// ── Template reads ────────────────────────────────────────────────────────

/** List every template with its agents and workflow, for the catalog page. */
export async function listTemplates(): Promise<TemplateView[]> {
  const rows = await prisma.template.findMany({
    orderBy: { name: 'asc' },
    include: {
      templateAgents: { include: { agent: true } },
    },
  });
  return rows.map(toTemplateView);
}

/** Fetch a single template with full agent details. Returns null if not found. */
export async function getTemplateById(templateId: string): Promise<TemplateView | null> {
  const row = await prisma.template.findUnique({
    where: { id: templateId },
    include: {
      templateAgents: { include: { agent: true } },
    },
  });
  return row ? toTemplateView(row) : null;
}

// ── Office create ─────────────────────────────────────────────────────────

export interface CreateOfficeInput {
  /** Owning user id. */
  ownerId: string;
  /** Source template id. */
  templateId: string;
  /** User-chosen office name. */
  name: string;
}

/**
 * Create a new Office from a Template:
 *   1. Snapshot each TemplateAgent's Agent config into OfficeAgent.agentSnapshot
 *   2. Create the Office row + OfficeMembership(owner)
 *   3. Provision the on-disk workspace directory
 *
 * The DB work runs in a Prisma transaction so a partial failure leaves no
 * dangling rows. Directory creation runs after the transaction commits and
 * is best-effort (logged on failure) — the orchestrator can recreate it.
 *
 * Throws if the template does not exist or has no templateAgents.
 */
export async function createOfficeFromTemplate(input: CreateOfficeInput): Promise<OfficeView> {
  const template = await prisma.template.findUnique({
    where: { id: input.templateId },
    include: {
      templateAgents: {
        include: { agent: true },
        orderBy: { stepOrder: 'asc' },
      },
    },
  });
  if (!template) {
    throw new OfficeNotFoundError(`Template ${input.templateId} not found`);
  }
  if (template.templateAgents.length === 0) {
    throw new InvalidTemplateError(`Template ${input.templateId} has no agents`);
  }

  // Build the snapshot rows. Snapshot is a DEEP COPY of the Agent config at
  // this moment in time — subsequent edits to the source Agent row are
  // isolated from this office.
  const snapshotRows = template.templateAgents.map((ta) => ({
    stepOrder: ta.stepOrder,
    agentSnapshot: JSON.stringify(toAgentView(ta.agent)),
  }));

  // Create Office + Membership + OfficeAgent snapshots in one transaction.
  // The Office.id is generated by Prisma (uuid()) — we use a two-step
  // create-then-update to derive the workspace path from the new id.
  const office = await prisma.$transaction(async (tx) => {
    const created = await tx.office.create({
      data: {
        name: input.name,
        templateId: input.templateId,
        ownerId: input.ownerId,
        workspacePath: '__pending__', // updated below once we have the id
        officeAgents: {
          create: snapshotRows,
        },
        memberships: {
          create: {
            userId: input.ownerId,
            role: 'owner',
          },
        },
      },
      include: {
        officeAgents: { orderBy: { stepOrder: 'asc' } },
        template: { select: { name: true } },
      },
    });
    const wp = workspacePathFor(created.id);
    return tx.office.update({
      where: { id: created.id },
      data: { workspacePath: wp },
      include: {
        officeAgents: { orderBy: { stepOrder: 'asc' } },
        template: { select: { name: true } },
      },
    });
  });

  // Provision the workspace directory. Best-effort: if mkdir fails, we still
  // return the office; the orchestrator will retry on first task.
  try {
    await mkdir(office.workspacePath, { recursive: true });
  } catch (err) {
    console.error(
      `[createOfficeFromTemplate] mkdir ${office.workspacePath} failed`,
      err,
    );
  }

  return toOfficeView(office);
}

// ── Office reads ──────────────────────────────────────────────────────────

/**
 * List every office the given user owns or is a member of, newest first.
 * Scoped by OfficeMembership — users never see other users' offices.
 */
export async function listUserOffices(userId: string): Promise<OfficeView[]> {
  const rows = await prisma.office.findMany({
    where: { memberships: { some: { userId } } },
    orderBy: { createdAt: 'desc' },
    include: {
      officeAgents: { orderBy: { stepOrder: 'asc' } },
      template: { select: { name: true } },
    },
  });
  return rows.map(toOfficeView);
}

/** Fetch a single office the user has access to. Returns null on miss. */
export async function getOfficeById(
  officeId: string,
  userId: string,
): Promise<OfficeView | null> {
  const row = await prisma.office.findFirst({
    where: {
      id: officeId,
      memberships: { some: { userId } },
    },
    include: {
      officeAgents: { orderBy: { stepOrder: 'asc' } },
      template: { select: { name: true } },
    },
  });
  return row ? toOfficeView(row) : null;
}

// ── Errors ────────────────────────────────────────────────────────────────

export class OfficeNotFoundError extends Error {
  override name = 'OfficeNotFoundError';
}
export class InvalidTemplateError extends Error {
  override name = 'InvalidTemplateError';
}

// ── Office agent management (Phase 5) ─────────────────────────────────────

/**
 * Add an existing agent to an office as a snapshot. If `stepOrder` collides
 * with an existing OfficeAgent, the existing agents from that order onward
 * are shifted right (+1). This mirrors the template-catalog semantics: the
 * agent config is deep-copied at insertion time.
 *
 * Requires that the caller is an office member (owner or collaborator).
 * Returns the updated OfficeView or null if the office/agent doesn't exist.
 */
export async function addAgentToOffice(
  officeId: string,
  userId: string,
  input: { agentId: string; stepOrder: number },
): Promise<OfficeView | null> {
  const membership = await prisma.officeMembership.findUnique({
    where: { officeId_userId: { officeId, userId } },
  });
  if (!membership) return null; // user is not a member

  const agent = await prisma.agent.findUnique({
    where: { id: input.agentId },
  });
  if (!agent) return null; // agent doesn't exist (any user's agent is fine)

  const snapshot = JSON.stringify(toAgentView(agent));

  await prisma.$transaction(async (tx) => {
    // Shift existing agents at stepOrder+ forward by 1.
    const existing = await tx.officeAgent.findMany({
      where: { officeId, stepOrder: { gte: input.stepOrder } },
      orderBy: { stepOrder: 'desc' },
    });
    // Process in reverse to avoid unique-constraint collisions.
    for (const oa of existing) {
      await tx.officeAgent.update({
        where: { id: oa.id },
        data: { stepOrder: oa.stepOrder + 1 },
      });
    }

    await tx.officeAgent.create({
      data: {
        officeId,
        stepOrder: input.stepOrder,
        agentSnapshot: snapshot,
      },
    });
  });

  return getOfficeById(officeId, userId);
}

/**
 * Remove an OfficeAgent from an office. Remaining agents are re-numbered
 * (the stepOrders after the removed position are shifted left by 1).
 */
export async function removeAgentFromOffice(
  officeId: string,
  officeAgentId: string,
  userId: string,
): Promise<OfficeView | null> {
  const membership = await prisma.officeMembership.findUnique({
    where: { officeId_userId: { officeId, userId } },
  });
  if (!membership) return null;

  const oa = await prisma.officeAgent.findFirst({
    where: { id: officeAgentId, officeId },
  });
  if (!oa) return null;

  await prisma.$transaction(async (tx) => {
    await tx.officeAgent.delete({ where: { id: officeAgentId } });

    // Shift remaining agents after this position left by 1.
    const trailing = await tx.officeAgent.findMany({
      where: { officeId, stepOrder: { gt: oa.stepOrder } },
      orderBy: { stepOrder: 'asc' },
    });
    for (const t of trailing) {
      await tx.officeAgent.update({
        where: { id: t.id },
        data: { stepOrder: t.stepOrder - 1 },
      });
    }
  });

  return getOfficeById(officeId, userId);
}

/**
 * Bulk reorder OfficeAgents in an office. Takes a list of
 * `{ id: <OfficeAgent id>, stepOrder: <new position> }`. The caller provides
 * the complete desired order for every agent in the office; the function
 * validates that all officeAgent ids belong to the office.
 *
 * Returns the updated OfficeView or null if the user is not a member.
 */
export async function reorderOfficeAgents(
  officeId: string,
  userId: string,
  input: { items: Array<{ id: string; stepOrder: number }> },
): Promise<OfficeView | null> {
  const membership = await prisma.officeMembership.findUnique({
    where: { officeId_userId: { officeId, userId } },
  });
  if (!membership) return null;

  await prisma.$transaction(async (tx) => {
    for (const item of input.items) {
      await tx.officeAgent.update({
        where: { id: item.id, officeId },
        data: { stepOrder: item.stepOrder },
      });
    }
  });

  return getOfficeById(officeId, userId);
}
