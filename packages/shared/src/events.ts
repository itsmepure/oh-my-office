// @repo/shared/events — Zod event contracts emitted by the orchestrator.
//
// Events drive both the persisted activity log and the live pixel office UI.
// They are validated on emit (orchestrator) and on receive (web client) so that
// no malformed payload ever reaches the Zustand store or the DB layer.
import { z } from 'zod';
import {
  agentRefSchema,
  idSchema,
  isoTimestampSchema,
  stepIndexSchema,
} from './ids.js';

/** Every event carries the same routing context. */
const eventBase = z.object({
  taskId: idSchema,
  officeId: idSchema,
  ts: isoTimestampSchema,
});

/** Task lifecycle status mirrored from the DB. */
export const taskStatusSchema = z.enum(['queued', 'running', 'done', 'failed']);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/** Step started — orchestrator dispatched a step to its bound agent. */
export const stepStartEventSchema = eventBase.extend({
  type: z.literal('step.start'),
  stepIndex: stepIndexSchema,
  agentRef: agentRefSchema,
  /** Display role for the activity feed (e.g. "planner", "coder"). */
  role: z.string().min(1),
});

/** Step completed successfully. */
export const stepDoneEventSchema = eventBase.extend({
  type: z.literal('step.done'),
  stepIndex: stepIndexSchema,
  agentRef: agentRefSchema,
});

/** Step failed (after retries exhausted, or hard error). */
export const stepFailedEventSchema = eventBase.extend({
  type: z.literal('step.failed'),
  stepIndex: stepIndexSchema,
  agentRef: agentRefSchema,
  error: z.string().min(1),
});

/** Agent is waiting on the LLM — drives "thinking" sprite state. */
export const agentThinkingEventSchema = eventBase.extend({
  type: z.literal('agent.thinking'),
  agentRef: agentRefSchema,
});

/** Agent invoked a tool — drives "working" sprite state. */
export const agentToolCallEventSchema = eventBase.extend({
  type: z.literal('agent.tool_call'),
  agentRef: agentRefSchema,
  tool: z.string().min(1),
  /** Tool arguments. Free-form JSON — tools validate their own input downstream. */
  args: z.record(z.unknown()),
});

/** Agent produced an output chunk for the current step. */
export const agentOutputEventSchema = eventBase.extend({
  type: z.literal('agent.output'),
  agentRef: agentRefSchema,
  output: z.string(),
});

/** Aggregated task status transition (for dashboards / list views). */
export const taskStatusEventSchema = eventBase.extend({
  type: z.literal('task.status'),
  status: taskStatusSchema,
});

/** Discriminated union of every event the orchestrator may emit. */
export const eventSchema = z.discriminatedUnion('type', [
  stepStartEventSchema,
  stepDoneEventSchema,
  stepFailedEventSchema,
  agentThinkingEventSchema,
  agentToolCallEventSchema,
  agentOutputEventSchema,
  taskStatusEventSchema,
]);

export type StepStartEvent = z.infer<typeof stepStartEventSchema>;
export type StepDoneEvent = z.infer<typeof stepDoneEventSchema>;
export type StepFailedEvent = z.infer<typeof stepFailedEventSchema>;
export type AgentThinkingEvent = z.infer<typeof agentThinkingEventSchema>;
export type AgentToolCallEvent = z.infer<typeof agentToolCallEventSchema>;
export type AgentOutputEvent = z.infer<typeof agentOutputEventSchema>;
export type TaskStatusEvent = z.infer<typeof taskStatusEventSchema>;
export type Event = z.infer<typeof eventSchema>;
export type EventType = Event['type'];
