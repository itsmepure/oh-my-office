// Pure mapping from a stream of orchestrator events to a per-agent visual
// state map. Kept dependency-free so it can be unit tested without PixiJS,
// React, or the Zustand store. The same function powers:
//   - the live PixiJS scene (driven by the realtime store)
//   - the activity feed's per-agent badge (driven by the same store)
//   - replay from `/api/events` on reconnect / refresh
//
// The function is intentionally a *pure* reducer: same input -> same output.
// That makes it trivial to reason about during reconnect/replay.

import type { Event as SharedEvent } from '@repo/shared';

export type AgentVisualState = 'idle' | 'thinking' | 'working' | 'done';

export interface AgentStateSnapshot {
  /** Map of `agentRef` -> current visual state. */
  byAgent: Record<string, AgentVisualState>;
  /** The `agentRef` of the most recently active agent (for the "spotlight"). */
  activeAgent?: string;
  /** Per-agent activity count — useful for the activity feed / metrics. */
  toolCallsByAgent: Record<string, number>;
  /** Per-agent output chunk count. */
  outputsByAgent: Record<string, number>;
}

const EMPTY: AgentStateSnapshot = {
  byAgent: {},
  activeAgent: undefined,
  toolCallsByAgent: {},
  outputsByAgent: {},
};

/**
 * Reduce an ordered list of events to a per-agent state snapshot.
 *
 * Rules (kept aligned with the realtime-store docs):
 *   - `step.start`    -> the bound agent is `working`
 *   - `agent.thinking` -> the agent is `thinking`
 *   - `agent.tool_call` -> the agent is `working`
 *   - `agent.output`   -> the agent is `working` (still emitting)
 *   - `step.done`      -> the agent is `done`
 *   - `step.failed`    -> the agent is `done` (failed is still "settled")
 *
 * The most recent non-idle event wins for `activeAgent`. Per-agent counters
 * accumulate `tool_call` and `output` events. `task.status` events are
 * ignored here — they describe the whole task, not any specific agent.
 */
export function reduceEventsToAgentStates(
  events: readonly SharedEvent[],
  knownAgentRefs: readonly string[] = [],
): AgentStateSnapshot {
  const byAgent: Record<string, AgentVisualState> = {};
  const toolCallsByAgent: Record<string, number> = {};
  const outputsByAgent: Record<string, number> = {};
  let activeAgent: string | undefined;

  // Seed every known agent as `idle` so the scene shows them up front.
  for (const ref of knownAgentRefs) byAgent[ref] = 'idle';

  for (const ev of events) {
    switch (ev.type) {
      case 'step.start':
        byAgent[ev.agentRef] = 'working';
        activeAgent = ev.agentRef;
        break;
      case 'agent.thinking':
        byAgent[ev.agentRef] = 'thinking';
        activeAgent = ev.agentRef;
        break;
      case 'agent.tool_call':
        byAgent[ev.agentRef] = 'working';
        activeAgent = ev.agentRef;
        toolCallsByAgent[ev.agentRef] = (toolCallsByAgent[ev.agentRef] ?? 0) + 1;
        break;
      case 'agent.output':
        byAgent[ev.agentRef] = 'working';
        activeAgent = ev.agentRef;
        outputsByAgent[ev.agentRef] = (outputsByAgent[ev.agentRef] ?? 0) + 1;
        break;
      case 'step.done':
      case 'step.failed':
        byAgent[ev.agentRef] = 'done';
        activeAgent = ev.agentRef;
        break;
      case 'task.status':
        // Task-level signal. When the whole task settles (done/failed), all
        // agents return to idle — the run is over, nobody is working anymore.
        if (ev.status === 'done' || ev.status === 'failed') {
          for (const ref of Object.keys(byAgent)) byAgent[ref] = 'idle';
          activeAgent = undefined;
        }
        break;
    }
  }

  return { byAgent, activeAgent, toolCallsByAgent, outputsByAgent };
}

export const EMPTY_AGENT_STATE: AgentStateSnapshot = EMPTY;
