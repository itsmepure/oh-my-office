import Link from 'next/link';

/** Public marketing footer with legal + nav links. */
export function MarketingFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-8 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-accent">&gt;_</span>
          <span className="text-sm text-content-muted">OpenOffice</span>
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
