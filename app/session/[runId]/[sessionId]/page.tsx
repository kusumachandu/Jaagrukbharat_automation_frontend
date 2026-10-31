"use client";

import { useCallback, useEffect, useState } from "react";
import { publicSession } from "@/lib/public-api";
import { ApiError } from "@/lib/api";
import { PublicPhase, PublicSessionView, RunStatus } from "@/lib/types";
import { PromptCard } from "@/components/session/PromptCard";
import { formatBytes, formatDuration } from "@/components/SummaryParts";
import { BRAND_NAME, PRIVACY_URL } from "@/lib/brand";
import { ResultTables } from "@/components/ResultTables";

const ACTIVE = new Set<RunStatus>([RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.PAUSED]);

// The page a person opens from a private link to follow their request, answer
// the OTP/CAPTCHA the official website asks for, and pick up the result. No
// login: the key in the URL is the credential (`sessionId` is that key). The
// run drives everything on it — the page only ever asks for a value when the
// website itself is waiting for one — and it never shows technical detail.
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
  const [now, setNow] = useState(() => Date.now());

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
    const poll = setInterval(load, 2000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [active, load]);

  // Keeping the person here while the website is slow (the final OTP can take 5–10 minutes):
  // a warning before the tab is closed, the tab title and a short beep when it's their turn,
  // and the phone screen kept awake. All best-effort — each is a browser nicety, none is required.
  const inProgress = !!view && ACTIVE.has(view.status);
  const needsYou = inProgress && !!view?.awaiting?.canAnswer;

  useEffect(() => {
    if (!inProgress) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [inProgress]);

  useEffect(() => {
    if (!inProgress) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const grab = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (wl && document.visibilityState === "visible" && !cancelled) lock = await wl.request("screen");
      } catch {
        /* not supported or refused — fine */
      }
    };
    void grab();
    document.addEventListener("visibilitychange", grab);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", grab);
      void lock?.release().catch(() => {});
    };
  }, [inProgress]);

  useEffect(() => {
    if (!needsYou) return;
    const original = document.title;
    let on = false;
    const flash = setInterval(() => {
      on = !on;
      document.title = on ? "🔔 Enter your code now" : original;
    }, 1000);
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        osc.frequency.value = 880;
        osc.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch {
      /* the browser may block sound until the page has been touched — fine */
    }
    return () => {
      clearInterval(flash);
      document.title = original;
    };
  }, [needsYou]);

  if (problem === "invalid") return <InvalidLink />;
  if (!view) {
    return (
      <Shell>
        <p className="center">
          {problem === "offline" ? "Can't reach the service — retrying…" : "Loading…"}
        </p>
      </Shell>
    );
  }

  const { summary, awaiting, codes, typicalDurationMs: typical } = view;
  const finished = !ACTIVE.has(view.status);
  const yourTurn = !finished && !!awaiting?.canAnswer;
  const onHold = !finished && !!awaiting && !awaiting.canAnswer;
  const queued = view.status === RunStatus.QUEUED;

  const startedMs = view.startedAt ? Date.parse(view.startedAt) : null;
  const endMs = view.finishedAt ? Date.parse(view.finishedAt) : now;
  const elapsedMs = startedMs ? Math.max(0, endMs - startedMs) : null;

  const pct = summary.stepsTotal > 0 ? Math.round((summary.stepsDone / summary.stepsTotal) * 100) : 0;
  const stepNow = Math.min(summary.stepsDone + 1, summary.stepsTotal);
  const codesTotal = codes ? codes.captcha + codes.otp + codes.other : 0;
  // The steps ran to the end but the application itself is not confirmed (e.g. no registration number came back):
  // the page must not celebrate.
  const notConfirmed = finished && summary.outcome === "success" && summary.application?.status === "failed";
  const pill = notConfirmed ? { cls: "bad", label: "⚠ NOT CONFIRMED" } : pillFor(view.status, yourTurn, onHold);

  return (
    <Shell>
      <div className="top">
        <div className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jb-logo.webp" alt="" />
          {BRAND_NAME}
        </div>
        <span data-testid="status-pill" className={`pill ${pill.cls}`}>
          {pill.label}
        </span>
      </div>

      <h1 data-testid="window-title">{view.workflowName}</h1>
      <p className="sub" data-testid="window-sub">
        {notConfirmed ? "We finished the steps, but your application is not confirmed — details below." : subFor(view.status, yourTurn, onHold)}
      </p>

      <div aria-live="polite">
        {!finished && (
          <div className="banner" data-testid="keep-open">
            <span aria-hidden>⚠️</span>
            <div>
              <b>Please keep this window open.</b>
              <br />
              If the website asks for a code, it appears here. If nobody enters it in time, the
              request stops.
            </div>
          </div>
        )}

        {!finished && !yourTurn && view.note && (
          <div data-testid="stage-note" className="note hold">
            <b>📌 Good to know</b>
            <div>{view.note}</div>
          </div>
        )}

        {yourTurn && awaiting && (
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

        {onHold && awaiting && (
          <div data-testid="operator-note" className="note hold">
            <b>Hang tight</b>
            <div>{awaiting.prompt}</div>
          </div>
        )}

        {!finished && !yourTurn && answeredAt !== null && (
          <div data-testid="prompt-sent" className="note ok">
            <b>Thanks — got it</b>
            <div>Continuing now. You can keep this page open.</div>
          </div>
        )}

        {!finished && (
          <div className="card" data-testid="progress">
            <div className="row">
              <span>{summary.stepsTotal > 0 ? `Step ${stepNow} of ${summary.stepsTotal}` : "Getting started"}</span>
              <span>{pct}%</span>
            </div>
            <div className={`bar${yourTurn ? " turn" : ""}`} aria-label="Progress">
              <span style={{ width: `${pct}%` }} />
            </div>
            <div className="big" data-testid="eta">
              {etaFor({ queued, yourTurn, onHold, elapsedMs, typical })}
            </div>
            <div className="row" style={{ marginTop: 2 }}>
              <span>{elapsedMs !== null ? `Running for ${clock(elapsedMs)}` : "Starting…"}</span>
              {typical && <span>Usually takes {range(typical)}</span>}
            </div>
          </div>
        )}

        {!finished && codes && (
          <div className="stats" data-testid="stats">
            <div className="stat">
              <small>Time needed</small>
              <b>{typical ? range(typical) : "—"}</b>
              <em>{typical ? "Usually" : "No estimate yet"}</em>
            </div>
            <div className="stat">
              <small>Codes needed</small>
              {/* One kind of code fits the tile ("1 CAPTCHA"); a mix shows the total, broken down below. */}
              <b>{!codesTotal ? "None" : codesKinds(codes) > 1 ? `${codesTotal} codes` : codesLabel(codes)}</b>
              <em>
                {!codesTotal ? "Fully automatic"
                  : codesKinds(codes) > 1 ? codesLabel(codes)
                  : codesTotal === 1 ? "You type it" : "You type them"}
              </em>
            </div>
            <div className="stat">
              <small>Your part</small>
              <b>{codesTotal ? `${Math.min(codes.answered, codesTotal)} of ${codesTotal}` : "Nothing"}</b>
              <em>{codesTotal ? "done" : "Just wait"}</em>
            </div>
          </div>
        )}

        {/* The application's own outcome, apart from whether the automation ran: for a registration it is a success
            only once the registration number is in hand. */}
        {finished && summary.application && summary.application.status !== "cancelled" && (
          <div
            data-testid="application-status"
            data-status={summary.application.status}
            className={`note ${summary.application.status === "success" ? "ok" : "hold"}`}
            style={{ marginBottom: 12 }}
          >
            <b>
              Application: {summary.application.status === "success" ? "Successful" : "Not completed"}
            </b>
            {summary.application.status === "success" && summary.application.reference && (
              <div>
                {summary.application.referenceLabel ?? "Reference"}: <b>{summary.application.reference}</b>
              </div>
            )}
            {summary.application.status === "failed" && summary.application.reason && (
              <div>{summary.application.reason}</div>
            )}
          </div>
        )}

        {finished && summary.outcome === "success" && (
          <div
            data-testid="outcome-success"
            data-result-tone={summary.result?.tone}
            className={`card hero ${toneClass(notConfirmed ? "negative" : summary.result?.tone)}`}
          >
            <h2 data-testid={summary.result ? "run-result" : undefined} data-tone={notConfirmed ? "negative" : summary.result?.tone}>
              {toneGlyph(notConfirmed ? "negative" : summary.result?.tone)} {notConfirmed ? "Application not confirmed" : summary.headline}
            </h2>
            <p className="sub">
              {notConfirmed
                ? "Please check on the official website whether it went through before trying again."
                : "All done. You can safely close this window."}
            </p>

            {summary.highlights.length > 0 && (
              <table data-testid="result-details">
                <tbody>
                  {summary.highlights.map((h, i) => (
                    <tr key={i}>
                      <td>{h.label}</td>
                      <td>{h.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <ResultTables tables={summary.tables ?? []} variant="cards" />

            {summary.files.map((f) => (
              <a
                key={f.id}
                data-testid="file-link"
                className="file"
                href={publicSession.fileUrl(runId, key, f.id)}
                download={f.filename}
              >
                <span>Download {f.filename}</span>
                <span>{formatBytes(f.sizeBytes)}</span>
              </a>
            ))}

            <div className="row" style={{ marginTop: 12 }}>
              <span>{elapsedMs !== null ? `Completed in ${formatDuration(elapsedMs)}` : ""}</span>
              {summary.handledByPeople.valuesEntered > 0 && (
                <span>
                  {summary.handledByPeople.valuesEntered}{" "}
                  {summary.handledByPeople.valuesEntered === 1 ? "code" : "codes"} entered by you
                </span>
              )}
            </div>
          </div>
        )}

        {finished && summary.outcome === "failed" && (
          <div data-testid="outcome-failed" className="card hero bad">
            <h2>✕ {summary.headline}</h2>
            <p className="sub">{summary.detail}</p>
            {summary.failure && (
              <div className="why">
                <small>It stopped at: {summary.failure.stepLabel}</small>
                <p>{summary.failure.reason}</p>
                <small>{summary.failure.suggestion}</small>
                {summary.failure.websiteSaid && summary.failure.websiteSaid.length > 0 && (
                  <div data-testid="website-said" className="note hold" style={{ marginTop: 10 }}>
                    <b>What the website said</b>
                    {summary.failure.websiteSaid.map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {finished && summary.outcome === "cancelled" && (
          <div data-testid="outcome-cancelled" className="card hero neu">
            <h2>{summary.headline}</h2>
            <p className="sub">{summary.detail}</p>
          </div>
        )}

        <div className="card">
          <h3>What&apos;s happening</h3>
          <div data-testid="phases">
            {(view.phases?.length ? view.phases : phasesFromSteps(view)).map((p, i) => (
              <PhaseRow key={p.key + i} phase={p} index={i} />
            ))}
          </div>
        </div>

        <div className="card" data-testid="about-page">
          <h3>Your safety</h3>
          <div className="trust">
            <div>
              {BRAND_NAME} works on the official website on your behalf.
            </div>
            <div>This is not a government website.</div>
            <div>Only enter a code for a request you asked {BRAND_NAME} to do.</div>
            <div>Don&apos;t share this link with anyone.</div>
          </div>
        </div>
      </div>

      <footer>
        {finished ? "This request has ended." : "This page updates by itself."}
        {problem === "offline" && <span> · reconnecting…</span>}
        <div style={{ marginTop: 6 }}>
          A service of {BRAND_NAME}
          {PRIVACY_URL && (
            <>
              {" · "}
              <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
                Privacy policy
              </a>
            </>
          )}
        </div>
      </footer>
    </Shell>
  );
}

function PhaseRow({ phase, index }: { phase: PublicPhase; index: number }) {
  const icon =
    phase.state === "done" ? "✓"
    : phase.state === "active" ? "●"
    : phase.state === "waiting" ? "!"
    : phase.state === "failed" ? "✕"
    : index + 1;
  const steps =
    phase.stepFrom === phase.stepTo ? `step ${phase.stepFrom}` : `steps ${phase.stepFrom}–${phase.stepTo}`;
  return (
    <div className={`ph ${phase.state}`} data-phase={phase.key} data-state={phase.state}>
      <div className="dot">{icon}</div>
      <div>
        <b>
          {phase.title}
          {phase.state === "waiting" && <span className="tag">YOU</span>}
        </b>
        <span>
          {phase.state === "waiting" ? "Waiting for you" : phase.detail} · {steps}
        </span>
      </div>
    </div>
  );
}

// An older backend sends no phases — show each step as its own row instead.
function phasesFromSteps(view: PublicSessionView): PublicPhase[] {
  const steps = view.summary.steps.filter((s) => s.state !== "disconnected");
  return steps.map((s, i) => ({
    key: "details",
    title: s.label,
    detail: s.note ?? "",
    state:
      s.state === "done" || s.state === "skipped" ? "done"
      : s.state === "failed" ? "failed"
      : s.state === "current" ? (view.awaiting?.canAnswer ? "waiting" : "active")
      : "pending",
    stepFrom: i + 1,
    stepTo: i + 1,
  }));
}

function pillFor(status: RunStatus, yourTurn: boolean, onHold: boolean) {
  if (yourTurn) return { cls: "turn", label: "● YOUR TURN" };
  if (onHold) return { cls: "turn", label: "● ON HOLD" };
  switch (status) {
    case RunStatus.QUEUED: return { cls: "start", label: "● STARTING" };
    case RunStatus.SUCCESS: return { cls: "done", label: "✓ DONE" };
    case RunStatus.FAILED: return { cls: "bad", label: "✕ STOPPED" };
    case RunStatus.CANCELLED: return { cls: "start", label: "CANCELLED" };
    default: return { cls: "run", label: "● WORKING" };
  }
}

function subFor(status: RunStatus, yourTurn: boolean, onHold: boolean) {
  if (yourTurn) return "We've paused and are waiting for you. Nothing happens until you enter the code below.";
  if (onHold) return "We hit a small snag and our team is looking at it.";
  switch (status) {
    case RunStatus.QUEUED: return "Getting ready to start on the official website.";
    case RunStatus.SUCCESS: return "Your request is complete.";
    case RunStatus.FAILED: return "We couldn't finish this request.";
    case RunStatus.CANCELLED: return "This request was cancelled.";
    default:
      return "We're working on this on the official website for you.";
  }
}

function etaFor(o: {
  queued: boolean;
  yourTurn: boolean;
  onHold: boolean;
  elapsedMs: number | null;
  typical?: { medianMs: number } | null;
}): string {
  if (o.queued) return "Starting soon";
  if (o.yourTurn) return "Waiting for your code";
  if (o.onHold) return "On hold for a moment";
  if (!o.typical || o.elapsedMs === null) return "Working on it…";
  const left = o.typical.medianMs - o.elapsedMs;
  if (left > 90_000) return `About ${Math.ceil(left / 60_000)} minutes left`;
  if (left > 30_000) return "About 1 minute left";
  if (left > 0) return "Less than a minute left";
  return "Taking a little longer than usual";
}

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function range(t: { lowMs: number; highMs: number }): string {
  const lo = Math.max(1, Math.round(t.lowMs / 60_000));
  const hi = Math.max(1, Math.round(t.highMs / 60_000));
  if (t.highMs < 60_000) return "under 1 min";
  return lo === hi ? `~${lo} min` : `~${lo}–${hi} min`;
}

function codesLabel(c: { captcha: number; otp: number; other: number }): string {
  const parts: string[] = [];
  if (c.captcha) parts.push(`${c.captcha} CAPTCHA`);
  if (c.otp) parts.push(`${c.otp} OTP`);
  if (c.other) parts.push(`${c.other} detail${c.other === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function codesKinds(c: { captcha: number; otp: number; other: number }): number {
  return [c.captcha, c.otp, c.other].filter(Boolean).length;
}

function toneClass(tone?: "positive" | "negative" | "neutral") {
  return tone === "negative" ? "neg" : tone === "neutral" ? "neu" : "";
}

function toneGlyph(tone?: "positive" | "negative" | "neutral") {
  return tone === "negative" ? "!" : tone === "neutral" ? "•" : "✓";
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="jbs">
      <div className="wrap">{children}</div>
    </div>
  );
}

function InvalidLink() {
  return (
    <Shell>
      <div data-testid="invalid-link" className="center">
        <h1>This link isn&apos;t valid</h1>
        <p className="sub">
          It may have been copied incompletely, or the request no longer exists. Ask whoever sent it
          for a fresh link.
        </p>
      </div>
    </Shell>
  );
}
