import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  type Event,
  type EventType,
  parseEvent,
  safeParseEvent,
} from './index.js';

const TS = '2026-06-09T12:00:00.000Z';
const TASK_ID = 'task_01';
const OFFICE_ID = 'office_01';
const AGENT_REF = 'office_agent_01';

/**
 * One valid sample per event type. Keyed by `EventType` so the TS compiler
 * forces a sample for every member of the discriminated union — if a new event
 * type is added without a sample here, this file will fail to type-check.
 */
const validSamples: Record<EventType, Event> = {
  'step.start': {
    type: 'step.start',
    taskId: TASK_ID,
    officeId: OFFICE_ID,
    ts: TS,
    stepIndex: 0,
    agentRef: AGENT_REF,
    role: 'planner',
  },
  'step.done': {
    type: 'step.done',
    taskId: TASK_ID,
    officeId: OFFICE_ID,
    ts: TS,
    stepIndex: 0,
    agentRef: AGENT_REF,
  },
  'step.failed': {
    type: 'step.failed',
    taskId: TASK_ID,
    officeId: OFFICE_ID,
    ts: TS,
    stepIndex: 1,
    agentRef: AGENT_REF,
    error: 'LLM call failed after 3 retries',
  },
  'agent.thinking': {
    type: 'agent.thinking',
    taskId: TASK_ID,
    officeId: OFFICE_ID,
    ts: TS,
    agentRef: AGENT_REF,
  },
  'agent.tool_call': {
    type: 'agent.tool_call',
    taskId: TASK_ID,
    officeId: OFFICE_ID,
    ts: TS,
    agentRef: AGENT_REF,
    tool: 'read_file',
    args: { path: 'README.md' },
  },
  'agent.output': {
    type: 'agent.output',
    taskId: TASK_ID,
    officeId: OFFICE_ID,
    ts: TS,
    agentRef: AGENT_REF,
    output: 'Plan complete.',
  },
  'task.status': {
    type: 'task.status',
    taskId: TASK_ID,
    officeId: OFFICE_ID,
    ts: TS,
    status: 'running',
  },
};

describe('parseEvent — valid payloads', () => {
  for (const [eventType, sample] of Object.entries(validSamples)) {
    it(`parses ${eventType}`, () => {
      const parsed = parseEvent(sample);
      expect(parsed).toEqual(sample);
      expect(parsed.type).toBe(eventType);
    });
  }
});

describe('parseEvent — invalid payloads', () => {
  it('throws when type is missing', () => {
    const { type: _omit, ...rest } = validSamples['step.start'];
    expect(() => parseEvent(rest)).toThrow(ZodError);
  });

  it('throws when type is unknown', () => {
    expect(() =>
      parseEvent({ ...validSamples['step.start'], type: 'step.bogus' }),
    ).toThrow(ZodError);
  });

  it('throws when ts is not an ISO datetime', () => {
    expect(() =>
      parseEvent({ ...validSamples['agent.thinking'], ts: 'yesterday' }),
    ).toThrow(ZodError);
  });

  it('throws when taskId is empty', () => {
    expect(() =>
      parseEvent({ ...validSamples['step.done'], taskId: '' }),
    ).toThrow(ZodError);
  });

  it('throws when stepIndex is negative', () => {
    expect(() =>
      parseEvent({ ...validSamples['step.start'], stepIndex: -1 }),
    ).toThrow(ZodError);
  });

  it('throws when stepIndex is fractional', () => {
    expect(() =>
      parseEvent({ ...validSamples['step.start'], stepIndex: 1.5 }),
    ).toThrow(ZodError);
  });

  it('throws when step.failed.error is empty', () => {
    expect(() =>
      parseEvent({ ...validSamples['step.failed'], error: '' }),
    ).toThrow(ZodError);
  });

  it('throws when agent.tool_call.tool is empty', () => {
    expect(() =>
      parseEvent({ ...validSamples['agent.tool_call'], tool: '' }),
    ).toThrow(ZodError);
  });

  it('throws when agent.tool_call.args is not an object', () => {
    expect(() =>
      parseEvent({ ...validSamples['agent.tool_call'], args: 'oops' }),
    ).toThrow(ZodError);
  });

  it('throws when task.status uses an unknown status', () => {
    expect(() =>
      parseEvent({ ...validSamples['task.status'], status: 'spinning' }),
    ).toThrow(ZodError);
  });

  it('throws when a required field is missing for the variant', () => {
    // step.start without role
    const { role: _omit, ...rest } = validSamples['step.start'];
    expect(() => parseEvent(rest)).toThrow(ZodError);
  });
});

describe('safeParseEvent', () => {
  it('returns success=true on valid input', () => {
    const result = safeParseEvent(validSamples['agent.output']);
    expect(result.success).toBe(true);
  });

  it('returns success=false on invalid input (no throw)', () => {
    const result = safeParseEvent({ type: 'nope' });
    expect(result.success).toBe(false);
  });
});
