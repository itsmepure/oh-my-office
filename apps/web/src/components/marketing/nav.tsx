import Link from 'next/link';
import { auth } from '@/auth';

/** Public marketing top nav. Auth-aware: CTA changes if signed in. */
export async function MarketingNav() {
  const session = await auth();
  const loggedIn = !!session?.user;

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-mono text-base text-accent">&gt;_</span>
          <span className="font-medium text-content">OpenOffice</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/pricing"
            className="px-3 py-2 text-sm text-content-muted transition hover:text-content"
          >
            Pricing
          </Link>
          {loggedIn ? (
            <Link
              href="/dashboard"
              className="bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:bg-accent-bright"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="px-3 py-2 text-sm text-content-muted transition hover:text-content"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:bg-accent-bright"
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
