// /api/health — lightweight liveness + DB readiness probe (Phase L8).
// Public (no auth) so uptime monitors can poll it. Returns 200 when the app +
// DB are reachable, 503 otherwise. Does NOT leak secrets or row data.

import { NextResponse } from 'next/server';
import { prisma } from '@repo/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const started = Date.now();
  try {
    // Cheapest possible round-trip to confirm the DB connection is alive.
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: 'ok',
      db: 'up',
      latencyMs: Date.now() - started,
      ts: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: 'degraded', db: 'down', ts: new Date().toISOString() },
      { status: 503 },
    );
  }
}
