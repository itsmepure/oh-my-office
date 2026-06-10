// POST /api/auth/signup — Create a new user account.
// Validates input with Zod, creates user with bcrypt-hashed password.
// Returns 201 with user id on success, 400/409 on validation/conflict errors.
//
// On success, the client should call signIn('credentials', ...) to log the
// new user in immediately (no separate signin step needed).

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createUser, getUserByEmail } from '@repo/db/auth';

const signupSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(100).trim(),
  password: z.string().min(8).max(200),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Pre-check email to give a clean 409 instead of relying on the Prisma
  // unique-constraint exception. createUser is still the source of truth —
  // there's a race condition window between this check and the insert.
  const existing = await getUserByEmail(parsed.data.email);
  if (existing) {
    return NextResponse.json(
      { error: 'An account with this email already exists' },
      { status: 409 },
    );
  }

  try {
    const user = await createUser(parsed.data);
    return NextResponse.json(
      { id: user.id, email: user.email, name: user.name },
      { status: 201 },
    );
  } catch (err) {
    // Catch the unique-constraint race (P2002) that slipped past the pre-check.
    const code = (err as { code?: string } | null)?.code;
    if (code === 'P2002') {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 },
      );
    }
    console.error('[signup] unexpected error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
