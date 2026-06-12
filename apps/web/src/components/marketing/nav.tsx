import Link from 'next/link';
import { auth } from '@/auth';

/** Public marketing top nav. Auth-aware: CTA changes if signed in. */
export async function MarketingNav() {
  const session = await auth();
  const loggedIn = !!session?.user;

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient font-mono text-sm font-bold text-accent-fg shadow-glow">
            {'>'}
          </span>
          <span className="font-semibold tracking-tight text-content">
            Open<span className="text-accent">Office</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/pricing"
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-content-muted transition hover:bg-surface-2 hover:text-content"
          >
            Pricing
          </Link>
          {loggedIn ? (
            <Link
              href="/dashboard"
              className="bg-brand-gradient rounded-lg px-4 py-2 text-sm font-semibold text-accent-fg shadow-sm transition hover:shadow-glow"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-content-muted transition hover:bg-surface-2 hover:text-content"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="bg-brand-gradient rounded-lg px-4 py-2 text-sm font-semibold text-accent-fg shadow-sm transition hover:shadow-glow"
              >
                Get started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
