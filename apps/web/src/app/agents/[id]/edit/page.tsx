// /agents/[id]/edit — pre-filled edit form for a user-owned agent.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { getAgentById } from '@repo/db/agents';
import { AgentBuilderForm } from '../../new/form';

export const dynamic = 'force-dynamic';

export default async function EditAgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id } = await params;
  const agent = await getAgentById(id, session.user.id);
  if (!agent) notFound();

  return (
    <main className="min-h-screen bg-bg p-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <Link href="/agents" className="text-sm text-content-muted hover:underline">
          ← My Agents
        </Link>
        <div className="card rounded-2xl p-6">
          <h1 className="text-2xl font-bold text-content">Edit agent</h1>
          <p className="mt-1 text-sm text-content-muted">
            Editing &ldquo;{agent.name}&rdquo;. Changes apply immediately and do
            NOT affect agents already snapshotted into offices.
          </p>
          <AgentBuilderForm
            agentId={agent.id}
            initial={{
              name: agent.name,
              role: agent.role,
              systemPrompt: agent.systemPrompt,
              tools: agent.tools,
              model:
                typeof agent.modelConfig?.model === 'string'
                  ? agent.modelConfig.model
                  : 'claude-sonnet-4-20250514',
              temperature:
                typeof agent.modelConfig?.temperature === 'number'
                  ? agent.modelConfig.temperature
                  : 0.3,
            }}
          />
        </div>
      </div>
    </main>
  );
}
