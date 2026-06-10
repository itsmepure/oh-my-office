// apps/orchestrator/src/realtime — WebSocket hub + signed auth tokens.
//
// Phase 7 goals:
// - Authenticated WS handshake (signed token minted by web API)
// - Subscribe by officeId/taskId
// - Broadcast persisted events only to matching subscribers
// - Keep this core testable without real sockets (RealtimeHub)

import { createHmac, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { Event as SharedEvent } from '@repo/shared';
import { prisma } from '@repo/db';

// ── Token helpers ──────────────────────────────────────────────────────────

interface TokenPayload {
  sub: string;
  exp: number;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadPart: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadPart).digest('base64url');
}

export function createRealtimeToken(input: {
  userId: string;
  secret: string;
  ttlSeconds: number;
}): string {
  const payload: TokenPayload = {
    sub: input.userId,
    exp: Math.floor(Date.now() / 1000) + input.ttlSeconds,
  };
  const payloadPart = base64url(JSON.stringify(payload));
  const sigPart = sign(payloadPart, input.secret);
  return `${payloadPart}.${sigPart}`;
}

export function verifyRealtimeToken(
  token: string,
  secret: string,
): { ok: true; userId: string } | { ok: false; error: string } {
  if (!secret) return { ok: false, error: 'missing secret' };
  const [payloadPart, sigPart] = token.split('.');
  if (!payloadPart || !sigPart) return { ok: false, error: 'malformed token' };

  const expected = sign(payloadPart, secret);
  const a = Buffer.from(sigPart);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: 'bad signature' };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf-8')) as TokenPayload;
  } catch {
    return { ok: false, error: 'bad payload' };
  }

  if (!payload.sub || typeof payload.exp !== 'number') {
    return { ok: false, error: 'invalid payload' };
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: 'expired token' };
  }

  return { ok: true, userId: payload.sub };
}

// ── Hub (pure, testable) ───────────────────────────────────────────────────

export interface RealtimeClient {
  readyState: number;
  send(payload: string): void;
}

export interface Subscription {
  officeId?: string;
  taskId?: string;
}

interface ClientState {
  subscriptions: Subscription[];
  userId?: string;
}

export class RealtimeHub {
  private readonly clients = new Map<RealtimeClient, ClientState>();
  private readonly broadcastHooks = new Set<(event: SharedEvent) => void>();

  addClient(client: RealtimeClient, userId?: string): void {
    this.clients.set(client, { subscriptions: [], userId });
  }

  authenticate(client: RealtimeClient, userId: string): void {
    const state = this.clients.get(client) ?? { subscriptions: [] };
    state.userId = userId;
    this.clients.set(client, state);
  }

  getUserId(client: RealtimeClient): string | undefined {
    return this.clients.get(client)?.userId;
  }

  subscribe(client: RealtimeClient, subscription: Subscription): void {
    const state = this.clients.get(client) ?? { subscriptions: [] };
    state.subscriptions.push(subscription);
    this.clients.set(client, state);
  }

  removeClient(client: RealtimeClient): void {
    this.clients.delete(client);
  }

  clientCount(): number {
    return this.clients.size;
  }

  onBroadcast(fn: (event: SharedEvent) => void): () => void {
    this.broadcastHooks.add(fn);
    return () => this.broadcastHooks.delete(fn);
  }

  broadcast(event: SharedEvent, eventId?: string): void {
    for (const hook of Array.from(this.broadcastHooks)) hook(event);

    const payload = JSON.stringify({ type: 'event', eventId, event });
    for (const [client, state] of Array.from(this.clients.entries())) {
      if (client.readyState !== 1) continue;
      const shouldSend = state.subscriptions.some((sub) => matches(event, sub));
      if (shouldSend) client.send(payload);
    }
  }
}

function matches(event: SharedEvent, sub: Subscription): boolean {
  if (sub.officeId && event.officeId !== sub.officeId) return false;
  if (sub.taskId && event.taskId !== sub.taskId) return false;
  return Boolean(sub.officeId || sub.taskId);
}

// ── Global hub used by persistEvent() ──────────────────────────────────────

let activeHub: RealtimeHub | null = null;

