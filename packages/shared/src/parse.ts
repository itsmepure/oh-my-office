// @repo/shared/parse — strict-parse helpers for cross-process payloads.
//
// Per CLAUDE.md non-negotiable rule #2: every cross-process payload MUST be
// validated with shared Zod schemas. These helpers throw `ZodError` on invalid
// input, surfacing problems at the boundary instead of letting them propagate.
import { commandSchema, type Command } from './commands.js';
import { eventSchema, type Event } from './events.js';

/** Parse an unknown payload as an Event. Throws ZodError on failure. */
export function parseEvent(input: unknown): Event {
  return eventSchema.parse(input);
}

/** Safe variant that returns a Zod result instead of throwing. */
export function safeParseEvent(input: unknown) {
  return eventSchema.safeParse(input);
}

/** Parse an unknown payload as a Command. Throws ZodError on failure. */
export function parseCommand(input: unknown): Command {
  return commandSchema.parse(input);
}

/** Safe variant that returns a Zod result instead of throwing. */
export function safeParseCommand(input: unknown) {
  return commandSchema.safeParse(input);
}
