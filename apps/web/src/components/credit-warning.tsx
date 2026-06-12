import Link from 'next/link';

/**
 * Low-credit warning banner (Phase M5). Shows nothing when the balance is
 * healthy. Warns under 50 credits, and switches to a hard "out of credits"
 * message at 0 with clear next-steps (BYOK or top up). Hidden entirely when
 * the office runs on a BYOK key (credits don't apply).
 */
export function CreditWarning({
  total,
  isByok,
}: {
  total: number;
  isByok: boolean;
}) {
  if (isByok) return null;
  if (total >= 50) return null;

  const out = total <= 0;
  return (
    <div
      className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${
        out
          ? 'border-danger/50 bg-danger/10 text-danger'
          : 'border-accent2/50 bg-accent2/10 text-accent2'
      }`}
    >
      <span>
        {out
          ? 'Out of credits. Our agents are paused. Add your own API key (free) or top up to keep running.'
          : `Low on credits — ${total} left. Add your own API key (free) or top up.`}
      </span>
      <span className="flex shrink-0 gap-2">
        <Link
          href="/settings"
          className="rounded-lg border border-current px-2.5 py-1 text-xs transition hover:opacity-80"
        >
          Add key
        </Link>
        <Link
          href="/settings"
          className="rounded-lg border border-current px-2.5 py-1 text-xs transition hover:opacity-80"
        >
          Top up
        </Link>
      </span>
    </div>
  );
}
