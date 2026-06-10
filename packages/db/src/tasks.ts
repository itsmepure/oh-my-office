// @repo/db/tasks — read helpers for task history + task detail (Phase 9).
//
// Per Non-Negotiable Rule #6 (multi-tenant by default): every read is scoped
// through the office's `OfficeMembership`. A user can only see tasks that
// belong to an office they are a member of. A task id that exists but lives in
// another user's office reads as `null` (indistinguishable from "not found"),
// so we never leak cross-tenant existence.

import { prisma } from './index.js';
import { eventSchema, type ArtifactView, type Event as SharedEvent, type TaskDetailView, type TaskSummaryView } from '@repo/shared';

// ── Task history (office dashboard) ────────────────────────────────────────

/**
 * List every task for an office the user can access, newest first. Each row
 * carries lightweight event/artifact counts for the history list (no full
 * payloads — that's what the detail view is for).
 *
 * Returns `[]` if the office doesn't exist or the user isn't a member —
 * callers should pair this with an office-access check if they need to
 * distinguish "no tasks" from "no access".
 */
export async function listOfficeTasks(
  officeId: string,
  userId: string,
): Promise<TaskSummaryView[]> {
  const membership = await prisma.officeMembership.findUnique({
    where: { officeId_userId: { officeId, userId } },
    select: { id: true },
  });
  if (!membership) return [];

  const rows = await prisma.task.findMany({
    where: { officeId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { events: true, artifacts: true } },
    },
  });

  return rows.map((t) => ({
    id: t.id,
    officeId: t.officeId,
    prompt: t.prompt,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    finishedAt: t.finishedAt ? t.finishedAt.toISOString() : null,
    eventCount: t._count.events,
    artifactCount: t._count.artifacts,
  }));
}

// ── Task detail (artifacts + full activity log) ────────────────────────────

/**
 * Fetch a single task with its ordered events and produced artifacts, scoped
 * to a user who is a member of the owning office. Returns `null` if the task
 * doesn't exist OR the user can't access its office (no cross-tenant leak).
 *
 * Events whose stored payload fails schema validation are skipped rather than
 * throwing — a single malformed historical row should not break the page.
 */
export async function getTaskDetail(
  taskId: string,
  userId: string,
): Promise<TaskDetailView | null> {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      office: { memberships: { some: { userId } } },
    },
    include: {
      office: { select: { name: true } },
      events: { orderBy: [{ ts: 'asc' }, { id: 'asc' }] },
      artifacts: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!task) return null;

  const events: SharedEvent[] = [];
  for (const row of task.events) {
    const parsed = eventSchema.safeParse(row.payload);
    if (parsed.success) events.push(parsed.data);
  }

  const artifacts: ArtifactView[] = task.artifacts.map((a) => ({
    id: a.id,
    taskId: a.taskId,
    type: a.type,
    name: a.name,
    content: a.content,
    fileRef: a.fileRef,
    createdAt: a.createdAt.toISOString(),
  }));

  return {
    id: task.id,
    officeId: task.officeId,
    officeName: task.office.name,
    prompt: task.prompt,
    status: task.status,
    createdAt: task.createdAt.toISOString(),
    finishedAt: task.finishedAt ? task.finishedAt.toISOString() : null,
    events,
    artifacts,
  };
}
