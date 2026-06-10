// Smoke test: confirms @repo/shared types and parsers are reachable from the
// orchestrator. Phase 6 will replace this with real pipeline tests, but having
// at least one cross-package consumer in place catches integration regressions
// (e.g. broken `exports`, missing `.d.ts`) immediately.
import { describe, expect, it } from 'vitest';
import {
  type Command,
  type Event,
  parseCommand,
  parseEvent,
  SHARED_PACKAGE_VERSION,
} from '@repo/shared';

describe('@repo/shared integration from orchestrator', () => {
  it('exposes the package version', () => {
    expect(SHARED_PACKAGE_VERSION).toBe('0.1.0');
  });

  it('parses a step.start event using the imported types', () => {
    const payload: Event = {
      type: 'step.start',
      taskId: 'task_smoke',
      officeId: 'office_smoke',
      ts: '2026-06-09T12:00:00.000Z',
      stepIndex: 0,
      agentRef: 'office_agent_smoke',
      role: 'planner',
    };
    const parsed = parseEvent(payload);
    expect(parsed.type).toBe('step.start');
    // narrowing must work via the discriminated union
    if (parsed.type === 'step.start') {
      expect(parsed.role).toBe('planner');
    }
  });

  it('parses a task.create command using the imported types', () => {
    const payload: Command = {
      type: 'task.create',
      ts: '2026-06-09T12:00:00.000Z',
      officeId: 'office_smoke',
      prompt: 'Smoke test prompt.',
    };
    const parsed = parseCommand(payload);
    expect(parsed.type).toBe('task.create');
  });
});
