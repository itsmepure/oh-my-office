'use client';

import { useEffect } from 'react';
import { useRealtimeStore } from '@/lib/realtime-store';
import { reduceEventsToAgentStates } from '@/components/pixel-office/event-to-state';

interface Props {
  officeId: string;
}

export function ActivityFeed({ officeId }: Props) {
  const records = useRealtimeStore((s) => s.records);
  const status = useRealtimeStore((s) => s.status);
  const lastError = useRealtimeStore((s) => s.lastError);
  const connect = useRealtimeStore((s) => s.connect);
  const disconnect = useRealtimeStore((s) => s.disconnect);

  useEffect(() => {
    void connect({ officeId });
    return () => disconnect();
  }, [connect, disconnect, officeId]);

  const agentStates = reduceEventsToAgentStates(records.map((r) => r.event)).byAgent;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-content-faint">
          {records.length} events
        </span>
        <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-content-muted">
          {status}
        </span>
      </div>

      {lastError && (
        <div className="mb-3 rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">
          {lastError}
        </div>
      )}

      {Object.keys(agentStates).length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {Object.entries(agentStates).map(([agentRef, state]) => (
            <span key={agentRef} className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[10px] text-accent">
              {agentRef.slice(0, 8)}: {state}
            </span>
          ))}
        </div>
      )}

      {records.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-4 text-xs text-content-muted">
          No events yet. Queue a task, or wait for replay if this office already has tasks.
        </p>
      ) : (
        <ol className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {records.map((record, idx) => {
            const event = record.event;
            return (
              <li key={record.id ?? `${event.taskId}-${event.ts}-${idx}`} className="rounded-md border border-line bg-surface-2 p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-accent">{event.type}</span>
                  <time className="shrink-0 font-mono text-[10px] text-content-faint">{new Date(event.ts).toLocaleTimeString()}</time>
                </div>
                <div className="mt-1 font-mono text-[10px] text-content-muted">
                  {'agentRef' in event && event.agentRef ? (
                    <>agent {event.agentRef.slice(0, 8)}</>
                  ) : (
                    <>task {event.taskId.slice(0, 8)}</>
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
