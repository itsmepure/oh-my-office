import Link from 'next/link';
import { MarketingNav } from '@/components/marketing/nav';
import { MarketingFooter } from '@/components/marketing/footer';
import { IconCheck } from '@/components/icons';

export const dynamic = 'force-dynamic';

interface Plan {
  name: string;
  price: string;
  period: string;
  tagline: string;
  credits: string;
  features: string[];
  cta: string;
  href: string;
  highlight?: boolean;
}

const PLANS: Plan[] = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    tagline: 'Try it, build something real.',
    credits: '500 credits/mo (~20 tasks)',
    features: ['2 offices', 'Built-in agents + bring your own', 'Pixel office + live feed', 'BYOK = unlimited free runs'],
    cta: 'Start free',
    href: '/signup',
  },
  {
    name: 'Pro',
    price: '$15',
    period: '/month',
    tagline: 'For indie devs shipping real work.',
    credits: '5,000 credits/mo (~200 tasks)',
    features: ['Unlimited offices', 'Full agent builder + knowledge docs', 'All templates', 'BYOK = unlimited free runs', 'Up to 3 concurrent tasks'],
    cta: 'Start free, upgrade anytime',
    href: '/signup',
    highlight: true,
  },
  {
    name: 'Team',
    price: '$49',
    period: '/month',
    tagline: 'For startups working together.',
    credits: '20,000 credits/mo pooled',
    features: ['Everything in Pro', 'Shared offices + members', 'Pooled credits', 'Priority task queue', 'Up to 10 concurrent tasks'],
    cta: 'Start free, upgrade anytime',
    href: '/signup',
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />

      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center">
          <p className="eyebrow text-[11px] text-accent-bright">Pricing</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-content">
            Tasks are unlimited. You pay for our agents&apos; compute.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-content-muted">
            Credits are spent only when our built-in agents run on our LLM key.
            Bring your own API key and they run for free — on every plan.
          </p>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`card rounded-2xl p-7 ${p.highlight ? 'card-glow' : 'card-hover'}`}
            >
              {p.highlight && (
                <span className="bg-brand-gradient eyebrow inline-block rounded-full px-2.5 py-1 text-[10px] text-accent-fg">
                  Most popular
                </span>
              )}
              <h2 className={`text-lg font-semibold text-content ${p.highlight ? 'mt-3' : 'mt-1'}`}>{p.name}</h2>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight text-content">{p.price}</span>
                <span className="text-sm text-content-muted">{p.period}</span>
              </div>
              <p className="mt-2 text-sm text-content-muted">{p.tagline}</p>
              <p className="mt-4 font-mono text-xs text-accent2">{p.credits}</p>
              <ul className="mt-5 space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-content-muted">
                    <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent3" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={p.href}
                className={`mt-7 block w-full rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition ${
                  p.highlight
                    ? 'bg-brand-gradient text-accent-fg shadow-sm hover:shadow-glow'
                    : 'border border-line bg-surface/60 text-content-muted hover:border-line-strong hover:text-content'
                }`}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* Credit packs */}
        <div className="mt-10 card rounded-2xl p-7">
          <h2 className="text-lg font-semibold text-content">Need more credits?</h2>
          <p className="mt-2 text-sm text-content-muted">
            Top up any plan with a one-time credit pack — or just attach your own
            API key and run our agents for free.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { c: '1,000 credits', p: '$5' },
              { c: '5,000 credits', p: '$20' },
              { c: '15,000 credits', p: '$50' },
            ].map((pack) => (
              <div key={pack.c} className="card card-hover rounded-xl border-accent2/20 p-4 text-center">
                <p className="font-mono text-sm text-content">{pack.c}</p>
                <p className="mt-1 text-2xl font-semibold text-accent2">{pack.p}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
