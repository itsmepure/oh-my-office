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
  { label: 'Settings', href: '/settings', key: 'settings' },
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
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        {/* Left: logo + app name */}
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient font-mono text-sm font-bold text-accent-fg shadow-glow">
            {'>'}
          </span>
          <span className="font-mono text-sm font-semibold tracking-tight text-content">
            Open<span className="text-accent">Office</span>
          </span>
        </Link>

        {/* Center: menu bar */}
        <nav className="hidden items-center gap-0.5 rounded-xl border border-line/70 bg-surface/60 p-1 shadow-sm backdrop-blur-sm sm:flex">
          {NAV.map((item) => {
            const isActive = item.key === active;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={
                  isActive
                    ? 'rounded-lg bg-brand-gradient px-3.5 py-1.5 font-mono text-xs font-medium uppercase tracking-[0.1em] text-accent-fg shadow-sm'
                    : 'rounded-lg px-3.5 py-1.5 font-mono text-xs font-medium uppercase tracking-[0.1em] text-content-muted transition hover:bg-surface-2 hover:text-content'
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
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-content-muted transition hover:border-line-strong hover:text-content"
          >
            Log in
          </Link>
        )}
      </div>

      {/* Mobile menu bar */}
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-line/70 px-6 py-2 sm:hidden">
        {NAV.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={
                isActive
                  ? 'bg-brand-gradient whitespace-nowrap rounded-lg px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-[0.1em] text-accent-fg'
                  : 'whitespace-nowrap rounded-lg px-3 py-1.5 font-mono text-xs font-medium uppercase tracking-[0.1em] text-content-muted hover:text-content'
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
