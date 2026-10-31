"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { ApplicationBadge } from "@/components/ApplicationBadge";
import { LogConsole } from "@/components/LogConsole";
import { InterventionPanel } from "@/components/InterventionPanel";
import { ControlPanel, ControlState } from "@/components/ControlPanel";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";
import { api, ApiError } from "@/lib/api";
import {
  ActionLog,
  ActionResult,
  Intervention,
  InterventionType,
  ResolutionAction,
  Run,
  RunStatus,
  RunInputField,
  Workflow,
} from "@/lib/types";
import { RunInputsDialog } from "@/components/RunInputsDialog";
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

const NO_CONTROL: ControlState = { controlled: false, requested: false, viewport: null };

export default function RunDetailPage({ params }: { params: { id: string } }) {
  const { user, loading } = useRequireAuth();
  const [run, setRun] = useState<Run | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [intervention, setIntervention] = useState<Intervention | null>(null);
  const [control, setControl] = useState<ControlState>(NO_CONTROL);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // Edit & retry: the run's inputs, loaded when the form opens (null = form closed).
  const [editFields, setEditFields] = useState<RunInputField[] | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [clearingSignIn, setClearingSignIn] = useState(false);
  const [signInCleared, setSignInCleared] = useState(false);
  const workflowLoaded = useRef(false);
  const [view, setView] = useState<"live" | "canvas" | "recording" | "snapshots">("live");
  // Once nobody has picked a tab, a finished run opens on what there is to look at (its screenshots / recording)
  // instead of an empty "browser not running" live tab.
  const pickedView = useRef(false);
  const chooseView = (v: "live" | "canvas" | "recording" | "snapshots") => {
    pickedView.current = true;
    setView(v);
  };

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

      // Who has the browser: only meaningful while the run is going or paused.
      if (r.status === RunStatus.RUNNING || r.status === RunStatus.PAUSED) {
        try {
          setControl(await api.get<ControlState>(`/runs/${params.id}/control`));
        } catch {
          setControl(NO_CONTROL);
        }
      } else {
        setControl(NO_CONTROL);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load run");
    }
  }, [params.id]);

  // A finished run, with no tab picked yet: open on what there is to look at, not an empty live tab.
  useEffect(() => {
    if (!run || pickedView.current || ACTIVE_STATUSES.has(run.status) || view !== "live") return;
    setView(run.snapshots?.length ? "snapshots" : run.recording ? "recording" : "canvas");
  }, [run, view]);

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

  // While control is requested or held, check more often so the panel reacts quickly.
  useEffect(() => {
    if (!user || !(control.requested || control.controlled)) return;
    const interval = setInterval(poll, 1500);
    return () => clearInterval(interval);
  }, [user, control.requested, control.controlled, poll]);

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

  async function takeControl() {
    try {
      await api.post(`/runs/${params.id}/control/take`);
      await poll();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not take control");
    }
  }

  async function releaseControl() {
    try {
      await api.post(`/runs/${params.id}/control/release`);
      await poll();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not release control");
    }
  }

  // Open an address in the browser you are controlling.
  async function gotoUrl(url: string) {
    try {
      await api.post(`/runs/${params.id}/control/goto`, { url });
      await poll();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open that address");
    }
  }

  // Hand the browser back; the automation carries on from the last step you did ("auto") or a chosen step.
  async function resumeFrom(order: number | "auto") {
    try {
      await api.post(`/runs/${params.id}/resume`, { action: ResolutionAction.RESUME, value: String(order) });
      setControl((c) => ({ ...c, controlled: false }));
      await poll();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not resume the automation");
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

  // A fresh run with the same inputs; opens it.
  async function retry() {
    setRetrying(true);
    try {
      const fresh = await api.post<Run>(`/runs/${params.id}/retry`);
      router.push(`/runs/${fresh._id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not retry the run");
      setRetrying(false);
    }
  }

  // Edit & retry: open the form with what this run used (sensitive values stay on the server).
  async function openEdit() {
    try {
      setEditFields(await api.get<RunInputField[]>(`/runs/${params.id}/inputs`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load this run's values");
    }
  }

  // Sends only what the person changed; everything else is carried over by the server.
  async function retryEdited(values: Record<string, string>) {
    if (!editFields) return;
    const changes: Record<string, string> = {};
    for (const f of editFields) {
      const now = values[f.key] ?? "";
      if (f.sensitive ? now !== "" : now !== (f.value ?? "")) changes[f.key] = now;
    }
    setRetrying(true);
    try {
      const fresh = await api.post<Run>(`/runs/${params.id}/retry`, { inputs: changes });
      router.push(`/runs/${fresh._id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not retry the run");
      setRetrying(false);
      setEditFields(null);
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
        title={
          run ? (
            // Two separate answers: did the automation run to the end (task), and did the application succeed.
            <span className="flex flex-wrap items-center gap-x-8 gap-y-1">
              <span className="flex items-center gap-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-text-dim">Task</span>
                <StatusBadge status={run.status} />
              </span>
              {summary?.application && (
                <span className="flex items-center gap-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-text-dim">Application</span>
                  <ApplicationBadge application={summary.application} />
                </span>
              )}
            </span>
          ) : (
            "—"
          )
        }
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
            {run &&
              (run.status === RunStatus.FAILED || run.status === RunStatus.CANCELLED) && (
                <button
                  onClick={retry}
                  disabled={retrying}
                  data-testid="retry-run"
                  className="btn-ghost hover:text-signal hover:border-signal/40 disabled:opacity-40"
                >
                  {retrying ? "Retrying…" : "Retry run"}
                </button>
              )}
            {run &&
              (run.status === RunStatus.FAILED || run.status === RunStatus.CANCELLED) && (
                <button
                  onClick={openEdit}
                  disabled={retrying}
                  data-testid="edit-retry-run"
                  title="Change some of the values this run used, then run it again"
                  className="btn-ghost hover:text-signal hover:border-signal/40 disabled:opacity-40"
                >
                  Edit &amp; retry
                </button>
              )}
            {editFields && (
              <RunInputsDialog
                inputs={editFields}
                submitting={retrying}
                onSubmit={retryEdited}
                onCancel={() => setEditFields(null)}
                initialValues={Object.fromEntries(
                  editFields.filter((f) => !f.sensitive).map((f) => [f.key, f.value ?? ""]),
                )}
                keepKeys={editFields.filter((f) => f.sensitive && f.hasValue).map((f) => f.key)}
                title="Edit & retry"
                description="Change what needs fixing, then run it again. Anything you leave as it is is kept — private values (Aadhaar, PAN, bank account…) stay hidden unless you type a new one."
                submitLabel="Retry with these"
              />
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

      {/* Side by side on a wide screen — the viewer (live browser, screenshots…) on the left, the details on the
          right — and stacked, as before, on a narrow one. */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row" data-testid="run-layout">
        <div
          data-testid="run-viewer"
          className={`${
            run && !ACTIVE_STATUSES.has(run.status) ? "h-[30%]" : "h-[68%]"
          } lg:h-auto lg:w-[58%] lg:shrink-0 min-h-0 border-b lg:border-b-0 lg:border-r border-ink-line flex flex-col`}
        >
          <div className="flex gap-1 px-3 py-2 border-b border-ink-line">
            <button
              onClick={() => chooseView("live")}
              className={`text-xs font-mono uppercase px-2 py-1 rounded ${
                view === "live" ? "bg-signal/15 text-signal" : "text-text-muted"
              }`}
            >
              Live
            </button>
            <button
              onClick={() => chooseView("canvas")}
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
                onClick={() => chooseView("snapshots")}
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
                onClick={() => chooseView("recording")}
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
                controlling={control.controlled}
                viewport={control.viewport}
                onControlEnded={() => {
                  setControl((c) => ({ ...c, controlled: false }));
                  poll();
                }}
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

        <div data-testid="run-details" className="flex-1 min-h-0 lg:min-w-0 overflow-y-auto scroll-hover p-4 flex flex-col gap-4 [&>*]:shrink-0">
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

          {run && workflow && (run.status === RunStatus.RUNNING || run.status === RunStatus.PAUSED) && (
            <ControlPanel
              status={run.status}
              control={control}
              intervention={intervention}
              steps={workflow.steps}
              onTake={takeControl}
              onRelease={releaseControl}
              onResume={resumeFrom}
              onGoto={gotoUrl}
            />
          )}

          {intervention && intervention.type !== InterventionType.HUMAN_CONTROL && (
            <InterventionPanel
              intervention={intervention}
              step={workflow?.steps.find((s) => s.order === intervention.stepOrder)}
              onResolve={resolve}
            />
          )}

          {run?.errorMessage && (
            <p className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-md px-3 py-2">
              {/* "website rejected: <reason> ‖ <advice>" is how the engine writes it; show it as plain sentences. */}
              {run.errorMessage.replace(/^website rejected:\s*/i, "").replace(/\s*‖\s*/g, " — ")}
            </p>
          )}

          <div className="border border-ink-line rounded-lg bg-ink-panel overflow-hidden">
            <div className="px-4 py-2 border-b border-ink-line font-mono text-[10px] uppercase tracking-wider text-text-dim">
              Action log
            </div>
            {/* Its own scroll box, so a long log never pushes the rest of the page away. */}
            <div data-testid="action-log-scroll" className="max-h-[45vh] overflow-y-auto scroll-hover">
              <LogConsole logs={logs} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
