// @repo/shared/ids — primitives shared across schemas.
import { z } from 'zod';

/** Non-empty ID string. Tightened to specific formats (cuid/uuid) at the data layer. */
export const idSchema = z.string().min(1, 'id must be non-empty');

/** ISO-8601 timestamp string (e.g. produced by `new Date().toISOString()`). */
export const isoTimestampSchema = z.string().datetime({
  offset: true,
  message: 'ts must be an ISO-8601 datetime string',
});

/** Reference to an agent participant inside an office (the OfficeAgent id). */
export const agentRefSchema = idSchema;

/** Workflow step index, zero-based. */
export const stepIndexSchema = z.number().int().nonnegative();

export type Id = z.infer<typeof idSchema>;
export type IsoTimestamp = z.infer<typeof isoTimestampSchema>;
export type AgentRef = z.infer<typeof agentRefSchema>;
export type StepIndex = z.infer<typeof stepIndexSchema>;
