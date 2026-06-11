'use client';

import { useEffect } from 'react';
import type { OfficeView } from '@repo/shared';
import { useRealtimeStore } from '@/lib/realtime-store';
import { reduceEventsToAgentStates } from '@/components/pixel-office/event-to-state';

interface Props {
  officeId: string;
  agents: OfficeView['agents'];
}

/** Short, stable color for an agent identity dot (deterministic by ref). */
const AGENT_DOT = ['bg-accent', 'bg-success', 'bg-[#6aa3f7]', 'bg-[#c98bff]', 'bg-[#f7913a]'];

export function ActivityFeed({ officeId, agents }: Props) {
  const records = useRealtimeStore((s) => s.records);
  const status = useRealtimeStore((s) => s.status);
  const lastError = useRealtimeStore((s) => s.lastError);
  const connect = useRealtimeStore((s) => s.connect);
  const disconnect = useRealtimeStore((s) => s.disconnect);

  useEffect(() => {
    void connect({ officeId });
    return () => disconnect();
  }, [connect, disconnect, officeId]);

  // Map OfficeAgent id (== event.agentRef) -> display name + step order, so each
  // activity row shows WHO did it instead of a raw id fragment.
  const agentMeta = new Map<string, { name: string; stepOrder: number; dotIdx: number }>();
  agents
    .slice()
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .forEach((a, i) => {
      agentMeta.set(a.id, { name: a.agent.name, stepOrder: a.stepOrder, dotIdx: i % AGENT_DOT.length });
    });

  const agentStates = reduceEventsToAgentStates(records.map((r) => r.event)).byAgent;

  // Newest first so the latest activity is always visible at the top — no
  // manual scrolling needed.
  const ordered = records.slice().reverse();

  function labelFor(ref: string): { name: string; dot: string } {
    const meta = agentMeta.get(ref);
    if (meta) return { name: meta.name, dot: AGENT_DOT[meta.dotIdx]! };
    return { name: ref.slice(0, 8), dot: 'bg-content-faint' };
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-content-faint">{records.length} events</span>
        <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-content-muted">
          {status}
        </span>
      </div>

      {lastError && (
        <div className="mb-3 border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{lastError}</div>
      )}

      {/* Per-agent live status chips. */}
      {Object.keys(agentStates).length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {Object.entries(agentStates).map(([agentRef, state]) => {
            const { name, dot } = labelFor(agentRef);
            return (
              <span
                key={agentRef}
                className="inline-flex items-center gap-1.5 border border-line bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-content-muted"
              >
                <span className={`h-1.5 w-1.5 ${dot}`} aria-hidden />
                {name}: <span className="text-content">{state}</span>
              </span>
            );
          })}
        </div>
      )}

      {records.length === 0 ? (
        <p className="border border-dashed border-line p-4 text-xs text-content-muted">
          No events yet. Queue a task, or wait for replay if this office already has tasks.
        </p>
      ) : (
        <ol className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {ordered.map((record, idx) => {
            const event = record.event;
            const hasAgent = 'agentRef' in event && event.agentRef;
            const id = hasAgent ? labelFor(event.agentRef as string) : null;
            return (
              <li
                key={record.id ?? `${event.taskId}-${event.ts}-${idx}`}
                className="border border-line bg-surface-2 p-2.5 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-accent">{event.type}</span>
                  <time className="shrink-0 font-mono text-[10px] text-content-faint">
                    {new Date(event.ts).toLocaleTimeString()}
                  </time>
                </div>
                {/* Identity: who performed this activity. */}
                <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-content-muted">
                  {id ? (
                    <>
                      <span className={`h-1.5 w-1.5 ${id.dot}`} aria-hidden />
                      <span className="text-content">{id.name}</span>
                    </>
                  ) : (
                    <>
                      <span className="h-1.5 w-1.5 bg-content-faint" aria-hidden />
                      <span className="text-content-muted">System</span>
                      <span className="text-content-faint">· task {event.taskId.slice(0, 8)}</span>
                    </>
                  )}
                </div>
                {'output' in event && event.output ? (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-content">{event.output}</p>
                ) : null}
                {'error' in event && event.error ? (
                  <p className="mt-2 text-xs text-danger">{event.error}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
