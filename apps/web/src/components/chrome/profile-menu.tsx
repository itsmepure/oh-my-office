'use client';

// Profile button + dropdown (sign out). Client component so the dropdown can
// open/close; the actual signOut runs through a server action passed in.

import { useEffect, useRef, useState } from 'react';

interface ProfileMenuProps {
  name: string;
  email: string;
  signOutAction: () => Promise<void>;
}

export function ProfileMenu({ name, email, signOutAction }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const initial = (name || email || '?').trim().charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface-2 text-sm font-semibold text-accent-bright transition hover:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-lg shadow-black/40">
          <div className="border-b border-line/70 px-3 py-3">
            <p className="truncate text-sm font-medium text-content">{name}</p>
            <p className="truncate text-xs text-content-muted">{email}</p>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="block w-full px-3 py-2.5 text-left text-sm text-content-muted transition hover:bg-surface-2 hover:text-content"
            >
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
