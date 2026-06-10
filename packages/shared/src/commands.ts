// @repo/shared/commands — Zod command contracts sent from web to orchestrator.
//
// Commands are user intents: "create an office", "run a task". They are validated
// at the API boundary (Next.js server action / route handler) before persistence.
import { z } from 'zod';
import { idSchema, isoTimestampSchema } from './ids.js';

const commandBase = z.object({
  ts: isoTimestampSchema,
});

/** Create an Office Instance from a Template (snapshot-copies its agents). */
export const officeCreateCommandSchema = commandBase.extend({
  type: z.literal('office.create'),
  templateId: idSchema,
  name: z.string().min(1, 'office name is required').max(120),
});

/** Submit a task to be executed by the office workflow pipeline. */
export const taskCreateCommandSchema = commandBase.extend({
  type: z.literal('task.create'),
  officeId: idSchema,
  prompt: z.string().min(1, 'prompt cannot be empty'),
});

/** Discriminated union of every command the web app may issue. */
export const commandSchema = z.discriminatedUnion('type', [
  officeCreateCommandSchema,
  taskCreateCommandSchema,
]);

export type OfficeCreateCommand = z.infer<typeof officeCreateCommandSchema>;
export type TaskCreateCommand = z.infer<typeof taskCreateCommandSchema>;
export type Command = z.infer<typeof commandSchema>;
export type CommandType = Command['type'];
