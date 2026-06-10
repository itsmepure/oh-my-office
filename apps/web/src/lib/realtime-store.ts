'use client';

import { create } from 'zustand';
import { eventSchema, type Event as SharedEvent } from '@repo/shared';

export interface RealtimeEventRecord {
  id?: string;
  event: SharedEvent;
  ts: string;
}

export type RealtimeConnectionStatus = 'idle' | 'hydrating' | 'connecting' | 'connected' | 'error';

interface TokenResponse {
  token: string;
  wsUrl: string;
  expiresIn: number;
}

interface RealtimeState {
  records: RealtimeEventRecord[];
  status: RealtimeConnectionStatus;
  lastError?: string;
  activeOfficeId?: string;
  activeTaskId?: string;
  connect(input: { officeId: string; taskId?: string }): Promise<void>;
  disconnect(): void;
  hydrate(input: { officeId: string; taskId?: string }): Promise<void>;
  append(record: RealtimeEventRecord): void;
}

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let manuallyClosed = false;

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  records: [],
  status: 'idle',

  async hydrate(input) {
    set({ status: 'hydrating', lastError: undefined, activeOfficeId: input.officeId, activeTaskId: input.taskId });
    try {
      const qs = new URLSearchParams({ officeId: input.officeId });
      if (input.taskId) qs.set('taskId', input.taskId);
      const res = await fetch(`/api/events?${qs.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Replay failed (${res.status})`);
      const data = (await res.json()) as { events?: RealtimeEventRecord[] };
      set((state) => ({
        records: mergeEventRecords(state.records, data.events ?? []),
        status: 'idle',
      }));
    } catch (err) {
      set({ status: 'error', lastError: (err as Error).message });
    }
  },

  async connect(input) {
    cleanupSocket();
    manuallyClosed = false;
    set({ status: 'connecting', lastError: undefined, activeOfficeId: input.officeId, activeTaskId: input.taskId });

    // Always hydrate before connecting. On reconnect this fills any missed gap.
    await get().hydrate(input);
    if (manuallyClosed) return;

    try {
      const tokenRes = await fetch('/api/realtime/token', { cache: 'no-store' });
      if (!tokenRes.ok) throw new Error(`Token request failed (${tokenRes.status})`);
      const tokenData = (await tokenRes.json()) as TokenResponse;

      socket = new WebSocket(tokenData.wsUrl);
      socket.onopen = () => {
        socket?.send(JSON.stringify({ type: 'auth', token: tokenData.token }));
      };
      socket.onmessage = (message) => {
        handleSocketMessage(message.data, input);
      };
      socket.onerror = () => {
        set({ status: 'error', lastError: 'WebSocket error' });
      };
      socket.onclose = () => {
        if (manuallyClosed) return;
        set({ status: 'connecting' });
        reconnectTimer = setTimeout(() => {
          void get().connect(input);
        }, 1000);
      };
    } catch (err) {
      set({ status: 'error', lastError: (err as Error).message });
      reconnectTimer = setTimeout(() => {
        void get().connect(input);
      }, 1000);
    }
  },

  disconnect() {
    manuallyClosed = true;
    cleanupSocket();
    set({ status: 'idle', activeOfficeId: undefined, activeTaskId: undefined });
  },

  append(record) {
    set((state) => ({ records: mergeEventRecords(state.records, [record]) }));
  },
}));

function handleSocketMessage(
  raw: unknown,
  input: { officeId: string; taskId?: string },
): void {
  let message: unknown;
  try {
    message = JSON.parse(String(raw));
  } catch {
    useRealtimeStore.setState({ status: 'error', lastError: 'Invalid WS message' });
    return;
  }
  if (!message || typeof message !== 'object') return;
  const msg = message as Record<string, unknown>;

  if (msg.type === 'auth.ok') {
    socket?.send(JSON.stringify({ type: 'subscribe', officeId: input.officeId, taskId: input.taskId }));
    return;
  }

  if (msg.type === 'subscribed') {
    useRealtimeStore.setState({ status: 'connected', lastError: undefined });
    return;
  }

  if (msg.type === 'event') {
    const parsed = eventSchema.safeParse(msg.event);
    if (!parsed.success) return;
    const event = parsed.data;
    useRealtimeStore.setState((state) => ({
      records: mergeEventRecords(state.records, [
        {
          id: typeof msg.eventId === 'string' ? msg.eventId : undefined,
          event,
          ts: event.ts,
        },
      ]),
    }));
    return;
  }

  if (msg.type === 'error' || msg.type === 'auth.error') {
    useRealtimeStore.setState({ status: 'error', lastError: String(msg.error ?? 'Realtime error') });
  }
}

function cleanupSocket(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    socket.close();
    socket = null;
  }
}

export function mergeEventRecords(
  existing: RealtimeEventRecord[],
  incoming: RealtimeEventRecord[],
): RealtimeEventRecord[] {
  const byKey = new Map<string, RealtimeEventRecord>();
  for (const record of [...existing, ...incoming]) {
    byKey.set(recordKey(record), record);
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const at = new Date(a.event.ts ?? a.ts).getTime();
    const bt = new Date(b.event.ts ?? b.ts).getTime();
    if (at !== bt) return at - bt;
    return recordKey(a).localeCompare(recordKey(b));
  });
}

function recordKey(record: RealtimeEventRecord): string {
  if (record.id) return `id:${record.id}`;
  const event = record.event;
  return `synthetic:${event.officeId}:${event.taskId}:${event.ts}:${event.type}:${JSON.stringify(event)}`;
}
