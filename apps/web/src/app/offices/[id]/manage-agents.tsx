'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { OfficeView, AgentView } from '@repo/shared';

interface Props {
  office: OfficeView;
  myAgents: AgentView[];
}

export function ManageOfficeAgents({ office, myAgents }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(agentId: string) {
    setLoading(agentId);
    setError(null);

    const stepOrder = office.agents.length + 1;
    try {
      const res = await fetch(`/api/offices/${office.id}/agents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId, stepOrder }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(null);
    }
  }

  async function handleRemove(oaId: string) {
    setLoading(oaId);
    setError(null);

    try {
      const res = await fetch(
        `/api/offices/${office.id}/agents?oaId=${encodeURIComponent(oaId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(null);
    }
  }

  // Agents that are NOT yet in the office
  const addable = myAgents.filter(
    (a) => !office.agents.some((oa) => oa.agent.id === a.id),
  );

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-content-muted">
          {office.agents.length} agents in the workflow pipeline
        </p>
        {addable.length > 0 && (
          <details className="relative">
            <summary className="cursor-pointer rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-content-muted hover:bg-surface-2 hover:text-content transition">
              + Add agent
            </summary>
            <div className="absolute right-0 z-10 mt-1 w-56 rounded-md border border-line bg-surface shadow-lg">
              <ul className="py-1 text-sm">
                {addable.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      disabled={loading === a.id}
                      onClick={() => handleAdd(a.id)}
                      className="block w-full px-4 py-1.5 text-left text-content-muted hover:bg-surface-2 hover:text-content cursor-pointer disabled:opacity-50"
                    >
                      {a.name}{' '}
                      <span className="text-xs text-content-faint">({a.role})</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-danger/40 bg-danger/10 p-2 text-xs text-danger">
          {error}
        </div>
      )}

      {office.agents.length === 0 ? (
        <p className="text-sm text-content-muted">
          No agents in this office yet. Add one from the dropdown above.
        </p>
      ) : (
        <ol className="space-y-2">
          {office.agents.map((oa) => (
            <li
              key={oa.id}
              className="flex items-start gap-3 rounded-md border border-line bg-surface-2 p-3"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                {oa.stepOrder}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-content">{oa.agent.name}</h3>
                  {oa.agent.role && oa.agent.role !== oa.agent.name && (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-content-muted">
                      {oa.agent.role}
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-content-muted">
                  {oa.agent.systemPrompt}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {oa.agent.tools.map((t) => (
                    <span
                      key={t}
                      className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-content-muted"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={loading === oa.id}
                onClick={() => handleRemove(oa.id)}
                className="shrink-0 rounded-md border border-danger/40 bg-surface px-2 py-0.5 text-xs text-danger hover:bg-danger/10 cursor-pointer transition disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
