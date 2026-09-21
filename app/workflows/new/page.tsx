'use client';

import { useRequireAuth } from '@/hooks/useRequireAuth';
import { WorkflowBuilder } from '@/components/WorkflowBuilder';

export default function NewWorkflowPage() {
  const { user, loading } = useRequireAuth();
  if (loading || !user) return null;
  return <WorkflowBuilder />;
}
