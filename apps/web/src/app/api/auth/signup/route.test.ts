// Unit tests for the /api/auth/signup route handler.
// We test the schema and the handler in isolation, mocking @repo/db/auth so
// the test doesn't need a live database.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

// Mock @repo/db/auth before importing the route handler.
vi.mock('@repo/db/auth', () => ({
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
}));

import { POST } from './route.js';
import { getUserByEmail, createUser } from '@repo/db/auth';

const mockedGetUserByEmail = vi.mocked(getUserByEmail);
const mockedCreateUser = vi.mocked(createUser);

const signupSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(100).trim(),
  password: z.string().min(8).max(200),
});

function jsonRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('signup API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validation', () => {
    it('rejects missing fields with 400', async () => {
      const res = await POST(jsonRequest({ email: 'a@b.co' }) as never);
      expect(res.status).toBe(400);
    });

    it('rejects invalid email with 400', async () => {
      const res = await POST(jsonRequest({ email: 'not-an-email', name: 'X', password: 'longenough1' }));
      expect(res.status).toBe(400);
    });

    it('rejects short password with 400', async () => {
      const res = await POST(jsonRequest({ email: 'a@b.co', name: 'X', password: 'short' }));
      expect(res.status).toBe(400);
    });

    it('rejects empty name with 400', async () => {
      const res = await POST(jsonRequest({ email: 'a@b.co', name: '', password: 'longenough1' }));
      expect(res.status).toBe(400);
    });
  });

  describe('happy path', () => {
    it('returns 201 with user id, email, name on success', async () => {
      mockedGetUserByEmail.mockResolvedValue(null);
      mockedCreateUser.mockResolvedValue({
        id: 'user-123',
        email: 'alice@example.com',
        name: 'Alice',
        passwordHash: 'hashed',
        createdAt: new Date(),
      });

      const res = await POST(jsonRequest({ email: 'Alice@Example.com', name: '  Alice  ', password: 'longenough1' }));
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body).toEqual({
        id: 'user-123',
        email: 'alice@example.com', // normalized to lowercase
        name: 'Alice', // trimmed
      });
    });
  });

  describe('conflict path', () => {
    it('returns 409 when email already exists (pre-check)', async () => {
      mockedGetUserByEmail.mockResolvedValue({
        id: 'existing',
        email: 'taken@example.com',
        name: 'X',
        passwordHash: 'h',
        createdAt: new Date(),
      });

      const res = await POST(jsonRequest({ email: 'taken@example.com', name: 'X', password: 'longenough1' }));
      expect(res.status).toBe(409);

      const body = await res.json();
      expect(body.error).toMatch(/already exists/i);
      expect(mockedCreateUser).not.toHaveBeenCalled();
    });

    it('returns 409 when Prisma throws P2002 (race condition)', async () => {
      mockedGetUserByEmail.mockResolvedValue(null);
      const prismaError = Object.assign(new Error('unique'), { code: 'P2002' });
      mockedCreateUser.mockRejectedValue(prismaError);

      const res = await POST(jsonRequest({ email: 'racy@example.com', name: 'X', password: 'longenough1' }));
      expect(res.status).toBe(409);
    });
  });

  describe('error path', () => {
    it('returns 500 on unexpected prisma error', async () => {
      mockedGetUserByEmail.mockResolvedValue(null);
      mockedCreateUser.mockRejectedValue(new Error('db down'));

      const res = await POST(jsonRequest({ email: 'oops@example.com', name: 'X', password: 'longenough1' }));
      expect(res.status).toBe(500);
    });

    it('returns 400 on invalid JSON', async () => {
      const req = new Request('http://localhost/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json{',
      }) as unknown as NextRequest;
      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  describe('schema (sanity)', () => {
    it('accepts a valid payload', () => {
      expect(signupSchema.safeParse({ email: 'a@b.co', name: 'X', password: 'longenough1' }).success).toBe(true);
    });
  });
});
