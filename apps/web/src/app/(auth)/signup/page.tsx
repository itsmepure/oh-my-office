'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, name, password }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Signup failed (${res.status})`);
        return;
      }

      // Auto-login after successful signup.
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (!result || result.error) {
        setError('Account created but auto-login failed. Try logging in.');
        router.push('/login');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg p-8">
      <div className="hero-glow" />
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
        <h1 className="text-2xl font-semibold tracking-tight text-content">Create account</h1>

        {error && (
          <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        )}

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-content">Name</span>
          <input
            type="text"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-faint transition focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
            autoComplete="name"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-content">Email</span>
          <input
            type="email"
            required
            maxLength={254}
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
            minLength={8}
            maxLength={200}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-faint transition focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/30"
            autoComplete="new-password"
          />
          <span className="text-xs text-content-faint">Minimum 8 characters.</span>
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="bg-brand-gradient w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-accent-fg shadow-sm transition hover:shadow-glow disabled:opacity-50 disabled:shadow-none"
        >
          {submitting ? 'Creating…' : 'Sign up'}
        </button>

        <p className="text-center text-sm text-content-muted">
          Already have an account?{' '}
          <a href="/login" className="font-medium text-accent-bright hover:underline">
            Log in
          </a>
        </p>
      </form>
    </main>
  );
}
