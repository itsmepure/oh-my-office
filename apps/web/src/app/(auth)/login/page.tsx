'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (!result || result.error) {
        setError('Invalid email or password');
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm space-y-4 rounded-md border border-line bg-surface p-6 shadow-sm"
    >
      <h1 className="text-2xl font-bold text-content">Log in</h1>

      {error && (
        <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-sm font-medium text-content">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          autoComplete="email"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-content">Password</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          autoComplete="current-password"
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:bg-accent-bright disabled:opacity-50"
      >
        {submitting ? 'Logging in…' : 'Log in'}
      </button>

      <p className="text-center text-sm text-content-muted">
        No account yet?{' '}
        <a href="/signup" className="text-accent hover:underline">
          Sign up
        </a>
      </p>
    </form>
  );
}

// useSearchParams() requires a Suspense boundary in Next.js 15 when the page
// is statically pre-rendered. Wrap the form in a fallback shell so the build
// can succeed and the hook still works on the client.
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-8">
      <Suspense fallback={<div className="text-sm text-content-muted">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
