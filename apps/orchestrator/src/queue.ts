// apps/orchestrator/src/queue — DB-backed job intake.
//
// Polls the Task table for rows with status `queued`, transitions them to
// `running` (locking them from other workers), and hands them off to the
// pipeline runner. Single-worker for MVP; scale-out later with `SELECT ...
// FOR UPDATE SKIP LOCKED` or a proper job queue.

import { prisma } from '@repo/db';
import type { Event as SharedEvent } from '@repo/shared';

// ── Types ──────────────────────────────────────────────────────────────────

/** A minimal representation of a task ready for execution. */
export interface QueuedTask {
  id: string;
  officeId: string;
  prompt: string;
}

// ── Queue poller ───────────────────────────────────────────────────────────

/**
 * Fetch the next queued task and lock it (set status = 'running').
 * Returns null if no queued tasks exist.
 */
export async function dequeueTask(): Promise<QueuedTask | null> {
  // In a single-worker MVP, a simple findFirst + update is fine.
  // For multi-worker, we'd use a transaction or SKIP LOCKED.
  const task = await prisma.task.findFirst({
    where: { status: 'queued' },
    orderBy: { createdAt: 'asc' },
  });
  if (!task) return null;

  // Lock it.
  await prisma.task.update({
    where: { id: task.id },
    data: { status: 'running' },
  });

  // Emit the task.status → running event.
  await persistTaskStatusEvent(task.id, task.officeId, 'running');

  return { id: task.id, officeId: task.officeId, prompt: task.prompt };
}

/**
 * Mark a task as done (success) or failed (error).
 */
export async function completeTask(
  taskId: string,
  officeId: string,
  status: 'done' | 'failed',
): Promise<void> {
  await prisma.task.update({
    where: { id: taskId },
    data: { status, finishedAt: new Date() },
  });
  await persistTaskStatusEvent(taskId, officeId, status);
}

// ── Startup reconciliation ─────────────────────────────────────────────────

/**
 * On orchestrator startup, any task stuck in `running` state is assumed to
 * have been abandoned by a previous crashed instance. Transition them to
 * `failed` so they don't block the queue forever.
 */
export async function reconcileStuckTasks(): Promise<number> {
  const result = await prisma.task.updateMany({
    where: { status: 'running' },
    data: { status: 'failed', finishedAt: new Date() },
  });
  if (result.count > 0) {
    console.log(`[queue] Reconciled ${result.count} stuck task(s) → failed`);
  }
  return result.count;
}

// ── Internal helpers ───────────────────────────────────────────────────────

async function persistTaskStatusEvent(
  taskId: string,
  officeId: string,
  status: 'queued' | 'running' | 'done' | 'failed',
): Promise<void> {
  const { persistEvent } = await import('./events.js');
  const event: SharedEvent = {
    type: 'task.status',
    taskId,
    officeId,
    ts: new Date().toISOString(),
    status,
  } as SharedEvent;
  await persistEvent(event);
}

// Re-export for convenience.
export { persistEvent } from './events.js';
