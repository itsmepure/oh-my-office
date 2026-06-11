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
 * Atomically claim the next queued task: highest priority, then FIFO. Uses
 * `FOR UPDATE SKIP LOCKED` inside a transaction so multiple concurrent workers
 * never claim the same row. Sets status='running' + emits task.status before
 * returning. Returns null if nothing is queued.
 */
export async function dequeueTask(): Promise<QueuedTask | null> {
  // Raw SQL for the atomic claim — Prisma has no SKIP LOCKED primitive.
  const claimed = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string; officeId: string; prompt: string }>>(
      `SELECT id, "officeId", prompt
         FROM "Task"
        WHERE status = 'queued'
        ORDER BY priority DESC, "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
    );
    const row = rows[0];
    if (!row) return null;
    await tx.task.update({ where: { id: row.id }, data: { status: 'running' } });
    return row;
  });
  if (!claimed) return null;

  await persistTaskStatusEvent(claimed.id, claimed.officeId, 'running');
  return { id: claimed.id, officeId: claimed.officeId, prompt: claimed.prompt };
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
