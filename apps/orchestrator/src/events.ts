// apps/orchestrator/src/events — persist pipeline events to the DB.
//
// Every event the pipeline runner emits is persisted here BEFORE the next
// step proceeds. This ensures the activity log is durable even if the
// orchestrator crashes mid-task. Phase 7 adds WebSocket broadcast on top.

import type { Event as SharedEvent } from '@repo/shared';
import { prisma } from '@repo/db';
import { broadcastPersistedEvent } from './realtime.js';

/**
 * Persist a single event to the Postgres Event table.
 * Uses Zod-validated shared types (via the type annotations, enforced at
 * the emit site). Returns the created row's id.
 */
export async function persistEvent(event: SharedEvent): Promise<string> {
  const row = await prisma.event.create({
    data: {
      taskId: event.taskId,
      officeId: event.officeId,
      type: event.type,
      // Prisma's Json type needs a JSON-compatible value; stringify + parse
      // ensures it's a plain object.
      payload: JSON.parse(JSON.stringify(event)),
      ts: new Date(event.ts),
      agentRef: 'agentRef' in event ? (event as { agentRef?: string }).agentRef ?? null : null,
    },
  });

  // Broadcast AFTER durable persistence. If no realtime server is running,
  // this is a no-op. Include DB row id so reconnecting clients can dedupe.
  broadcastPersistedEvent(event, row.id);
  return row.id;
}
