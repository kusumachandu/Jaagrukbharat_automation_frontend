"use client";

import { useState } from "react";
import { downloadFile, ApiError } from "@/lib/api";
import { RunSummary } from "@/lib/types";
import { RESULT_TONE, StepTimeline, formatBytes, formatDuration } from "./SummaryParts";

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
  const ok = summary.outcome === "success";
  const failed = summary.outcome === "failed";
  const duration = formatDuration(summary.durationMs);
  // A run that ended with a result ("Not eligible…") is coloured by that
  // result, not just by success/failure.
  const tone = ok && summary.result ? RESULT_TONE[summary.result.tone] : null;

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
        tone ? tone.box.split(" ")[0] : ok ? "border-ok/40" : failed ? "border-danger/40" : "border-ink-line"
      }`}
    >
      <div className="px-4 py-3 border-b border-ink-line flex items-start justify-between gap-3">
        <div>
          <div
            data-testid={summary.result ? "run-result" : undefined}
            data-tone={summary.result?.tone}
            className={`font-display font-semibold ${
              tone ? tone.text : ok ? "text-ok" : failed ? "text-danger" : "text-text-primary"
            }`}
          >
            {summary.headline}
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

      <div className="p-4 grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-4 min-w-0">
          {failed && summary.failure && (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5">
              <div className="text-xs font-mono uppercase tracking-wide text-danger">
                Stopped at: {summary.failure.stepLabel}
              </div>
              <p className="text-sm text-text-primary mt-1">{summary.failure.reason}</p>
              <p className="text-xs text-text-muted mt-1">{summary.failure.suggestion}</p>
              {summary.failure.technicalDetail && (
                <details className="mt-2">
                  <summary className="text-[11px] font-mono text-text-dim cursor-pointer">
                    technical detail
                  </summary>
                  <pre className="mt-1 text-[11px] font-mono text-text-muted whitespace-pre-wrap break-words max-h-40 overflow-auto">
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
          <StepTimeline steps={summary.steps} />
        </div>
      </div>
    </div>
  );
}
