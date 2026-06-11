'use client';

// React entry point for the PixiJS office scene. We dynamic-import the
// scene component so PixiJS never ends up in the SSR bundle (it touches
// `document` / `OffscreenCanvas` at module load time).

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { useRealtimeStore } from '@/lib/realtime-store';
import {
  reduceEventsToAgentStates,
  type AgentVisualState,
} from './event-to-state';
import type { OfficeAgentSnapshot } from '@repo/shared';

const PixelOfficeScene = dynamic(
  () => import('./pixel-office-scene').then((m) => m.PixelOfficeScene),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          height: 420,
          borderRadius: 12,
          background: '#1a1f2c',
          color: '#a8b0c0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 13,
        }}
      >
        Loading pixel office…
      </div>
    ),
  },
);

export interface PixelOfficeProps {
  agents: OfficeAgentSnapshot[];
  width?: number;
  height?: number;
}

/**
 * Wrapper that:
 *   1. Subscribes to the realtime store.
 *   2. Reduces events to per-agent visual states.
 *   3. Renders the PixiJS scene with that data, plus a textual agent list
 *      that mirrors the same state (accessible fallback / quick visual).
 */
export function PixelOffice({ agents, width, height }: PixelOfficeProps) {
  // useRealtimeStore is a vanilla store — we read it once per render via the
  // React subscription; the selector returns a stable primitive array.
  const records = useRealtimeStore((s) => s.records);

  const derived = useMemo(() => {
    // See comment in `specs` below: agentRef == OfficeAgent.id.
    const refs = agents.map((a) => a.id);
    const snap = reduceEventsToAgentStates(records.map((r) => r.event), refs);
    return snap;
  }, [records, agents]);

  const specs = useMemo(
    () =>
      agents.map((a) => ({
        // Use OfficeAgent.id as the ref — the orchestrator emits
        // `agentRef: oa.id` for every event (apps/orchestrator/src/runner.ts).
        // The OfficeAgent.id is unique within the office, so it maps
        // 1:1 to the OfficeAgentSnapshot we receive from the server.
        ref: a.id,
        name: a.agent.name,
        role: a.agent.role,
      })),
    [agents],
  );

  return (
    <div className="flex flex-col gap-3">
      <PixelOfficeScene agents={specs} width={width} height={height} />
      <ul
        aria-label="agent states"
        className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3"
      >
        {agents.map((a) => {
          const state: AgentVisualState = derived.byAgent[a.id] ?? 'idle';
          return (
            <li
              key={a.id}
              data-testid="agent-state-row"
              data-agent-ref={a.id}
              data-state={state}
              className="flex items-center justify-between border border-line bg-surface-2 px-2 py-1"
            >
              <span className="truncate">
                <span className="font-medium text-content">{a.agent.name}</span>
                {a.agent.role && a.agent.role !== a.agent.name && (
                  <span className="text-content-muted"> · {a.agent.role}</span>
                )}
              </span>
              <span
                className={
                  'px-1.5 py-0.5 font-mono text-[10px] uppercase ' +
                  (state === 'working'
                    ? 'bg-accent/15 text-accent'
                    : state === 'thinking'
                      ? 'bg-accent/10 text-accent-dim'
                      : state === 'done'
                        ? 'bg-success/15 text-success'
                        : 'bg-surface text-content-muted')
                }
              >
                {state}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
