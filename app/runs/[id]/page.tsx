"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { LogConsole } from "@/components/LogConsole";
import { InterventionPanel } from "@/components/InterventionPanel";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";
import { api, ApiError } from "@/lib/api";
import {
  ActionLog,
  ActionResult,
  Intervention,
  ResolutionAction,
  Run,
  RunStatus,
  Workflow,
} from "@/lib/types";
import { LiveBrowserView } from "@/components/LiveBrowserView";
import { RunSummaryCard } from "@/components/RunSummaryCard";
import { RecordingPlayer } from "@/components/RecordingPlayer";
import { SnapshotTimeline } from "@/components/SnapshotTimeline";
import { RunSummary } from "@/lib/types";

const ACTIVE_STATUSES = new Set([
  RunStatus.QUEUED,
  RunStatus.RUNNING,
  RunStatus.PAUSED,
]);

export default function RunDetailPage({ params }: { params: { id: string } }) {
  const { user, loading } = useRequireAuth();
  const [run, setRun] = useState<Run | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [intervention, setIntervention] = useState<Intervention | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [clearingSignIn, setClearingSignIn] = useState(false);
  const [signInCleared, setSignInCleared] = useState(false);
  const workflowLoaded = useRef(false);
  const [view, setView] = useState<"live" | "canvas" | "recording" | "snapshots">("live");

  const poll = useCallback(async () => {
    try {
      const r = await api.get<Run>(`/runs/${params.id}`);
      setRun(r);

      if (!workflowLoaded.current) {
        workflowLoaded.current = true;
        api
          .get<Workflow>(`/workflows/${r.workflowId}`)
          .then(setWorkflow)
          .catch(() => {});
      }

      const l = await api.get<ActionLog[]>(`/runs/${params.id}/logs`);
      setLogs(l);

      if (r.status === RunStatus.PAUSED) {
        try {
          const iv = await api.get<Intervention>(
            `/runs/${params.id}/interventions/pending`
          );
          setIntervention(iv);
        } catch {
          setIntervention(null);
        }
      } else {
        setIntervention(null);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load run");
    }
  }, [params.id]);

  useEffect(() => {
    if (!user) return;
    poll();
    const interval = setInterval(() => {
      setRun((current) => {
        if (current && !ACTIVE_STATUSES.has(current.status)) return current;
        poll();
        return current;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [user, poll]);

  // Once a run has ended, fetch its plain-language summary (what happened,
  // files, why it failed). Re-fetched if the status changes.
  const status = run?.status;
  useEffect(() => {
    if (!user || !status || ACTIVE_STATUSES.has(status)) {
      setSummary(null);
      return;
    }
    api
      .get<RunSummary>(`/runs/${params.id}/summary`)
      .then(setSummary)
      .catch(() => {});
  }, [user, status, params.id]);

  async function copyUserLink() {
    if (!run?.sessionKey) return;
    const url = `${window.location.origin}/session/${run._id}/${run.sessionKey}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  async function resolve(action: ResolutionAction, value?: string) {
    try {
      await api.post(`/runs/${params.id}/resume`, { action, value });
      await poll();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Could not resolve intervention"
      );
    }
  }

  // A run that reused a saved sign-in to the target website and then failed
  // may simply have hit an expired session — let the operator drop it so the
  // next run signs in afresh.
  async function clearSavedSignIn() {
    if (!run) return;
    setClearingSignIn(true);
    try {
      await api.delete(`/workflows/${run.workflowId}/sign-in`);
      setSignInCleared(true);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Could not clear the saved sign-in"
      );
    } finally {
      setClearingSignIn(false);
    }
  }

  async function cancel() {
    setCancelling(true);
    try {
      await api.post(`/runs/${params.id}/cancel`);
      await poll();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not cancel run");
    } finally {
      setCancelling(false);
    }
  }

  if (loading || !user) return null;

  const liveByOrder: Record<number, ActionResult | "active"> = {};
  for (const log of logs) {
    liveByOrder[log.stepOrder] = log.result;
  }
  if (run?.status === RunStatus.RUNNING && workflow) {
    // The next *connected* step after the last one that ran — disconnected
    // steps are skipped by the engine, so they're never the active one.
    const lastRan =
      logs.length > 0 ? Math.max(...logs.map((l) => l.stepOrder)) : -1;
    const next = workflow.steps.find(
      (s) =>
        s.order > lastRan &&
        s.enabled !== false &&
        !(run.usedSavedSignIn && s.signInOnly) &&
        !(run.activeBranch !== undefined && s.branch !== undefined && s.branch !== run.activeBranch)
    );
    if (next) liveByOrder[next.order] = "active";
  }

  return (
    <div className="flex flex-col h-screen">
      <PageHeader
        eyebrow={workflow?.name ?? "Run"}
        title={run ? <StatusBadge status={run.status} /> : "—"}
        actions={
          <div className="flex items-center gap-2">
            {run?.sessionKey && (
              <button
                type="button"
                data-testid="copy-user-link"
                onClick={copyUserLink}
                className="btn-ghost"
                title="A private link for the person who needs to enter an OTP/CAPTCHA and download the result"
              >
                {linkCopied ? "Link copied ✓" : "Copy user link"}
              </button>
            )}
            {run && workflow && (
              <Link
                href={`/workflows/${workflow._id}/runs`}
                className="btn-ghost"
              >
                All runs
              </Link>
            )}
            {run && ACTIVE_STATUSES.has(run.status) && (
              <button
                onClick={cancel}
                disabled={cancelling}
                className="btn-ghost hover:text-danger hover:border-danger/40 disabled:opacity-40"
              >
                {cancelling ? "Cancelling…" : "Cancel run"}
              </button>
            )}
          </div>
        }
      />

      {error && <p className="text-danger text-sm px-8 py-2">{error}</p>}

      <div className="flex-1 min-h-0 flex flex-col">
        <div
          className={`${
            run && !ACTIVE_STATUSES.has(run.status) ? "h-[30%]" : "h-[68%]"
          } border-b border-ink-line flex flex-col`}
        >
          <div className="flex gap-1 px-3 py-2 border-b border-ink-line">
            <button
              onClick={() => setView("live")}
              className={`text-xs font-mono uppercase px-2 py-1 rounded ${
                view === "live" ? "bg-signal/15 text-signal" : "text-text-muted"
              }`}
            >
              Live
            </button>
            <button
              onClick={() => setView("canvas")}
              className={`text-xs font-mono uppercase px-2 py-1 rounded ${
                view === "canvas"
                  ? "bg-signal/15 text-signal"
                  : "text-text-muted"
              }`}
            >
              Canvas
            </button>
            {!!run?.snapshots?.length && (
              <button
                data-testid="view-snapshots"
                onClick={() => setView("snapshots")}
                className={`text-xs font-mono uppercase px-2 py-1 rounded ${
                  view === "snapshots"
                    ? "bg-signal/15 text-signal"
                    : "text-text-muted"
                }`}
              >
                Screenshots
              </button>
            )}
            {run?.recording && (
              <button
                data-testid="view-recording"
                onClick={() => setView("recording")}
                className={`text-xs font-mono uppercase px-2 py-1 rounded ${
                  view === "recording"
                    ? "bg-signal/15 text-signal"
                    : "text-text-muted"
                }`}
              >
                Recording
              </button>
            )}
          </div>
          <div className="flex-1 min-h-0">
            {view === "live" && run && (
              <LiveBrowserView
                runId={params.id}
                active={ACTIVE_STATUSES.has(run.status)}
              />
            )}
            {view === "snapshots" && run?.snapshots && (
              <SnapshotTimeline runId={params.id} snapshots={run.snapshots} />
            )}
            {view === "recording" && run?.recording && (
              <RecordingPlayer runId={params.id} />
            )}
            {view === "canvas" &&
              (workflow ? (
                <WorkflowCanvas
                  steps={workflow.steps}
                  selectedIndex={null}
                  onSelect={() => {}}
                  onDelete={() => {}}
                  onAdd={() => {}}
                  liveByOrder={liveByOrder}
                  readOnly
                />
              ) : (
                <div className="p-8 text-text-dim font-mono text-sm">
                  loading workflow…
                </div>
              ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
          {summary && run && (
            <RunSummaryCard runId={run._id} summary={summary} />
          )}

          {run &&
            (run.status === RunStatus.FAILED || run.status === RunStatus.CANCELLED) &&
            run.usedSavedSignIn && (
            <div
              data-testid="saved-sign-in-hint"
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warn/40 bg-warn/10 px-3 py-2.5"
            >
              <p className="text-sm text-text-primary">
                This run started from a saved sign-in, which may have expired or
                been logged out on the website — the run may have been stuck on
                its login page.
              </p>
              <button
                type="button"
                data-testid="clear-saved-sign-in"
                onClick={clearSavedSignIn}
                disabled={clearingSignIn || signInCleared}
                className="btn-ghost text-xs shrink-0 disabled:opacity-50"
              >
                {signInCleared
                  ? "Cleared ✓ — next run signs in again"
                  : clearingSignIn
                    ? "Clearing…"
                    : "Clear saved sign-in"}
              </button>
            </div>
          )}

          {intervention && (
            <InterventionPanel
              intervention={intervention}
              step={workflow?.steps.find((s) => s.order === intervention.stepOrder)}
              onResolve={resolve}
            />
          )}

          {run?.errorMessage && (
            <p className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
              {run.errorMessage}
            </p>
          )}

          <div className="border border-ink-line rounded-lg bg-ink-panel overflow-hidden">
            <div className="px-4 py-2 border-b border-ink-line font-mono text-[10px] uppercase tracking-wider text-text-dim">
              Action log
            </div>
            <LogConsole logs={logs} />
          </div>
        </div>
      </div>
    </div>
  );
}
