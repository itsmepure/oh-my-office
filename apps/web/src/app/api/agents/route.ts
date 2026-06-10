// /api/agents — create a new user-owned agent, or list all of them.
// Auth-protected. POST validates via Zod; GET returns all agents for the session user.

import { NextResponse, type NextRequest } from 'next/server';
import { agentCreateInputSchema, type AgentView } from '@repo/shared';
import { auth } from '@/auth';
import { createAgent, listUserAgents } from '@repo/db/agents';

export async function POST(
  request: NextRequest,
): Promise<NextResponse<AgentView | { error: string; issues?: unknown }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = agentCreateInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const agent = await createAgent(session.user.id, parsed.data);
  return NextResponse.json(agent, { status: 201 });
}

export async function GET(): Promise<NextResponse<AgentView[] | { error: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const agents = await listUserAgents(session.user.id);
  return NextResponse.json(agents);
}
