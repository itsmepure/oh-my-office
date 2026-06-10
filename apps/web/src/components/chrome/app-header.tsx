// Shared app header (chrome) — used on dashboard, office, templates, etc.
// Layout per wireframe: [logo + app name]  ...  [menu bar]  ...  [avatar].
// Server component; the sign-out server action is passed into the client
// ProfileMenu.

import Link from 'next/link';
import { auth, signOut } from '@/auth';
import { ProfileMenu } from './profile-menu';

interface NavItem {
  label: string;
  href: string;
  key: string;
}

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', key: 'dashboard' },
  { label: 'Templates', href: '/templates', key: 'templates' },
  { label: 'Agents', href: '/agents', key: 'agents' },
];

interface AppHeaderProps {
  /** Highlights the active nav item. */
  active?: string;
}

export async function AppHeader({ active }: AppHeaderProps) {
  const session = await auth();
  const user = session?.user;

  async function doSignOut() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        {/* Left: logo + app name */}
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-accent/40 bg-accent/10 font-mono text-sm font-bold text-accent">
            {'>'}
          </span>
          <span className="font-mono text-sm font-semibold tracking-tight text-content">
            Open<span className="text-accent">Office</span>
          </span>
        </Link>

        {/* Center: menu bar */}
        <nav className="hidden items-center gap-0.5 rounded-lg border border-line bg-surface p-1 sm:flex">
          {NAV.map((item) => {
            const isActive = item.key === active;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={
                  isActive
                    ? 'rounded-md bg-accent px-3.5 py-1.5 font-mono text-xs font-medium uppercase tracking-[0.1em] text-bg'
                    : 'rounded-md px-3.5 py-1.5 font-mono text-xs font-medium uppercase tracking-[0.1em] text-content-muted transition hover:bg-surface-2 hover:text-content'
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: avatar / profile */}
        {user ? (
          <ProfileMenu
            name={user.name ?? 'User'}
            email={user.email ?? ''}
            signOutAction={doSignOut}
          />
        ) : (
          <Link
            href="/login"
            className="rounded-md border border-line px-3 py-1.5 text-sm text-content-muted hover:text-content"
          >
            Log in
          </Link>
        )}
      </div>

      {/* Mobile menu bar */}
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-line px-6 py-2 sm:hidden">
        {NAV.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={
                isActive
                  ? 'whitespace-nowrap rounded-md bg-accent px-3 py-1.5 font-mono text-xs font-medium uppercase tracking-[0.1em] text-bg'
                  : 'whitespace-nowrap rounded-md px-3 py-1.5 font-mono text-xs font-medium uppercase tracking-[0.1em] text-content-muted hover:text-content'
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
