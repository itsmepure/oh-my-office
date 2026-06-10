import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Event as SharedEvent } from '@repo/shared';

const authMock = vi.fn();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

const officeMembershipFindUniqueMock = vi.fn();
const taskFindFirstMock = vi.fn();
const eventFindManyMock = vi.fn();

vi.mock('@repo/db', () => ({
  prisma: {
    officeMembership: { findUnique: (...args: unknown[]) => officeMembershipFindUniqueMock(...args) },
    task: { findFirst: (...args: unknown[]) => taskFindFirstMock(...args) },
    event: { findMany: (...args: unknown[]) => eventFindManyMock(...args) },
  },
}));

const { GET } = await import('./route.js');

function req(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function payload(overrides: Partial<SharedEvent> = {}): SharedEvent {
  return {
    type: 'agent.output',
    taskId: 'task-1',
    officeId: 'office-1',
    ts: '2026-06-10T00:00:00.000Z',
    agentRef: 'agent-1',
    output: 'hello',
    ...overrides,
  } as SharedEvent;
}

beforeEach(() => {
  authMock.mockReset();
  officeMembershipFindUniqueMock.mockReset();
  taskFindFirstMock.mockReset();
  eventFindManyMock.mockReset();
});

describe('GET /api/events', () => {
  it('returns 401 without session', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(req('http://localhost:3000/api/events?officeId=office-1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when no officeId or taskId is provided', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    const res = await GET(req('http://localhost:3000/api/events'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when user is not office member', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    officeMembershipFindUniqueMock.mockResolvedValue(null);
    const res = await GET(req('http://localhost:3000/api/events?officeId=office-1'));
    expect(res.status).toBe(404);
    expect(eventFindManyMock).not.toHaveBeenCalled();
  });

  it('replays valid events ordered by timestamp', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    officeMembershipFindUniqueMock.mockResolvedValue({ id: 'membership-1' });
    eventFindManyMock.mockResolvedValue([
      {
        id: 'event-1',
        payload: payload(),
        ts: new Date('2026-06-10T00:00:00.000Z'),
      },
    ]);

    const res = await GET(req('http://localhost:3000/api/events?officeId=office-1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.events).toHaveLength(1);
    expect(data.events[0].id).toBe('event-1');
    expect(eventFindManyMock).toHaveBeenCalledWith({
      where: { officeId: 'office-1' },
      orderBy: [{ ts: 'asc' }, { id: 'asc' }],
    });
  });

  it('requires task membership when filtering by taskId', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    taskFindFirstMock.mockResolvedValue({ id: 'task-1' });
    eventFindManyMock.mockResolvedValue([]);

    const res = await GET(req('http://localhost:3000/api/events?taskId=task-1'));
    expect(res.status).toBe(200);
    expect(taskFindFirstMock).toHaveBeenCalledWith({
      where: {
        id: 'task-1',
        office: { memberships: { some: { userId: 'u1' } } },
      },
      select: { id: true },
    });
  });
});
