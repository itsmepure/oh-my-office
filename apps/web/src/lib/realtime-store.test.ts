import { describe, expect, it } from 'vitest';
import type { Event as SharedEvent } from '@repo/shared';
import { mergeEventRecords } from './realtime-store';

function ev(type: SharedEvent['type'], overrides: Partial<SharedEvent> = {}): SharedEvent {
  const base = {
    type,
    taskId: 'task-1',
    officeId: 'office-1',
    ts: new Date().toISOString(),
  };
  if (type === 'agent.thinking') {
    return { ...base, agentRef: 'agent-1', ...overrides } as SharedEvent;
  }
  if (type === 'agent.tool_call') {
    return { ...base, agentRef: 'agent-1', tool: 'read_file', args: {}, ...overrides } as SharedEvent;
  }
  if (type === 'agent.output') {
    return { ...base, agentRef: 'agent-1', output: 'done', ...overrides } as SharedEvent;
  }
  if (type === 'step.done') {
    return { ...base, stepIndex: 1, agentRef: 'agent-1', ...overrides } as SharedEvent;
  }
  if (type === 'step.failed') {
    return { ...base, stepIndex: 1, agentRef: 'agent-1', error: 'boom', ...overrides } as SharedEvent;
  }
  if (type === 'step.start') {
    return { ...base, stepIndex: 1, agentRef: 'agent-1', role: 'Planner', ...overrides } as SharedEvent;
  }
  return { ...base, status: 'running', ...overrides } as SharedEvent;
}

describe('mergeEventRecords', () => {
  it('dedupes by DB id and sorts by event timestamp', () => {
    const later = { id: '2', event: ev('agent.output', { ts: '2026-06-10T00:00:02.000Z' }), ts: '2026-06-10T00:00:02.000Z' };
    const earlier = { id: '1', event: ev('agent.thinking', { ts: '2026-06-10T00:00:01.000Z' }), ts: '2026-06-10T00:00:01.000Z' };

    const merged = mergeEventRecords([later], [earlier, later]);

    expect(merged.map((r) => r.id)).toEqual(['1', '2']);
  });

  it('falls back to synthetic key for live events without DB id', () => {
    const live = { event: ev('agent.output', { output: 'same' }), ts: '2026-06-10T00:00:02.000Z' };
    const merged = mergeEventRecords([live], [live]);
    expect(merged).toHaveLength(1);
  });
});
