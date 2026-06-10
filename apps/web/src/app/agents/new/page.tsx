// /agents/new — Agent builder form.
// Server component: gate on session, then hand the form to a client component.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { AgentBuilderForm } from './form';

export const dynamic = 'force-dynamic';

export default async function NewAgentPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <main className="min-h-screen bg-bg p-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <Link href="/agents" className="text-sm text-content-muted hover:underline">
          ← My Agents
        </Link>
        <div className="rounded-md border border-line bg-surface p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-content">Create agent</h1>
          <p className="mt-1 text-sm text-content-muted">
            Configure your custom AI agent. You can add it to an office later.
          </p>
          <AgentBuilderForm />
        </div>
      </div>
    </main>
  );
}
