// Unit tests for POST /api/offices (auth-protected office creation).
// Mocks the DB layer (so tests don't need a live DB) and verifies the route's
// Zod validation, auth check, and error mapping.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the auth + DB modules BEFORE importing the route.
const authMock = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => authMock(),
}));

const createOfficeFromTemplateMock = vi.fn();
vi.mock('@repo/db/offices', () => ({
  createOfficeFromTemplate: (...args: unknown[]) =>
    createOfficeFromTemplateMock(...args),
  OfficeNotFoundError: class OfficeNotFoundError extends Error {
    override name = 'OfficeNotFoundError';
  },
  InvalidTemplateError: class InvalidTemplateError extends Error {
    override name = 'InvalidTemplateError';
  },
}));

// Import after mocks.
const routeModule = await import('./route.js');
const officesModule = await import('@repo/db/offices');
const POST = routeModule.POST;
const { OfficeNotFoundError, InvalidTemplateError } = officesModule;

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/offices', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authMock.mockReset();
  createOfficeFromTemplateMock.mockReset();
});

describe('POST /api/offices', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ templateId: 't1', name: 'Office' }));
    expect(res.status).toBe(401);
    expect(createOfficeFromTemplateMock).not.toHaveBeenCalled();
  });

  it('returns 400 when body is not JSON', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    const req = new NextRequest('http://localhost:3000/api/offices', {
      method: 'POST',
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when name is empty', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    const res = await POST(makeRequest({ templateId: 't1', name: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when name is too long', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    const res = await POST(
      makeRequest({ templateId: 't1', name: 'x'.repeat(121) }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when templateId is missing', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    const res = await POST(makeRequest({ name: 'Office' }));
    expect(res.status).toBe(400);
  });

  it('returns 201 with the created office on success', async () => {
    authMock.mockResolvedValue({ user: { id: 'u-1' } });
    const fakeOffice = { id: 'office-1', name: 'My Office' };
    createOfficeFromTemplateMock.mockResolvedValue(fakeOffice);

    const res = await POST(
      makeRequest({ templateId: 'tpl-1', name: '  My Office  ' }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(fakeOffice);
    // Verify userId came from session, name was trimmed by the Zod schema.
    expect(createOfficeFromTemplateMock).toHaveBeenCalledWith({
      ownerId: 'u-1',
      templateId: 'tpl-1',
      name: 'My Office',
    });
  });

  it('returns 404 when template does not exist', async () => {
    authMock.mockResolvedValue({ user: { id: 'u-1' } });
    createOfficeFromTemplateMock.mockRejectedValue(
      new OfficeNotFoundError('Template xyz not found'),
    );
    const res = await POST(makeRequest({ templateId: 'xyz', name: 'O' }));
    expect(res.status).toBe(404);
  });

  it('returns 422 when template has no agents', async () => {
    authMock.mockResolvedValue({ user: { id: 'u-1' } });
    createOfficeFromTemplateMock.mockRejectedValue(
      new InvalidTemplateError('Template has no agents'),
    );
    const res = await POST(makeRequest({ templateId: 't', name: 'O' }));
    expect(res.status).toBe(422);
  });

  it('returns 500 on unexpected error', async () => {
    authMock.mockResolvedValue({ user: { id: 'u-1' } });
    createOfficeFromTemplateMock.mockRejectedValue(new Error('DB down'));
    const res = await POST(makeRequest({ templateId: 't', name: 'O' }));
    expect(res.status).toBe(500);
  });
});
