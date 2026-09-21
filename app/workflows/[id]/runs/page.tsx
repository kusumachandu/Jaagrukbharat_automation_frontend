'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { api, ApiError } from '@/lib/api';
import { Run, Workflow } from '@/lib/types';

export default function RunHistoryPage({ params }: { params: { id: string } }) {
  const { user, loading } = useRequireAuth();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get<Workflow>(`/workflows/${params.id}`),
      api.get<Run[]>(`/workflows/${params.id}/runs`),
    ])
      .then(([wf, r]) => {
        setWorkflow(wf);
        setRuns(r);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load run history'));
  }, [user, params.id]);

  if (loading || !user) return null;

  return (
    <div>
      <PageHeader
        eyebrow={workflow?.name ?? '—'}
        title="Run history"
        actions={
          <Link href={`/workflows/${params.id}`} className="btn-ghost">
            Back to builder
          </Link>
        }
      />
      <div className="p-8">
        {error && <p className="text-danger text-sm">{error}</p>}
        {runs === null && !error && (
          <div className="text-text-muted font-mono text-sm">loading…</div>
        )}
        {runs !== null && runs.length === 0 && (
          <p className="text-text-muted text-sm">No runs yet — trigger one from the builder.</p>
        )}
        {runs !== null && runs.length > 0 && (
          <div className="flex flex-col gap-2">
            {runs.map((run) => (
              <Link
                key={run._id}
                href={`/runs/${run._id}`}
                className="bg-ink-panel border border-ink-line rounded-lg px-4 py-3 flex items-center justify-between hover:border-signal/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <StatusBadge status={run.status} />
                  <span className="text-xs font-mono text-text-dim">
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono text-text-muted">
                  {run.fallbacksUsed > 0 && <span>{run.fallbacksUsed} fallback{run.fallbacksUsed === 1 ? '' : 's'}</span>}
                  {run.interventionsCount > 0 && <span>{run.interventionsCount} intervention{run.interventionsCount === 1 ? '' : 's'}</span>}
                  <span className="text-text-dim">v{run.workflowVersion}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
