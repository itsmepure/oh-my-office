import { describe, expect, it, vi } from 'vitest';
import type { Event as SharedEvent } from '@repo/shared';
import {
  RealtimeHub,
  createRealtimeToken,
  verifyRealtimeToken,
} from './realtime.js';

function event(overrides: Partial<SharedEvent> = {}): SharedEvent {
  return {
    type: 'agent.output',
    taskId: 'task-1',
    officeId: 'office-1',
    ts: new Date().toISOString(),
    agentRef: 'agent-1',
    output: 'hello',
    ...overrides,
  } as SharedEvent;
}

function client() {
  return {
    sent: [] as string[],
    send(payload: string) {
      this.sent.push(payload);
    },
    readyState: 1,
  };
}

describe('realtime token', () => {
  it('round-trips a signed token', () => {
    const token = createRealtimeToken({ userId: 'u1', secret: 'secret', ttlSeconds: 60 });
    const result = verifyRealtimeToken(token, 'secret');
    expect(result.ok).toBe(true);
    expect(result.userId).toBe('u1');
  });

  it('rejects tampered token', () => {
    const token = createRealtimeToken({ userId: 'u1', secret: 'secret', ttlSeconds: 60 });
    const tampered = token.replace(/.$/, 'x');
    const result = verifyRealtimeToken(tampered, 'secret');
    expect(result.ok).toBe(false);
  });

  it('rejects expired token', () => {
    const token = createRealtimeToken({ userId: 'u1', secret: 'secret', ttlSeconds: -1 });
    const result = verifyRealtimeToken(token, 'secret');
    expect(result.ok).toBe(false);
  });
});

describe('RealtimeHub', () => {
  it('broadcasts only to matching office subscribers', () => {
    const hub = new RealtimeHub();
    const a = client();
    const b = client();
    hub.addClient(a);
    hub.addClient(b);
    hub.subscribe(a, { officeId: 'office-1' });
    hub.subscribe(b, { officeId: 'office-2' });

    hub.broadcast(event({ officeId: 'office-1' }));

    expect(a.sent).toHaveLength(1);
    expect(JSON.parse(a.sent[0]!).event.officeId).toBe('office-1');
    expect(b.sent).toHaveLength(0);
  });

  it('broadcasts only to matching task subscribers', () => {
    const hub = new RealtimeHub();
    const a = client();
    const b = client();
    hub.addClient(a);
    hub.addClient(b);
    hub.subscribe(a, { taskId: 'task-1' });
    hub.subscribe(b, { taskId: 'task-2' });

    hub.broadcast(event({ taskId: 'task-1' }));

    expect(a.sent).toHaveLength(1);
    expect(b.sent).toHaveLength(0);
  });

  it('removes client subscriptions on close', () => {
    const hub = new RealtimeHub();
    const a = client();
    hub.addClient(a);
    hub.subscribe(a, { officeId: 'office-1' });
    expect(hub.clientCount()).toBe(1);

    hub.removeClient(a);
    hub.broadcast(event({ officeId: 'office-1' }));

    expect(hub.clientCount()).toBe(0);
    expect(a.sent).toHaveLength(0);
  });

  it('skips closed clients', () => {
    const hub = new RealtimeHub();
    const a = client();
    a.readyState = 3;
    hub.addClient(a);
    hub.subscribe(a, { officeId: 'office-1' });

    hub.broadcast(event({ officeId: 'office-1' }));

    expect(a.sent).toHaveLength(0);
  });

  it('calls onBroadcast after DB persistence path uses hub', () => {
    const hub = new RealtimeHub();
    const spy = vi.fn();
    hub.onBroadcast(spy);
    hub.broadcast(event());
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
