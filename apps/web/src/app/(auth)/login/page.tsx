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
      className="card relative z-10 w-full max-w-sm space-y-4 rounded-2xl p-7 shadow-lg"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient font-mono text-sm font-bold text-accent-fg shadow-glow">
          {'>'}
        </span>
        <span className="font-mono text-sm font-semibold tracking-tight text-content">
          Open<span className="text-gradient-brand">Office</span>
        </span>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-content">Log in</h1>

      {error && (
        <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-content">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-faint transition focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
          autoComplete="email"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-content">Password</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-faint transition focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
          autoComplete="current-password"
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="bg-brand-gradient w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-accent-fg shadow-sm transition hover:shadow-glow disabled:opacity-50 disabled:shadow-none"
      >
        {submitting ? 'Logging in…' : 'Log in'}
      </button>

      <p className="text-center text-sm text-content-muted">
        No account yet?{' '}
        <a href="/signup" className="font-medium text-accent-bright hover:underline">
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg p-8">
      <div className="hero-glow" />
      <Suspense fallback={<div className="text-sm text-content-muted">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
