"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { publicStart, PublicStartView } from "@/lib/public-api";
import { ApiError } from "@/lib/api";
import { BRAND_NAME } from "@/lib/brand";

const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE || "07965802414";

// The page behind the WhatsApp "Start Application" button. The customer paid; nothing runs until they tap Start
// here, because the official website will ask them for a CAPTCHA and an OTP and they have to be present.
// No login: the token in the URL is the credential.
export default function StartPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const router = useRouter();
  const [view, setView] = useState<PublicStartView | null>(null);
  const [problem, setProblem] = useState<"invalid" | "offline" | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await publicStart.view(token));
      setProblem(null);
    } catch (e) {
      setProblem(e instanceof ApiError && e.status === 404 ? "invalid" : "offline");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const openSession = useCallback(
    (runId: string, sessionKey: string) =>
      router.push(`/session/${encodeURIComponent(runId)}/${encodeURIComponent(sessionKey)}`),
    [router],
  );

  async function start() {
    setStarting(true);
    setError(null);
    try {
      let answer = await publicStart.start(token);
      // Another tap (or another phone) claimed it a moment ago: wait for the run to appear.
      for (let i = 0; i < 10 && !(answer.runId && answer.sessionKey); i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const v = await publicStart.view(token);
        if (v.runId && v.sessionKey) answer = { runId: v.runId, sessionKey: v.sessionKey };
      }
      if (answer.runId && answer.sessionKey) {
        openSession(answer.runId, answer.sessionKey);
        return;
      }
      setError("We are still getting things ready. Please try again in a moment.");
    } catch (e) {
      if (e instanceof ApiError && (e.status === 410 || e.status === 409)) {
        await load(); // expired or all tries used: the page now says so
      } else if (e instanceof ApiError && e.status === 429) {
        setError("Too many tries. Please wait a minute and try again.");
      } else if (e instanceof ApiError && e.status === 422) {
        setError(e.message);
      } else {
        setError("We could not start right now. Please try again in a minute.");
      }
    } finally {
      setStarting(false);
    }
  }

  if (problem === "invalid") {
    return (
      <Shell>
        <div data-testid="invalid-link" className="center">
          <h1>This link isn&apos;t valid</h1>
          <p className="sub">
            It may have been copied incompletely. Please use the button in your WhatsApp message again, or call us on{" "}
            <b>{SUPPORT_PHONE}</b>.
          </p>
        </div>
      </Shell>
    );
  }
  if (!view) {
    return (
      <Shell>
        <p className="center">{problem === "offline" ? "Can't reach the service. Retrying…" : "Loading…"}</p>
      </Shell>
    );
  }

  const name = view.customerName ? `, ${view.customerName}` : "";
  const service = view.serviceName || "your application";
  const hasRun = !!(view.runId && view.sessionKey);
  const pillClass =
    view.status === "completed" ? "done" : view.status === "ready" ? "turn" : view.status === "running" ? "run" : "bad";

  return (
    <Shell>
      <div className="top">
        <div className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jb-logo.webp" alt="" />
          {BRAND_NAME}
        </div>
        <span className={`pill ${pillClass}`}>{view.status === "ready" ? "READY TO START" : view.status.toUpperCase()}</span>
      </div>

      {view.status === "ready" && (
        <div data-testid="start-ready">
          <h1>Hi{name}</h1>
          <p className="sub">
            Your payment for <b>{service}</b> is received. Tap <b>Start</b> to continue. It takes about 3 minutes.
          </p>

          {view.lastFailure && (
            <div data-testid="last-failure" className="note hold">
              <b>The last try did not finish</b>
              <div>{view.lastFailure}</div>
            </div>
          )}

          <div className="banner">
            <span aria-hidden>⚠️</span>
            <div>
              <b>Keep your phone with you.</b>
              <br />
              The official website will send you an OTP and may show a code to type here. Start only when you are
              ready.
            </div>
          </div>

          <button data-testid="start-button" className="btn" disabled={starting || !view.canStart} onClick={start}>
            {starting ? "Starting…" : view.lastFailure ? "Try again" : "Start"}
          </button>
          {error && (
            <p data-testid="start-error" className="sub" style={{ color: "var(--bad)", marginTop: 12 }}>
              {error}
            </p>
          )}
          <p className="sub" style={{ marginTop: 16 }}>
            {view.attemptsLeft} {view.attemptsLeft === 1 ? "try" : "tries"} left · this link works until{" "}
            {new Date(view.expiresAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
      )}

      {(view.status === "running" || view.status === "completed") && (
        <div data-testid="start-inprogress">
          <h1>{view.status === "completed" ? "All done" : "Your application is in progress"}</h1>
          <p className="sub">
            {view.status === "completed"
              ? "Your request is complete. Open it to see the result and download your document."
              : "It has already been started. Open it to follow the progress and enter any code the website asks for."}
          </p>
          {hasRun ? (
            <button
              data-testid="open-session"
              className="btn"
              onClick={() => openSession(view.runId as string, view.sessionKey as string)}
            >
              Open my request
            </button>
          ) : (
            <p className="sub">Getting it ready… please refresh in a moment.</p>
          )}
        </div>
      )}

      {view.status === "failed" && (
        <div data-testid="start-failed" className="center">
          <h1>We could not finish this</h1>
          <p className="sub">
            All the tries for this request were used. Please call us on <b>{SUPPORT_PHONE}</b> and we will help you.
          </p>
        </div>
      )}

      {view.status === "expired" && (
        <div data-testid="start-expired" className="center">
          <h1>This link has expired</h1>
          <p className="sub">
            Please call us on <b>{SUPPORT_PHONE}</b> and we will send you a fresh link.
          </p>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="jbs">
      <div className="wrap">{children}</div>
    </div>
  );
}
