import Link from 'next/link';
import { MarketingNav } from '@/components/marketing/nav';
import { MarketingFooter } from '@/components/marketing/footer';
import { IconUsers, IconTerminal, IconActivity, IconLayers } from '@/components/icons';

export const dynamic = 'force-dynamic';

const FEATURES = [
  {
    Icon: IconUsers,
    title: 'A team of AI agents',
    body: 'Planner, Coder, Reviewer and more — each a configurable agent with its own role, prompt, tools and knowledge.',
  },
  {
    Icon: IconTerminal,
    title: 'Give it a task, get real files',
    body: 'Describe a goal. The office runs a deterministic pipeline and produces actual files you can download — not just chat.',
  },
  {
    Icon: IconActivity,
    title: 'Watch it work, live',
    body: 'A pixel-art office shows every agent thinking, calling tools and finishing — streamed in real time as it happens.',
  },
  {
    Icon: IconLayers,
    title: 'Templates + your own agents',
    body: 'Start from a ready-made team or build your own agents and drop them into any office.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="hero-glow" />
        <div className="relative mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <p className="eyebrow inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] text-accent-bright">
            AI agents that do the work
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-content sm:text-5xl">
            Spin up an office of AI agents.{' '}
            <span className="text-gradient-brand">Give them a task. Watch them build it.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-content-muted">
            OpenOffice is a workspace where a team of AI agents collaborate on a
            deterministic pipeline — planning, coding, reviewing — and produce
            real, downloadable output. Tasks are unlimited. Bring your own API
            key and our agents run for free.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="bg-brand-gradient rounded-lg px-6 py-3 text-sm font-semibold text-accent-fg shadow-sm transition hover:shadow-glow"
            >
              Start free — 500 credits
            </Link>
            <Link
              href="/pricing"
              className="rounded-lg border border-line bg-surface/60 px-6 py-3 text-sm font-medium text-content-muted backdrop-blur-sm transition hover:border-line-strong hover:text-content"
            >
              See pricing
            </Link>
          </div>
          <p className="mt-3 font-mono text-xs text-content-faint">
            No credit card required. 2 offices + ~20 tasks on the free plan.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-line/70">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="eyebrow text-[11px] text-content-muted">What you get</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {FEATURES.map(({ Icon, title, body }, i) => {
              const accents = [
                'border-accent/30 bg-accent/10 text-accent-bright',
                'border-accent2/30 bg-accent2/10 text-accent2',
                'border-accent3/30 bg-accent3/10 text-accent3',
                'border-accent/30 bg-accent/10 text-accent-bright',
              ];
              return (
                <div key={title} className="card card-hover rounded-xl p-6">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-lg border ${accents[i % accents.length]}`}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <h3 className="mt-4 font-semibold text-content">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-content-muted">{body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-line/70">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="eyebrow text-[11px] text-content-muted">How it works</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              { n: '01', t: 'Create an office', d: 'Pick a template — Dev Team, Content Team, Research Team — or build your own.' },
              { n: '02', t: 'Run a task', d: 'Type a goal. Agents pick it up and work the pipeline, step by step.' },
              { n: '03', t: 'Download the result', d: 'Get the files and artifacts the agents produced, ready to use.' },
            ].map(({ n, t, d }) => (
              <li key={n} className="card card-hover rounded-xl p-6">
                <span className="font-mono text-2xl font-bold text-gradient-brand">{n}</span>
                <h3 className="mt-2 font-semibold text-content">{t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-content-muted">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Credit model */}
      <section className="border-t border-line/70">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="card card-glow relative overflow-hidden rounded-2xl p-8">
            <div className="hero-glow opacity-60" />
            <div className="relative">
              <h2 className="text-2xl font-semibold text-content">Honest, simple pricing</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-content-muted">
                Tasks are <span className="font-medium text-content">always unlimited</span>.
                Our built-in agents draw from your monthly credits. Bring your own
                API key and they run for <span className="font-medium text-accent3">zero credits</span>,
                forever. You never get blocked from running — only from spending
                credits you don&apos;t have.
              </p>
              <Link
                href="/pricing"
                className="bg-brand-gradient mt-6 inline-flex rounded-lg px-5 py-2.5 text-sm font-semibold text-accent-fg shadow-sm transition hover:shadow-glow"
              >
                View plans
              </Link>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
