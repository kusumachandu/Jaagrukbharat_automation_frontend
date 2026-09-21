"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { PageHeader } from "@/components/PageHeader";
import { api, ApiError } from "@/lib/api";
import { Workflow, TriggerType } from "@/lib/types";

export default function WorkflowsPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api
      .get<Workflow[]>("/workflows")
      .then(setWorkflows)
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.message : "Failed to load workflows",
        ),
      );
  }, [user]);

  async function runNow(id: string) {
    setBusyId(id);
    try {
      const run = await api.post<{ _id: string }>(`/workflows/${id}/run`);
      router.push(`/runs/${run._id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start run");
    } finally {
      setBusyId(null);
    }
  }

  async function duplicate(id: string) {
    setBusyId(id);
    try {
      const copy = await api.post<Workflow>(`/workflows/${id}/duplicate`);
      setWorkflows((prev) => (prev ? [copy, ...prev] : [copy]));
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Could not duplicate workflow",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (
      !confirm(
        "Delete this workflow? Run history is kept, but it will no longer run.",
      )
    )
      return;
    setBusyId(id);
    try {
      await api.delete(`/workflows/${id}`);
      setWorkflows((prev) => (prev ? prev.filter((w) => w._id !== id) : prev));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete workflow");
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading || !user) return null;

  return (
    <div>
      <PageHeader
        eyebrow="Dashboard"
        title="Workflows"
        actions={
          <>
            <Link href="/workflows/record" className="btn-ghost">
              Record instead
            </Link>
            <Link
              href="/workflows/new"
              className="rounded-md bg-signal text-ink font-semibold text-sm px-4 py-2 hover:bg-signal-glow transition-colors"
            >
              + New workflow
            </Link>
          </>
        }
      />

      <div className="p-8">
        {error && (
          <p className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-md px-3 py-2 mb-4">
            {error}
          </p>
        )}

        {workflows === null && <ListSkeleton />}

        {workflows !== null && workflows.length === 0 && <EmptyState />}

        {workflows !== null && workflows.length > 0 && (
          <div className="flex flex-col gap-3">
            {workflows.map((wf) => (
              <div
                key={wf._id}
                className="group bg-ink-panel border border-ink-line rounded-lg p-4 flex items-center justify-between hover:border-signal/30 transition-colors"
              >
                <Link href={`/workflows/${wf._id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-medium text-text-primary truncate">
                      {wf.name}
                    </h3>
                    {!wf.isActive && (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-text-dim border border-ink-line rounded px-1.5 py-0.5">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs font-mono text-text-muted">
                    <span>
                      {wf.steps.length} step{wf.steps.length === 1 ? "" : "s"}
                    </span>
                    <span className="text-ink-line">·</span>
                    <TriggerTag type={wf.trigger.type} />
                    <span className="text-ink-line">·</span>
                    <span>v{wf.version}</span>
                  </div>
                </Link>

                <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => runNow(wf._id)}
                    disabled={busyId === wf._id}
                    className="btn-ghost text-signal hover:border-signal/40 disabled:opacity-40"
                  >
                    {busyId === wf._id ? "Starting…" : "Run"}
                  </button>
                  <Link
                    href={`/workflows/${wf._id}/runs`}
                    className="btn-ghost"
                  >
                    History
                  </Link>
                  <button
                    onClick={() => duplicate(wf._id)}
                    disabled={busyId === wf._id}
                    className="btn-ghost"
                  >
                    Duplicate
                  </button>
                  <button
                    onClick={() => remove(wf._id)}
                    disabled={busyId === wf._id}
                    className="btn-ghost hover:text-danger hover:border-danger/40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TriggerTag({ type }: { type: TriggerType }) {
  const label =
    type === TriggerType.MANUAL
      ? "Manual"
      : type === TriggerType.CRON
        ? "Scheduled"
        : "Webhook";
  const disabled = type !== TriggerType.MANUAL;
  return (
    <span
      className={disabled ? "text-text-dim" : ""}
      title={disabled ? "Not yet wired up to fire automatically" : undefined}
    >
      {label}
      {disabled && "*"}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-ink-line rounded-lg p-12 text-center">
      <p className="font-display text-text-primary mb-1">No workflows yet</p>
      <p className="text-text-muted text-sm mb-5">
        Build your first automation — wire up steps, then run it.
      </p>
      <div className="flex items-center justify-center gap-2">
        <Link href="/workflows/record" className="btn-ghost">
          Record instead
        </Link>
        <Link
          href="/workflows/new"
          className="inline-block rounded-md bg-signal text-ink font-semibold text-sm px-4 py-2 hover:bg-signal-glow transition-colors"
        >
          + New workflow
        </Link>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-16 rounded-lg bg-ink-panel border border-ink-line animate-pulse"
        />
      ))}
    </div>
  );
}
