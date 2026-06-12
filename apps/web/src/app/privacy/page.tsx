import { MarketingNav } from '@/components/marketing/nav';
import { MarketingFooter } from '@/components/marketing/footer';

export const dynamic = 'force-dynamic';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="eyebrow text-[11px] text-accent-bright">Legal</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-content">Privacy Policy</h1>
        <p className="mt-2 font-mono text-xs text-content-faint">Last updated: June 2026</p>

        <div className="card mt-8 rounded-2xl p-8">
          <div className="space-y-6 text-sm leading-relaxed text-content-muted">
            <p>
              This policy explains what we collect, why, and your choices. It is a baseline
              policy and may be updated as the Service evolves.
            </p>

          <Section title="What we collect">
            Account data (email, name, password hash), the offices/agents/tasks you create,
            the prompts you submit and the output produced, credit and billing records, and
            basic technical logs (timestamps, error traces) needed to run and debug the
            Service.
          </Section>

          <Section title="How we use it">
            To provide the Service: run your tasks, store your output, meter credits, process
            payments, and maintain security. We do not sell your personal data.
          </Section>

          <Section title="AI providers">
            Prompts and context for platform-agent tasks are sent to third-party LLM
            providers to generate output. If you use your own API key (BYOK), requests go to
            the provider under your key. Your key is encrypted at rest (AES-256-GCM) and is
            never shown back to you or sent to the browser.
          </Section>

          <Section title="Payments">
            Payments are handled by our payment processor. We store subscription status and
            credit balances, not your full card details.
          </Section>

          <Section title="Data retention">
            We keep your data while your account is active. You can delete offices (which
            removes their tasks, events, artifacts, and workspace files). Contact us to
            delete your account and associated data.
          </Section>

          <Section title="Security">
            We use encryption for secrets, scope every query to your account (multi-tenant
            isolation), and guard all file access against escaping your workspace. No system
            is perfectly secure, but we take reasonable measures to protect your data.
          </Section>

          <Section title="Your choices">
            You can access and edit your data in-app, attach or remove your own API key, and
            request account deletion. For privacy requests: support@openoffice.local
          </Section>

          <Section title="Contact">
            Questions about this policy: support@openoffice.local
          </Section>
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line/60 pt-6 first:border-0 first:pt-0">
      <h2 className="text-base font-semibold text-content">{title}</h2>
      <p className="mt-2">{children}</p>
    </div>
  );
}
