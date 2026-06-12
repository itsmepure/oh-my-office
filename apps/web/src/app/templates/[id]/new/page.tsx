// /templates/[id]/new — Create-office form.
// Server component loads the template, hands the form to a client component.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { getTemplateById } from '@repo/db/offices';
import { CreateOfficeForm } from './form';

export const dynamic = 'force-dynamic';

export default async function NewOfficePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id } = await params;
  const template = await getTemplateById(id);
  if (!template) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-8">
      <div className="w-full max-w-lg space-y-4">
        <Link
          href="/templates"
          className="text-sm text-content-muted hover:underline"
        >
          ← Back to catalog
        </Link>
        <div className="card rounded-2xl p-6">
          <h1 className="text-2xl font-bold text-content">Create office</h1>
          <p className="mt-1 text-sm text-content-muted">
            From template:{' '}
            <span className="font-medium text-content">{template.name}</span>
          </p>
          <p className="mt-1 text-xs text-content-muted">
            {template.agents.length} agent
            {template.agents.length === 1 ? '' : 's'} will be snapshotted
            into this office.
          </p>

          <CreateOfficeForm templateId={template.id} defaultName={`My ${template.name}`} />
        </div>
      </div>
    </main>
  );
}
