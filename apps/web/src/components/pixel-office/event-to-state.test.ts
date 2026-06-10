import { describe, expect, it } from 'vitest';
import {
  reduceEventsToAgentStates,
  EMPTY_AGENT_STATE,
  type AgentStateSnapshot,
} from './event-to-state';
import type { Event as SharedEvent } from '@repo/shared';

function stepStart(agentRef: string, stepIndex = 0): SharedEvent {
  return {
    type: 'step.start',
    taskId: 't1',
    officeId: 'o1',
    ts: '2026-06-10T00:00:00.000Z',
    stepIndex,
    agentRef,
    role: 'planner',
  };
}

function thinking(agentRef: string): SharedEvent {
  return {
    type: 'agent.thinking',
    taskId: 't1',
    officeId: 'o1',
    ts: '2026-06-10T00:00:01.000Z',
    agentRef,
  };
}

function toolCall(agentRef: string, tool = 'read'): SharedEvent {
  return {
    type: 'agent.tool_call',
    taskId: 't1',
    officeId: 'o1',
    ts: '2026-06-10T00:00:02.000Z',
    agentRef,
    tool,
    args: {},
  };
}

function output(agentRef: string): SharedEvent {
  return {
    type: 'agent.output',
    taskId: 't1',
    officeId: 'o1',
    ts: '2026-06-10T00:00:03.000Z',
    agentRef,
    output: 'hello',
  };
}

function stepDone(agentRef: string, stepIndex = 0): SharedEvent {
  return {
    type: 'step.done',
    taskId: 't1',
    officeId: 'o1',
    ts: '2026-06-10T00:00:04.000Z',
    stepIndex,
    agentRef,
  };
}

function stepFailed(agentRef: string, stepIndex = 0): SharedEvent {
  return {
    type: 'step.failed',
    taskId: 't1',
    officeId: 'o1',
    ts: '2026-06-10T00:00:04.000Z',
    stepIndex,
    agentRef,
    error: 'boom',
  };
}

function taskStatus(status: 'queued' | 'running' | 'done' | 'failed'): SharedEvent {
  return {
    type: 'task.status',
    taskId: 't1',
    officeId: 'o1',
    ts: '2026-06-10T00:00:00.000Z',
    status,
  };
}

describe('reduceEventsToAgentStates', () => {
  it('returns an empty snapshot for no events', () => {
    const snap: AgentStateSnapshot = reduceEventsToAgentStates([], []);
    expect(snap).toEqual(EMPTY_AGENT_STATE);
  });

  it('seeds known agents as idle so the scene shows them up front', () => {
    const snap = reduceEventsToAgentStates([], ['a', 'b', 'c']);
    expect(snap.byAgent).toEqual({ a: 'idle', b: 'idle', c: 'idle' });
    expect(snap.activeAgent).toBeUndefined();
  });

  it('step.start sets the agent to working and makes it active', () => {
    const snap = reduceEventsToAgentStates([stepStart('planner')], ['planner']);
    expect(snap.byAgent.planner).toBe('working');
    expect(snap.activeAgent).toBe('planner');
  });

  it('agent.thinking sets thinking state', () => {
    const snap = reduceEventsToAgentStates([stepStart('p'), thinking('p')], ['p']);
    expect(snap.byAgent.p).toBe('thinking');
  });

  it('agent.tool_call sets working and increments tool-call counter', () => {
    const snap = reduceEventsToAgentStates(
      [stepStart('c'), toolCall('c', 'write'), toolCall('c', 'write'), toolCall('c', 'bash')],
      ['c'],
    );
    expect(snap.byAgent.c).toBe('working');
    expect(snap.toolCallsByAgent.c).toBe(3);
  });

  it('agent.output sets working and increments output counter', () => {
    const snap = reduceEventsToAgentStates(
      [stepStart('c'), output('c'), output('c')],
      ['c'],
    );
    expect(snap.byAgent.c).toBe('working');
    expect(snap.outputsByAgent.c).toBe(2);
  });

  it('step.done sets done and remains the most recent active', () => {
    const snap = reduceEventsToAgentStates(
      [stepStart('c'), output('c'), stepDone('c')],
      ['c'],
    );
    expect(snap.byAgent.c).toBe('done');
    expect(snap.activeAgent).toBe('c');
  });

  it('step.failed also resolves to done (settled)', () => {
    const snap = reduceEventsToAgentStates(
      [stepStart('c'), stepFailed('c')],
      ['c'],
    );
    expect(snap.byAgent.c).toBe('done');
    expect(snap.activeAgent).toBe('c');
  });

  it('activeAgent follows the most recent non-idle event', () => {
    const snap = reduceEventsToAgentStates(
      [stepStart('a'), stepDone('a'), stepStart('b'), thinking('b')],
      ['a', 'b'],
    );
    expect(snap.activeAgent).toBe('b');
    expect(snap.byAgent.a).toBe('done');
    expect(snap.byAgent.b).toBe('thinking');
  });

  it('task.status events do not change any agent state', () => {
    const snap = reduceEventsToAgentStates(
      [taskStatus('running'), taskStatus('done')],
      ['a'],
    );
    expect(snap.byAgent.a).toBe('idle');
    expect(snap.activeAgent).toBeUndefined();
  });

  it('multi-step workflow: planner -> coder -> reviewer each take their turn', () => {
    const events: SharedEvent[] = [
      stepStart('planner', 0),
      output('planner'),
      stepDone('planner', 0),
      stepStart('coder', 1),
      toolCall('coder', 'write'),
      stepDone('coder', 1),
      stepStart('reviewer', 2),
      thinking('reviewer'),
      stepDone('reviewer', 2),
    ];
    const snap = reduceEventsToAgentStates(events, ['planner', 'coder', 'reviewer']);
    expect(snap.byAgent).toEqual({
      planner: 'done',
      coder: 'done',
      reviewer: 'done',
    });
    expect(snap.activeAgent).toBe('reviewer');
    expect(snap.toolCallsByAgent.coder).toBe(1);
    expect(snap.outputsByAgent.planner).toBe(1);
  });
});
