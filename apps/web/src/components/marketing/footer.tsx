import Link from 'next/link';

/** Public marketing footer with legal + nav links. */
export function MarketingFooter() {
  return (
    <footer className="border-t border-line/70">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-8 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-gradient font-mono text-xs font-bold text-accent-fg">
            {'>'}
          </span>
          <span className="text-sm font-medium text-content-muted">OpenOffice</span>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-content-muted">
          <Link href="/pricing" className="transition hover:text-content">Pricing</Link>
          <Link href="/terms" className="transition hover:text-content">Terms</Link>
          <Link href="/privacy" className="transition hover:text-content">Privacy</Link>
          <Link href="/login" className="transition hover:text-content">Log in</Link>
          <a href="mailto:support@openoffice.local" className="transition hover:text-content">Support</a>
        </nav>
        <p className="font-mono text-[11px] text-content-faint">
          © {new Date().getFullYear()} OpenOffice
        </p>
      </div>
    </footer>
  );
}
