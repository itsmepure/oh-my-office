// GET /api/realtime/token — short-lived signed token for orchestrator WS auth.
// Auth-protected via NextAuth session; no secrets are returned to the client.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createRealtimeToken } from '@/lib/realtime-token';

export const runtime = 'nodejs';

const TOKEN_TTL_SECONDS = 10 * 60;

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Realtime auth is not configured' }, { status: 500 });
  }

  const wsUrl = process.env.ORCHESTRATOR_WS_URL ?? 'ws://localhost:3001';
  const token = createRealtimeToken({ userId, secret, ttlSeconds: TOKEN_TTL_SECONDS });

  return NextResponse.json({ token, wsUrl, expiresIn: TOKEN_TTL_SECONDS });
}
