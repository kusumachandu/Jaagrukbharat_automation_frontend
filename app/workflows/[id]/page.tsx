'use client';

import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { WorkflowBuilder } from '@/components/WorkflowBuilder';
import { api, ApiError } from '@/lib/api';
import { Workflow } from '@/lib/types';

export default function EditWorkflowPage({ params }: { params: { id: string } }) {
  const { user, loading } = useRequireAuth();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api
      .get<Workflow>(`/workflows/${params.id}`)
      .then(setWorkflow)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load workflow'));
  }, [user, params.id]);

  if (loading || !user) return null;

  if (error) {
    return <p className="p-8 text-danger text-sm">{error}</p>;
  }

  if (!workflow) {
    return <div className="p-8 text-text-muted font-mono text-sm">loading workflow…</div>;
  }

  return (
    <WorkflowBuilder
      workflowId={workflow._id}
      initialName={workflow.name}
      initialDescription={workflow.description}
      initialTrigger={workflow.trigger}
      initialSteps={workflow.steps}
      initialInputs={workflow.inputs}
      initialKeepSignedIn={workflow.keepSignedIn}
    />
  );
}