export function setRealtimeHub(hub: RealtimeHub | null): void {
  activeHub = hub;
}

export function broadcastPersistedEvent(event: SharedEvent, eventId?: string): void {
  activeHub?.broadcast(event, eventId);
}

// ── WebSocket server ───────────────────────────────────────────────────────

export interface RealtimeServerHandle {
  hub: RealtimeHub;
  close(): Promise<void>;
}

export function startRealtimeServer(input: {
  port?: number;
  server?: Server;
  authSecret: string;
}): RealtimeServerHandle {
  const hub = new RealtimeHub();
  setRealtimeHub(hub);

  const wss = input.server
    ? new WebSocketServer({ server: input.server })
    : new WebSocketServer({ port: input.port ?? 3001 });

  // Without an 'error' listener, a listen failure (e.g. EADDRINUSE during a
  // hot-reload before the previous process released the port) is emitted as
  // an unhandled 'error' event and crashes the whole daemon. Handle it
  // explicitly: log a clear message and exit non-zero so the supervisor
  // (tsx watch / pm2 / systemd) can restart cleanly once the port frees up.
  wss.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[realtime] Port ${input.port ?? 3001} already in use — another orchestrator instance is still bound. Exiting so the supervisor can retry.`,
      );
    } else {
      console.error('[realtime] WebSocket server error:', err);
    }
    process.exit(1);
  });

  wss.on('connection', (ws) => {
    hub.addClient(ws);

    ws.on('message', async (raw) => {
      let message: unknown;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        sendJson(ws, { type: 'error', error: 'invalid json' });
        return;
      }

      if (!message || typeof message !== 'object') {
        sendJson(ws, { type: 'error', error: 'invalid message' });
        return;
      }

      const msg = message as Record<string, unknown>;
      if (msg['type'] === 'auth') {
        const token = String(msg['token'] ?? '');
        const verified = verifyRealtimeToken(token, input.authSecret);
        if (verified.ok === false) {
          sendJson(ws, { type: 'auth.error', error: verified.error });
          ws.close(1008, 'auth failed');
          return;
        }
        hub.authenticate(ws, verified.userId);
        sendJson(ws, { type: 'auth.ok', userId: verified.userId });
        return;
      }

      if (msg['type'] === 'subscribe') {
        const userId = hub.getUserId(ws);
        if (!userId) {
          sendJson(ws, { type: 'error', error: 'not authenticated' });
          return;
        }

        const sub: Subscription = {
          officeId: typeof msg['officeId'] === 'string' ? msg['officeId'] : undefined,
          taskId: typeof msg['taskId'] === 'string' ? msg['taskId'] : undefined,
        };
        if (!sub.officeId && !sub.taskId) {
          sendJson(ws, { type: 'error', error: 'missing officeId or taskId' });
          return;
        }

        const allowed = await canSubscribe(userId, sub);
        if (!allowed) {
          sendJson(ws, { type: 'error', error: 'forbidden' });
          return;
        }

        hub.subscribe(ws, sub);
        sendJson(ws, { type: 'subscribed', ...sub });
        return;
      }

      sendJson(ws, { type: 'error', error: 'unknown message type' });
    });

    ws.on('close', () => hub.removeClient(ws));
    ws.on('error', () => hub.removeClient(ws));
  });

  const portText = input.server ? 'attached http server' : `port ${input.port ?? 3001}`;
  console.log(`[realtime] WebSocket server listening on ${portText}`);

  return {
    hub,
    close: () =>
      new Promise((resolve) => {
        setRealtimeHub(null);
        wss.close(() => resolve());
      }),
  };
}

async function canSubscribe(userId: string, sub: Subscription): Promise<boolean> {
  if (sub.officeId) {
    const membership = await prisma.officeMembership.findUnique({
      where: { officeId_userId: { officeId: sub.officeId, userId } },
    });
    if (!membership) return false;
  }

  if (sub.taskId) {
    const task = await prisma.task.findFirst({
      where: {
        id: sub.taskId,
        office: { memberships: { some: { userId } } },
      },
      select: { id: true },
    });
    if (!task) return false;
  }

  return true;
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}
