"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { PageHeader } from "@/components/PageHeader";
import { api, ApiError, API_BASE, getToken } from "@/lib/api";
import {
  RecordingStartResponse,
  RecordingStatusResponse,
  RecordingStopResponse,
  RecordingSessionStatus,
  RecordedEventType,
} from "@/lib/types";

function describeEvent(
  type: RecordedEventType,
  url?: string,
  selector?: string,
  text?: string,
  value?: string,
) {
  switch (type) {
    case RecordedEventType.NAVIGATE:
      return `Navigate → ${url}`;
    case RecordedEventType.CLICK:
      return `Click ${text ? `"${text}"` : selector || "element"}`;
    case RecordedEventType.TYPE:
      return `Type "${value}" into ${selector || "field"}`;
    default:
      return type;
  }
}

type Phase = "idle" | "recording" | "stopping" | "done";

export default function RecordWorkflowPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("idle");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<RecordingStartResponse | null>(null);
  const [status, setStatus] = useState<RecordingStatusResponse | null>(null);
  const [result, setResult] = useState<RecordingStopResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function startRecording() {
    if (name.trim().length < 3) {
      setError("Name needs to be at least 3 characters");
      return;
    }
    setError(null);
    try {
      const started = await api.post<RecordingStartResponse>(
        "/recordings/start",
        {
          name: name.trim(),
        },
      );
      setSession(started);
      setPhase("recording");

      pollRef.current = setInterval(async () => {
        try {
          const s = await api.get<RecordingStatusResponse>(
            `/recordings/${started.recordingId}`,
          );
          setStatus(s);
          if (s.status !== RecordingSessionStatus.ACTIVE && pollRef.current) {
            clearInterval(pollRef.current);
          }
        } catch {
          // transient poll failure — try again next tick
        }
      }, 2000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start recording");
    }
  }

  async function stopRecording() {
    if (!session) return;
    setPhase("stopping");
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      const stopped = await api.post<RecordingStopResponse>(
        `/recordings/${session.recordingId}/stop`,
      );
      setResult(stopped);
      setPhase("done");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not stop recording");
      setPhase("recording");
    }
  }

  async function cancelRecording() {
    if (!session) return;
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      await api.delete(`/recordings/${session.recordingId}`);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Could not cancel recording",
      );
    } finally {
      router.push("/workflows");
    }
  }

  function copyExtensionCode() {
    if (!session) return;
    const token = getToken();
    if (!token) {
      setError("No auth token found — try signing in again");
      return;
    }
    const code = btoa(
      JSON.stringify({
        recordingId: session.recordingId,
        apiBase: API_BASE,
        token,
      }),
    );
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (authLoading || !user) return null;

  return (
    <div>
      <PageHeader eyebrow="New workflow" title="Record from a browser" />

      <div className="p-8 max-w-xl">
        {error && (
          <p className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-md px-3 py-2 mb-4">
            {error}
          </p>
        )}

        {phase === "idle" && (
          <div className="bg-ink-panel border border-ink-line rounded-lg p-6">
            <label className="block text-xs font-mono uppercase tracking-wider text-text-muted mb-2">
              Workflow name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Apply PAN Card"
              className="w-full bg-ink-raised border border-ink-line rounded-md px-3 py-2 text-text-primary mb-4 outline-none focus:border-signal/50"
            />
            <button
              onClick={startRecording}
              className="rounded-md bg-signal text-ink font-semibold text-sm px-4 py-2 hover:bg-signal-glow transition-colors"
            >
              Start recording
            </button>
          </div>
        )}

        {(phase === "recording" || phase === "stopping") && session && (
          <div className="bg-ink-panel border border-ink-line rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-signal pulse-soft" />
              <span className="font-mono text-xs uppercase tracking-wide text-signal">
                Recording
              </span>
            </div>

            <p className="text-text-muted text-sm mb-3">
              Open the AutoFlow extension popup and paste in this session code
              to start capturing your actions on the site you want to automate:
            </p>

            <div className="flex items-center gap-2 mb-5">
              <button
                onClick={copyExtensionCode}
                className="btn-ghost shrink-0"
              >
                {copied ? "Copied" : "Copy session code"}
              </button>
              <span className="text-xs text-text-muted font-mono truncate">
                {session.recordingId}
              </span>
            </div>

            <div className="mb-6">
              <div className="text-xs font-mono uppercase tracking-wider text-text-muted mb-2">
                {status?.eventCount ?? 0} action
                {status?.eventCount === 1 ? "" : "s"} captured
              </div>
              {status && status.events.length > 0 ? (
                <ul className="max-h-56 overflow-y-auto border border-ink-line rounded-md divide-y divide-ink-line">
                  {status.events.map((e, i) => (
                    <li
                      key={i}
                      className="px-3 py-2 text-sm text-text-primary font-mono truncate"
                    >
                      {i + 1}.{" "}
                      {describeEvent(
                        e.type,
                        e.url,
                        e.selector,
                        e.text,
                        e.value,
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-muted italic">
                  Waiting for the extension to send the first action…
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={stopRecording}
                disabled={phase === "stopping"}
                className="rounded-md bg-signal text-ink font-semibold text-sm px-4 py-2 hover:bg-signal-glow transition-colors disabled:opacity-50"
              >
                {phase === "stopping"
                  ? "Generating workflow…"
                  : "Stop & generate workflow"}
              </button>
              <button
                onClick={cancelRecording}
                disabled={phase === "stopping"}
                className="btn-ghost disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {phase === "done" && result && (
          <div className="bg-ink-panel border border-ink-line rounded-lg p-6">
            <p className="font-display text-text-primary mb-1">
              Workflow generated
            </p>
            <p className="text-text-muted text-sm mb-5">
              {result.stepsCreated} step{result.stepsCreated === 1 ? "" : "s"}{" "}
              created from what was captured. Review selectors and fallback
              intents before running it — recorded steps use default timeouts
              and retry settings.
            </p>
            <button
              onClick={() => router.push(`/workflows/${result.workflowId}`)}
              className="rounded-md bg-signal text-ink font-semibold text-sm px-4 py-2 hover:bg-signal-glow transition-colors"
            >
              Review workflow
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
