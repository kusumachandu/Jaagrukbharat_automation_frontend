"use client";

import { useState } from "react";
import { downloadFile, ApiError } from "@/lib/api";
import { RunSummary } from "@/lib/types";
import { RESULT_TONE, StepTimeline, formatBytes, formatDuration } from "./SummaryParts";
import { ResultTables } from "./ResultTables";

// The operator's view of how a finished run went: what happened, what it
// produced, and — when it failed — why, in plain language (with the raw error
// tucked behind a disclosure for debugging).
export function RunSummaryCard({
  runId,
  summary,
}: {
  runId: string;
  summary: RunSummary;
}) {
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The steps ran to the end but the application is not confirmed (e.g. no registration number came back):
  // not a green "all done".
  const unconfirmed = summary.outcome === "success" && summary.application?.status === "failed";
  const ok = summary.outcome === "success" && !unconfirmed;
  const failed = summary.outcome === "failed";
  const duration = formatDuration(summary.durationMs);
  // A run that ended with a result ("Not eligible…") is coloured by that
  // result, not just by success/failure.
  const tone = ok && summary.result ? RESULT_TONE[summary.result.tone] : null;
  const headline = unconfirmed ? "Steps finished — application not confirmed" : summary.headline;

  async function download(fileId: string, filename: string) {
    setBusyFile(fileId);
    setError(null);
    try {
      await downloadFile(`/runs/${runId}/artifacts/${fileId}`, filename);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not download that file");
    } finally {
      setBusyFile(null);
    }
  }

  return (
    <div
      data-testid="run-summary"
      data-outcome={summary.outcome}
      data-result-tone={summary.result?.tone}
      className={`border rounded-lg bg-ink-panel overflow-hidden ${
        tone ? tone.box.split(" ")[0] : ok ? "border-ok/40" : failed ? "border-danger/40" : unconfirmed ? "border-warn/50" : "border-ink-line"
      }`}
    >
      <div className="px-4 py-3 border-b border-ink-line flex items-start justify-between gap-3">
        <div>
          <div
            data-testid={summary.result ? "run-result" : undefined}
            data-tone={summary.result?.tone}
            className={`font-display font-semibold ${
              tone ? tone.text : ok ? "text-ok" : failed ? "text-danger" : unconfirmed ? "text-warn" : "text-text-primary"
            }`}
          >
            {headline}
          </div>
          <div className="text-xs text-text-muted mt-0.5">
            {summary.detail}
            {duration && <span className="font-mono text-text-dim"> · {duration}</span>}
          </div>
        </div>
        <div className="font-mono text-[11px] text-text-dim shrink-0">
          {summary.stepsDone}/{summary.stepsTotal} steps
        </div>
      </div>

      {/* Two separate answers: did the automation run to the end (task), and did the application succeed. */}
      {summary.application && summary.outcome !== "in_progress" && (
        <div data-testid="statuses" className="px-4 py-2.5 border-b border-ink-line flex flex-wrap gap-x-6 gap-y-1 text-xs">
          <div>
            <span className="font-mono uppercase tracking-wider text-text-dim">Task </span>
            <span className="text-text-primary">
              {summary.outcome === "success" ? "Completed" : summary.outcome === "failed" ? "Failed" : "Cancelled"}
            </span>
          </div>
          <div data-testid="application-status" data-status={summary.application.status}>
            <span className="font-mono uppercase tracking-wider text-text-dim">Application </span>
            <span
              className={
                summary.application.status === "success"
                  ? "text-ok font-medium"
                  : summary.application.status === "failed"
                    ? "text-danger font-medium"
                    : "text-text-primary"
              }
            >
              {summary.application.status === "success"
                ? `Success${summary.application.reference ? ` — ${summary.application.reference}` : ""}`
                : summary.application.status === "failed"
                  ? `Failed${summary.application.reason ? ` — ${summary.application.reason}` : ""}`
                  : "Cancelled"}
            </span>
          </div>
        </div>
      )}

      {(summary.tables?.length ?? 0) > 0 && (
        <div className="px-4 pt-4">
          <ResultTables tables={summary.tables ?? []} variant="table" />
        </div>
      )}

      {/* Two columns when the card is wide (stacked layout); one when it sits in the narrow right-hand column. */}
      <div className="p-4 grid gap-5 md:grid-cols-2 lg:grid-cols-1">
        <div className="flex flex-col gap-4 min-w-0">
          {failed && summary.failure && (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5">
              <div className="text-xs font-mono uppercase tracking-wide text-danger">
                Stopped at: {summary.failure.stepLabel}
              </div>
              <p className="text-sm text-text-primary mt-1">{summary.failure.reason}</p>
              <p className="text-xs text-text-muted mt-1">{summary.failure.suggestion}</p>
              {summary.failure.websiteSaid && summary.failure.websiteSaid.length > 0 && (
                <div data-testid="website-said" className="mt-2 rounded border border-danger/20 bg-ink/40 px-2.5 py-2">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-text-dim">
                    What the website said
                  </div>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {summary.failure.websiteSaid.map((line, i) => (
                      <li key={i} className="text-xs text-text-primary break-words">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.failure.technicalDetail && (
                <details className="mt-2">
                  <summary className="text-[11px] font-mono text-text-dim cursor-pointer">
                    technical detail
                  </summary>
                  <pre className="mt-1 text-[11px] font-mono text-text-muted whitespace-pre-wrap break-words max-h-40 overflow-auto scroll-hover">
                    {summary.failure.technicalDetail}
                  </pre>
                </details>
              )}
            </div>
          )}

          {summary.highlights.length > 0 && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-dim mb-1.5">
                Captured
              </div>
              <dl className="flex flex-col gap-1">
                {summary.highlights.map((h, i) => (
                  <div key={i} className="flex justify-between gap-3 text-sm">
                    <dt className="text-text-muted">{h.label}</dt>
                    <dd className="font-mono text-text-primary break-all text-right">{h.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {summary.files.length > 0 && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-dim mb-1.5">
                Files
              </div>
              <ul className="flex flex-col gap-1.5">
                {summary.files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 text-sm text-text-primary truncate">
                      {f.filename}
                      <span className="ml-2 text-[11px] font-mono text-text-dim">
                        {formatBytes(f.sizeBytes)}
                      </span>
                    </span>
                    <button
                      type="button"
                      data-testid="download-file"
                      onClick={() => download(f.id, f.filename)}
                      disabled={busyFile === f.id}
                      className="btn-ghost text-xs shrink-0 disabled:opacity-40"
                    >
                      {busyFile === f.id ? "Downloading…" : "Download"}
                    </button>
                  </li>
                ))}
              </ul>
              {error && <p className="text-danger text-xs mt-1">{error}</p>}
            </div>
          )}

          {(summary.handledByPeople.valuesEntered > 0 || summary.handledByPeople.fixesApplied > 0) && (
            <p className="text-[11px] font-mono text-text-dim">
              {summary.handledByPeople.valuesEntered} value(s) entered by a person ·{" "}
              {summary.handledByPeople.fixesApplied} fix(es) applied
            </p>
          )}
        </div>

        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-dim mb-2">
            What happened
          </div>
          {/* A long flow (Udyam has 85 steps) scrolls inside its own box instead of stretching the card. */}
          <div data-testid="step-timeline-scroll" className="max-h-[22rem] overflow-y-auto scroll-hover pr-2">
            <StepTimeline steps={summary.steps} />
          </div>
        </div>
      </div>
    </div>
  );
}
