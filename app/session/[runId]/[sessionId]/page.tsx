"use client";

import { useCallback, useEffect, useState } from "react";
import { publicSession } from "@/lib/public-api";
import { ApiError } from "@/lib/api";
import { PublicSessionView, RunStatus } from "@/lib/types";
import { PromptCard } from "@/components/session/PromptCard";
import { RESULT_TONE, StepTimeline, formatBytes, formatDuration } from "@/components/SummaryParts";
import { BRAND_NAME, PRIVACY_URL } from "@/lib/brand";

const ACTIVE = new Set<RunStatus>([RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.PAUSED]);

// The page a person opens from a private link to answer their own OTP/CAPTCHA
// and pick up their files. No login: the key in the URL is the credential
// (`sessionId` is that key). It shows progress in plain language and never any
// technical detail.
export default function SessionWindow({
  params,
}: {
  params: { runId: string; sessionId: string };
}) {
  const { runId, sessionId: key } = params;
  const [view, setView] = useState<PublicSessionView | null>(null);
  const [problem, setProblem] = useState<"invalid" | "offline" | null>(null);
  // When the person last submitted a value. The prompt card disappears the moment the
  // run moves on, so the "got it" confirmation is kept on screen briefly at page level.
  const [answeredAt, setAnsweredAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const v = await publicSession.view(runId, key);
      setView(v);
      setProblem(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setProblem("invalid");
      else setProblem("offline");
    }
  }, [runId, key]);

  const active = problem !== "invalid" && (!view || ACTIVE.has(view.status));

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!answeredAt) return;
    const t = setTimeout(() => setAnsweredAt(null), 3000);
    return () => clearTimeout(t);
  }, [answeredAt]);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [active, load]);

  if (problem === "invalid") return <InvalidLink />;
  if (!view) {
    return (
      <Shell>
        <p className="text-center text-text-muted font-mono text-sm pt-24">
          {problem === "offline" ? "Can't reach the service — retrying…" : "Loading…"}
        </p>
      </Shell>
    );
  }

  const { summary, awaiting } = view;
  const finished = !ACTIVE.has(view.status);
  const pct =
    summary.stepsTotal > 0 ? Math.round((summary.stepsDone / summary.stepsTotal) * 100) : 0;

  return (
    <Shell>
      <header className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-text-dim">
            <span className="w-2 h-2 rounded-full bg-signal pulse-soft" />
            {BRAND_NAME}
          </div>
          <StatusPill status={view.status} waiting={!!awaiting?.canAnswer} />
        </div>
        <h1
          data-testid="window-title"
          className="font-display text-2xl sm:text-3xl font-semibold text-text-primary mt-3 leading-tight"
        >
          {view.workflowName}
        </h1>
        <p data-testid="about-page" className="text-sm text-text-muted mt-2">
          {BRAND_NAME} is completing this request for you on the official website. If that
          website asks for a code, it will appear here for you to enter. This is{" "}
          <span className="text-text-primary">not a government website</span>. Only enter a code
          for a request you asked {BRAND_NAME} to do, and don&apos;t share this link.
        </p>
        <div className="mt-4" aria-label="Progress">
          <div className="h-1.5 rounded-full bg-ink-raised overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                summary.outcome === "failed" ? "bg-danger" : summary.outcome === "success" ? "bg-ok" : "bg-signal"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-[11px] font-mono text-text-dim">
            <span>
              {summary.stepsDone} of {summary.stepsTotal} steps
            </span>
            {formatDuration(summary.durationMs) && <span>{formatDuration(summary.durationMs)}</span>}
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-5" aria-live="polite">
        {!finished && awaiting?.canAnswer && (
          <PromptCard
            key={awaiting.prompt}
            runId={runId}
            sessionKey={key}
            awaiting={awaiting}
            onAnswered={() => {
              setAnsweredAt(Date.now());
              load();
            }}
          />
        )}

        {!finished && awaiting && !awaiting.canAnswer && (
          <div
            data-testid="operator-note"
            className="rounded-2xl border border-warn/40 bg-warn/10 px-5 py-5"
          >
            <div className="font-display font-semibold text-warn">Hang tight</div>
            <p className="text-sm text-text-primary mt-1">{awaiting.prompt}</p>
          </div>
        )}

        {!finished && !awaiting?.canAnswer && answeredAt !== null && (
          <div
            data-testid="prompt-sent"
            className="rounded-2xl border border-ok/40 bg-ok/10 px-5 py-6 text-center"
          >
            <div className="text-ok font-display font-semibold">Thanks — got it</div>
            <p className="text-sm text-text-muted mt-1">Continuing now. You can keep this page open.</p>
          </div>
        )}

        {!finished && !awaiting && answeredAt === null && (
          <div className="rounded-2xl border border-ink-line bg-ink-panel px-5 py-5 flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-signal pulse-soft shrink-0" />
            <div>
              <div className="text-text-primary font-medium">{summary.headline}</div>
              <div className="text-sm text-text-muted">{summary.detail}</div>
            </div>
          </div>
        )}

        {finished && summary.outcome === "success" && (
          <div
            data-testid="outcome-success"
            data-result-tone={summary.result?.tone}
            className={`rounded-2xl border px-5 py-6 sm:px-7 ${
              summary.result ? RESULT_TONE[summary.result.tone].box : "border-ok/40 bg-ok/10"
            }`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`w-10 h-10 rounded-full border flex items-center justify-center text-xl ${
                  summary.result
                    ? `${RESULT_TONE[summary.result.tone].ring} ${RESULT_TONE[summary.result.tone].text}`
                    : "bg-ok/20 border-ok/60 text-ok"
                }`}
              >
                {summary.result ? RESULT_TONE[summary.result.tone].glyph : "✓"}
              </span>
              <div>
                <div
                  data-testid={summary.result ? "run-result" : undefined}
                  data-tone={summary.result?.tone}
                  className={`font-display text-xl font-semibold ${
                    summary.result ? RESULT_TONE[summary.result.tone].text : "text-ok"
                  }`}
                >
                  {summary.headline}
                </div>
                <div className="text-sm text-text-muted">{summary.detail}</div>
              </div>
            </div>

            {summary.highlights.length > 0 && (
              <dl className="mt-5 rounded-xl bg-ink-panel/70 border border-ink-line divide-y divide-ink-line">
                {summary.highlights.map((h, i) => (
                  <div key={i} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                    <dt className="text-text-muted">{h.label}</dt>
                    <dd className="font-mono text-text-primary break-all text-right">{h.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {summary.files.length > 0 ? (
              <div className="mt-5 flex flex-col gap-2">
                {summary.files.map((f) => (
                  <a
                    key={f.id}
                    data-testid="file-link"
                    href={publicSession.fileUrl(runId, key, f.id)}
                    download={f.filename}
                    className="flex items-center justify-between gap-3 rounded-xl bg-signal text-ink font-semibold px-4 py-3 hover:bg-signal-glow transition-colors"
                  >
                    <span className="truncate">Download {f.filename}</span>
                    <span className="text-xs font-mono opacity-70 shrink-0">{formatBytes(f.sizeBytes)}</span>
                  </a>
                ))}
              </div>
            ) : (
              !summary.result && (
                <p className="mt-4 text-sm text-text-muted">
                  Nothing was downloaded during this run.
                </p>
              )
            )}
          </div>
        )}

        {finished && summary.outcome === "failed" && (
          <div
            data-testid="outcome-failed"
            className="rounded-2xl border border-danger/40 bg-danger/10 px-5 py-6 sm:px-7"
          >
            <div className="font-display text-xl font-semibold text-danger">{summary.headline}</div>
            <div className="text-sm text-text-muted mt-0.5">{summary.detail}</div>
            {summary.failure && (
              <div className="mt-4 rounded-xl bg-ink-panel/70 border border-ink-line px-4 py-3">
                <div className="text-[11px] font-mono uppercase tracking-wide text-text-dim">
                  It stopped at: {summary.failure.stepLabel}
                </div>
                <p className="text-text-primary mt-1.5">{summary.failure.reason}</p>
                <p className="text-sm text-text-muted mt-1">{summary.failure.suggestion}</p>
              </div>
            )}
          </div>
        )}

        {finished && summary.outcome === "cancelled" && (
          <div
            data-testid="outcome-cancelled"
            className="rounded-2xl border border-ink-line bg-ink-panel px-5 py-6"
          >
            <div className="font-display text-xl font-semibold text-text-primary">{summary.headline}</div>
            <div className="text-sm text-text-muted mt-0.5">{summary.detail}</div>
          </div>
        )}

        <section className="rounded-2xl border border-ink-line bg-ink-panel px-5 py-5">
          <h2 className="text-[11px] font-mono uppercase tracking-wider text-text-dim mb-3">
            What&apos;s happening
          </h2>
          <StepTimeline steps={summary.steps} />
        </section>
      </div>

      <footer className="mt-8 text-center text-[11px] font-mono text-text-dim">
        {finished ? "This run has ended." : "This page updates by itself."}
        {problem === "offline" && <span className="text-warn"> · reconnecting…</span>}
        <div className="mt-2">
          A service of {BRAND_NAME}
          {PRIVACY_URL && (
            <>
              {" · "}
              <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-text-muted">
                Privacy policy
              </a>
            </>
          )}
        </div>
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen px-4 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-xl">{children}</div>
    </div>
  );
}

function StatusPill({ status, waiting }: { status: RunStatus; waiting: boolean }) {
  const map: Record<RunStatus, { label: string; cls: string }> = {
    [RunStatus.QUEUED]: { label: "Starting", cls: "text-text-muted border-ink-line" },
    [RunStatus.RUNNING]: { label: "In progress", cls: "text-signal border-signal/40" },
    [RunStatus.PAUSED]: { label: waiting ? "Waiting for you" : "Waiting", cls: "text-warn border-warn/40" },
    [RunStatus.SUCCESS]: { label: "Done", cls: "text-ok border-ok/40" },
    [RunStatus.FAILED]: { label: "Didn't finish", cls: "text-danger border-danger/40" },
    [RunStatus.CANCELLED]: { label: "Cancelled", cls: "text-text-muted border-ink-line" },
  };
  const s = map[status];
  return (
    <span
      data-testid="status-pill"
      className={`text-[11px] font-mono uppercase tracking-wide border rounded-full px-2.5 py-1 ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

function InvalidLink() {
  return (
    <Shell>
      <div data-testid="invalid-link" className="pt-20 text-center">
        <div className="mx-auto w-12 h-12 rounded-full border border-ink-line bg-ink-panel flex items-center justify-center text-text-dim text-xl">
          ?
        </div>
        <h1 className="font-display text-xl font-semibold text-text-primary mt-4">
          This link isn&apos;t valid
        </h1>
        <p className="text-sm text-text-muted mt-2 max-w-sm mx-auto">
          It may have been copied incompletely, or the run no longer exists. Ask whoever sent it
          for a fresh link.
        </p>
      </div>
    </Shell>
  );
}
