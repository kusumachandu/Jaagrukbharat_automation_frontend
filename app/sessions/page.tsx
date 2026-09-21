"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { RESULT_TONE, formatDuration } from "@/components/SummaryParts";
import { api, ApiError } from "@/lib/api";
import { InterventionType, RunListItem, RunStatus } from "@/lib/types";

type Filter = "all" | "attention" | "active" | "finished";

const ACTIVE = new Set<RunStatus>([RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.PAUSED]);

const FILTERS: Array<{ id: Filter; label: string; match: (r: RunListItem) => boolean }> = [
  { id: "all", label: "All", match: () => true },
  { id: "attention", label: "Needs attention", match: (r) => r.awaiting !== null },
  { id: "active", label: "Active", match: (r) => ACTIVE.has(r.status) },
  { id: "finished", label: "Finished", match: (r) => !ACTIVE.has(r.status) },
];

function windowUrl(run: RunListItem): string | null {
  if (!run.sessionKey || typeof window === "undefined") return null;
  return `${window.location.origin}/session/${run._id}/${run.sessionKey}`;
}

function when(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SessionsPage() {
  const { user, loading } = useRequireAuth();
  const [runs, setRuns] = useState<RunListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRuns(await api.get<RunListItem[]>("/runs?limit=100"));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load sessions");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [user, load]);

  async function copyLink(run: RunListItem) {
    const url = windowUrl(run);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(run._id);
      setTimeout(() => setCopied((c) => (c === run._id ? null : c)), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  if (loading || !user) return null;

  const current = FILTERS.find((f) => f.id === filter)!;
  const shown = (runs ?? []).filter(current.match);
  const attention = (runs ?? []).filter((r) => r.awaiting !== null).length;

  return (
    <div>
      <PageHeader
        eyebrow="Sessions"
        title="Live sessions"
        actions={
          <Link href="/workflows" className="btn-ghost">
            Workflows
          </Link>
        }
      />
      <div className="p-8">
        <p className="text-sm text-text-muted max-w-2xl mb-5">
          Every run, in one place. Each has a private link you can send to the person who needs to
          enter an OTP or CAPTCHA and pick up the result — they never see the operator tools.
        </p>

        <div className="flex flex-wrap gap-2 mb-5" role="tablist" aria-label="Filter sessions">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              data-testid={`filter-${f.id}`}
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3 py-1 text-xs font-mono transition-colors ${
                filter === f.id
                  ? "border-signal/50 bg-signal/10 text-signal"
                  : "border-ink-line text-text-muted hover:text-text-primary"
              }`}
            >
              {f.label}
              {f.id === "attention" && attention > 0 && (
                <span className="ml-1.5 rounded-full bg-warn/20 text-warn px-1.5">{attention}</span>
              )}
            </button>
          ))}
        </div>

        {error && <p className="text-danger text-sm mb-3">{error}</p>}
        {runs === null && !error && (
          <div className="text-text-muted font-mono text-sm">loading…</div>
        )}
        {runs !== null && shown.length === 0 && (
          <p className="text-text-muted text-sm">
            {runs.length === 0
              ? "No runs yet — start one from a workflow and it will show up here."
              : "Nothing matches this filter."}
          </p>
        )}

        <div className="flex flex-col gap-2" data-testid="session-list">
          {shown.map((run) => {
            const url = windowUrl(run);
            const duration = formatDuration(
              run.startedAt && run.finishedAt
                ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()
                : undefined,
            );
            return (
              <div
                key={run._id}
                data-testid="session-row"
                data-run-id={run._id}
                className="bg-ink-panel border border-ink-line rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/runs/${run._id}`}
                      className="font-display font-medium text-text-primary hover:text-signal truncate"
                    >
                      {run.workflowName}
                    </Link>
                    <StatusBadge status={run.status} />
                    {run.status === RunStatus.SUCCESS && run.result && (
                      <span
                        data-testid="session-result"
                        data-tone={run.result.tone}
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-mono ${
                          RESULT_TONE[run.result.tone].box
                        } ${RESULT_TONE[run.result.tone].text}`}
                      >
                        {run.result.label}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-text-dim">
                    <span>{when(run.startedAt ?? run.createdAt)}</span>
                    {duration && <span>{duration}</span>}
                    {run.fileCount > 0 && (
                      <span className="text-ok">
                        {run.fileCount} file{run.fileCount === 1 ? "" : "s"}
                      </span>
                    )}
                    {run.awaiting === InterventionType.INPUT_REQUIRED && (
                      <span data-testid="awaiting-input" className="text-warn">
                        ● waiting for a code from the user
                      </span>
                    )}
                    {run.awaiting === InterventionType.MANUAL_TAKEOVER && (
                      <span data-testid="awaiting-operator" className="text-danger">
                        ● needs an operator
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    data-testid="copy-link"
                    onClick={() => copyLink(run)}
                    disabled={!url}
                    title={url ? "Copy the private link for the user" : "No link for this run"}
                    className="btn-ghost text-xs disabled:opacity-40"
                  >
                    {copied === run._id ? "Copied ✓" : "Copy link"}
                  </button>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="open-window"
                      className="btn-ghost text-xs"
                    >
                      Open window ↗
                    </a>
                  ) : null}
                  <Link href={`/runs/${run._id}`} className="btn-ghost text-xs">
                    Operator view
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
