// @repo/db/agents — CRUD for user-owned agents + their knowledge docs.
//
// Per Non-Negotiable Rule #6 (multi-tenant): every read/update/delete scoped
// to `ownerId`. Users only touch their own agents. Platform agents (ownerId=null)
// are read-only from here.
//
// Knowledge docs cascade-delete with the agent (onDelete: Cascade in Prisma).

import { prisma } from './index.js';
import type { AgentView, AgentCreateInput, AgentUpdateInput, KnowledgeDocView } from '@repo/shared';
import * as PrismaTypes from './generated/internal/prismaNamespace.js';

// ── Internal helpers ───────────────────────────────────────────────────────

function toAgentView(row: {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  tools: PrismaTypes.JsonValue;
  modelConfig: PrismaTypes.JsonValue;
}): AgentView {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    systemPrompt: row.systemPrompt,
    tools: parseStringArray(row.tools),
    modelConfig: parseRecord(row.modelConfig),
  };
}

function parseStringArray(raw: PrismaTypes.JsonValue): string[] {
  try {
    const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const parsed = JSON.parse(s) as unknown;
    if (Array.isArray(parsed) && parsed.every((t) => typeof t === 'string'))
      return parsed;
    return [];
  } catch {
    return [];
  }
}

function parseRecord(raw: PrismaTypes.JsonValue): Record<string, unknown> {
  try {
    const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const parsed = JSON.parse(s) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      return parsed as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

// ── Agent CRUD ─────────────────────────────────────────────────────────────

/**
 * Create a user-owned agent, optionally with knowledge docs.
 * Returns the created AgentView (without knowledge docs attached — fetch them
 * separately via `getAgentById` with `includeDocs: true`).
 */
export async function createAgent(
  ownerId: string,
  input: AgentCreateInput,
): Promise<AgentView> {
  const { knowledgeDocs, modelConfig, ...agentInput } = input;

  const agent = await prisma.$transaction(async (tx) => {
    const created = await tx.agent.create({
      data: {
        ownerId,
        name: agentInput.name,
        role: agentInput.role,
        systemPrompt: agentInput.systemPrompt,
        tools: JSON.stringify(agentInput.tools),
        modelConfig: JSON.stringify(modelConfig ?? {}),
      },
    });

    const docs = knowledgeDocs ?? [];
    if (docs.length > 0) {
      await tx.knowledgeDoc.createMany({
        data: docs.map((d) => ({
          agentId: created.id,
          title: d.title,
          content: d.content,
        })),
      });
    }

    return created;
  });

  return toAgentView(agent);
}

/** List every agent the given user owns, newest first. */
export async function listUserAgents(userId: string): Promise<AgentView[]> {
  const rows = await prisma.agent.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toAgentView);
}

/**
 * List platform-provided agents (ownerId = null). These are the built-in
 * library agents any user can add to an office. Sorted by name for a stable
 * picker order.
 */
export async function listPlatformAgents(): Promise<AgentView[]> {
  const rows = await prisma.agent.findMany({
    where: { ownerId: null },
    orderBy: { name: 'asc' },
  });
  return rows.map(toAgentView);
}

/** Fetch a single agent. If `includeDocs` is true, attaches knowledge docs. */
export async function getAgentById(
  agentId: string,
  userId: string,
  opts?: { includeDocs?: boolean },
): Promise<(AgentView & { knowledgeDocs?: KnowledgeDocView[] }) | null> {
  const row = await prisma.agent.findFirst({
    where: { id: agentId, ownerId: userId },
    include: opts?.includeDocs ? { knowledgeDocs: { orderBy: { createdAt: 'asc' } } } : undefined,
  });
  if (!row) return null;

  const agent = toAgentView(row);
  if (opts?.includeDocs) {
    const docs = (row as { knowledgeDocs?: Array<{ id: string; agentId: string; title: string; content: string | null; createdAt: Date }> }).knowledgeDocs;
    if (docs) {
      return {
        ...agent,
        knowledgeDocs: docs.map((d) => ({
          id: d.id,
          agentId: d.agentId,
          title: d.title,
          content: d.content,
          createdAt: d.createdAt.toISOString(),
        })),
      };
    }
  }
  return agent;
}

/**
 * Partial update of a user-owned agent. Only the fields present in `input`
 * are changed. Does NOT touch knowledge docs (use createDoc / deleteDoc for
 * those).
 */
export async function updateAgent(
  agentId: string,
  userId: string,
  input: AgentUpdateInput,
): Promise<AgentView | null> {
  // Verify ownership first.
  const existing = await prisma.agent.findFirst({
    where: { id: agentId, ownerId: userId },
  });
  if (!existing) return null;

  const updated = await prisma.agent.update({
    where: { id: agentId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.role !== undefined && { role: input.role }),
      ...(input.systemPrompt !== undefined && { systemPrompt: input.systemPrompt }),
      ...(input.tools !== undefined && { tools: JSON.stringify(input.tools) }),
      ...(input.modelConfig !== undefined && { modelConfig: JSON.stringify(input.modelConfig) }),
    },
  });
  return toAgentView(updated);
}

/**
 * Delete a user-owned agent. Knowledge docs cascade (onDelete: Cascade).
 * Returns true if deleted, false if not found / not owned by userId.
 */
export async function deleteAgent(agentId: string, userId: string): Promise<boolean> {
  const existing = await prisma.agent.findFirst({
    where: { id: agentId, ownerId: userId },
  });
  if (!existing) return false;

  await prisma.agent.delete({ where: { id: agentId } });
  return true;
}

// ── Knowledge docs ─────────────────────────────────────────────────────────

/** Add a knowledge doc to a user-owned agent. Returns null if agent not found. */
export async function createKnowledgeDoc(
  agentId: string,
  userId: string,
  input: { title: string; content: string },
): Promise<KnowledgeDocView | null> {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, ownerId: userId },
  });
  if (!agent) return null;

  const doc = await prisma.knowledgeDoc.create({
    data: { agentId, title: input.title, content: input.content },
  });
  return {
    id: doc.id,
    agentId: doc.agentId,
    title: doc.title,
    content: doc.content,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** Delete a knowledge doc. Returns true if the doc existed and belonged to the user. */
export async function deleteKnowledgeDoc(
  docId: string,
  userId: string,
): Promise<boolean> {
  const doc = await prisma.knowledgeDoc.findFirst({
    where: { id: docId },
    include: { agent: { select: { ownerId: true } } },
  });
  if (!doc || doc.agent.ownerId !== userId) return false;

  await prisma.knowledgeDoc.delete({ where: { id: docId } });
  return true;
}
