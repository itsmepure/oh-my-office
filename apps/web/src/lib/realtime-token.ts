import { createHmac } from 'node:crypto';

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

/**
 * Mint a short-lived realtime token accepted by the orchestrator WebSocket.
 * Server-only helper — do not import this from client components.
 */
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
  return `${payloadPart}.${sign(payloadPart, input.secret)}`;
}
