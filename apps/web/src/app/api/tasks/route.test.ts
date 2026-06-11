import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const authMock = vi.fn();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

const officeMembershipFindUniqueMock = vi.fn();
const taskCreateMock = vi.fn();
const officeFindUniqueMock = vi.fn();

vi.mock('@repo/db', () => ({
  prisma: {
    officeMembership: { findUnique: (...args: unknown[]) => officeMembershipFindUniqueMock(...args) },
    task: { create: (...args: unknown[]) => taskCreateMock(...args) },
    office: { findUnique: (...args: unknown[]) => officeFindUniqueMock(...args) },
  },
}));

const getPlanMock = vi.fn();
vi.mock('@repo/db/entitlements', () => ({
  getPlan: (...args: unknown[]) => getPlanMock(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ ok: true, remaining: 19, retryAfterMs: 0 }),
}));

const { POST } = await import('./route.js');

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authMock.mockReset();
  officeMembershipFindUniqueMock.mockReset();
  taskCreateMock.mockReset();
  officeFindUniqueMock.mockReset();
  getPlanMock.mockReset();
  // Defaults: office exists (FREE owner) → priority 0.
  officeFindUniqueMock.mockResolvedValue({ ownerId: 'owner-1' });
  getPlanMock.mockResolvedValue('FREE');
});

describe('POST /api/tasks', () => {
  it('returns 401 without session', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(req({ officeId: '11111111-1111-4111-8111-111111111111', prompt: 'x' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid input', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    const res = await POST(req({ officeId: 'bad', prompt: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when user is not office member', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    officeMembershipFindUniqueMock.mockResolvedValue(null);
    const res = await POST(req({ officeId: '11111111-1111-4111-8111-111111111111', prompt: 'Do work' }));
    expect(res.status).toBe(404);
    expect(taskCreateMock).not.toHaveBeenCalled();
  });

  it('creates queued task for office member', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    officeMembershipFindUniqueMock.mockResolvedValue({ id: 'm1' });
    taskCreateMock.mockResolvedValue({
      id: 'task-1',
      officeId: '11111111-1111-4111-8111-111111111111',
      prompt: 'Do work',
      status: 'queued',
      createdAt: new Date('2026-06-10T00:00:00.000Z'),
    });

    const res = await POST(req({ officeId: '11111111-1111-4111-8111-111111111111', prompt: '  Do work  ' }));
    expect(res.status).toBe(201);
    expect(taskCreateMock).toHaveBeenCalledWith({
      data: {
        officeId: '11111111-1111-4111-8111-111111111111',
        prompt: 'Do work',
        status: 'queued',
        priority: 0,
      },
    });
  });

  it('sets priority 10 for Team-owned offices', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    officeMembershipFindUniqueMock.mockResolvedValue({ id: 'm1' });
    officeFindUniqueMock.mockResolvedValue({ ownerId: 'team-owner' });
    getPlanMock.mockResolvedValue('TEAM');
    taskCreateMock.mockResolvedValue({
      id: 'task-2',
      officeId: '11111111-1111-4111-8111-111111111111',
      prompt: 'Do work',
      status: 'queued',
      createdAt: new Date('2026-06-10T00:00:00.000Z'),
    });
    const res = await POST(req({ officeId: '11111111-1111-4111-8111-111111111111', prompt: 'Do work' }));
    expect(res.status).toBe(201);
    expect(taskCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ priority: 10 }),
    });
  });
});
