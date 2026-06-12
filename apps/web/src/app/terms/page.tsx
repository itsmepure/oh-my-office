import { MarketingNav } from '@/components/marketing/nav';
import { MarketingFooter } from '@/components/marketing/footer';

export const dynamic = 'force-dynamic';

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="eyebrow text-[11px] text-accent-bright">Legal</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-content">Terms of Service</h1>
        <p className="mt-2 font-mono text-xs text-content-faint">Last updated: June 2026</p>

        <div className="card mt-8 rounded-2xl p-8">
          <div className="space-y-6 text-sm leading-relaxed text-content-muted">
            <p>
              These Terms govern your use of OpenOffice (the &quot;Service&quot;). By creating an
              account or using the Service you agree to them. If you do not agree, do not use
              the Service. This is a baseline agreement and may be updated; material changes
              will be announced in-app.
            </p>

          <Section title="1. The Service">
            OpenOffice lets you create workspaces (&quot;offices&quot;) in which AI agents run tasks
            and produce output. The Service is provided on an &quot;as is&quot; and &quot;as available&quot;
            basis without warranties of any kind.
          </Section>

          <Section title="2. Accounts">
            You are responsible for your account credentials and all activity under your
            account. You must provide accurate information and be at least 18 years old or
            the age of majority in your jurisdiction.
          </Section>

          <Section title="3. Acceptable use">
            You may not use the Service to generate unlawful, harmful, infringing, or abusive
            content; to attempt to breach security or access other tenants&apos; data; to
            overload or disrupt the infrastructure; or to resell the Service without
            permission. We may suspend accounts that violate these rules.
          </Section>

          <Section title="4. Credits, plans & billing">
            Tasks are unlimited. Credits are consumed only when platform-provided agents run
            on our LLM keys. Bring-your-own-key runs do not consume credits. Paid plans and
            credit packs are billed through our payment processor. Monthly credit grants do
            not roll over; purchased credit packs do not expire. Fees are non-refundable
            except where required by law.
          </Section>

          <Section title="5. Your content">
            You retain ownership of the prompts you submit and the output produced for you.
            You grant us a limited license to process this content solely to operate the
            Service. You are responsible for ensuring you have the rights to any content you
            submit.
          </Section>

          <Section title="6. Third-party AI providers">
            The Service routes requests to third-party LLM providers. Your use is also
            subject to their terms. We are not responsible for the accuracy, legality, or
            suitability of AI-generated output — review it before relying on it.
          </Section>

          <Section title="7. Limitation of liability">
            To the maximum extent permitted by law, OpenOffice is not liable for indirect,
            incidental, or consequential damages, or for any loss of data, profits, or
            output, arising from your use of the Service.
          </Section>

          <Section title="8. Termination">
            You may stop using the Service at any time. We may suspend or terminate access
            for violations of these Terms or to comply with the law.
          </Section>

          <Section title="9. Contact">
            Questions about these Terms: support@openoffice.local
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
