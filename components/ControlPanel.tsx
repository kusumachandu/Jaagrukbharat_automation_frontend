"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Intervention, InterventionType, RunStatus, Step, STEP_TYPE_LABEL } from "@/lib/types";

export interface ControlState {
  controlled: boolean; // this person holds the browser now
  controlledByOther?: boolean;
  requested: boolean; // asked for while running; waiting for the next step boundary
  viewport: { width: number; height: number } | null;
  // Steps the server has seen this person do by hand since they took control.
  touched?: number[];
}

interface ControlPanelProps {
  status: RunStatus;
  control: ControlState;
  intervention: Intervention | null;
  steps: Step[];
  onTake: () => Promise<void>;
  onRelease: () => Promise<void>;
  // "auto" = carry on after the last step the person was seen doing; or a step order.
  onResume: (from: number | "auto") => Promise<void>;
  onGoto: (url: string) => Promise<void>;
}

const AUTO = "auto";

// The two options: take the browser yourself, and hand it back so the automation carries on. By
// default it carries on right after the last step you did (it watches what you click and type into),
// or you can pick any step.
export function ControlPanel({ status, control, intervention, steps, onTake, onRelease, onResume, onGoto }: ControlPanelProps) {
  const [busy, setBusy] = useState<"take" | "release" | "resume" | "goto" | null>(null);
  const [from, setFrom] = useState<string>(AUTO);
  const [url, setUrl] = useState("");
  const ordered = useMemo(
    () => [...steps].filter((s) => s.enabled !== false).sort((a, b) => a.order - b.order),
    [steps]
  );
  const endOrder = ordered.length ? ordered[ordered.length - 1].order + 1 : 0;
  const waitingOrder = intervention?.stepOrder;
  // A new pause starts again from "automatic".
  useEffect(() => setFrom(AUTO), [intervention?._id]);

  async function run(kind: "take" | "release" | "resume" | "goto", fn: () => Promise<void>) {
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  const label = (s: Step) => `${s.order} · ${s.fallbackIntent || STEP_TYPE_LABEL[s.type]}`.slice(0, 70);
  const paused = status === RunStatus.PAUSED;
  const running = status === RunStatus.RUNNING;
  if (!paused && !running) return null;

  const touched = control.touched ?? [];
  const lastDone = touched.length ? Math.max(...touched) : null;
  const nextAuto = lastDone !== null ? lastDone + 1 : waitingOrder;
  const nextStep = ordered.find((s) => s.order === nextAuto);

  // ── the browser is in your hands ──
  if (control.controlled) {
    return (
      <div className="border border-signal/40 bg-signal/10 rounded-lg p-4" data-testid="control-panel-active">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-signal pulse-soft" />
          <span className="font-mono text-xs uppercase tracking-wider text-signal">You have the browser</span>
        </div>
        <p className="text-text-primary text-sm mb-3">
          Click and type in the live view to do what is needed. When you are done, hand it back and the automation
          carries on.
        </p>

        <form
          className="flex gap-2 mb-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (url.trim()) run("goto", () => onGoto(url.trim()));
          }}
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Open an address, e.g. https://abha.abdm.gov.in/abha/v3"
            className="input flex-1 text-xs font-mono"
            data-testid="goto-url"
          />
          <button type="submit" disabled={busy !== null || !url.trim()} className="btn-ghost text-xs disabled:opacity-40">
            {busy === "goto" ? "Opening…" : "Go"}
          </button>
        </form>

        <label className="block text-[11px] text-text-dim mb-1">Continue the automation from</label>
        <select
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="input w-full text-xs mb-1"
          data-testid="resume-from"
        >
          <option value={AUTO}>Automatic — right after the last step I did</option>
          {ordered.map((s) => (
            <option key={s.order} value={String(s.order)}>
              {label(s)}
              {s.order === waitingOrder ? "  (waiting here)" : ""}
            </option>
          ))}
          <option value={String(endOrder)}>End of the workflow (finish the run)</option>
        </select>
        {from === AUTO && (
          <p className="text-[11px] text-text-dim mb-3" data-testid="auto-hint">
            {lastDone !== null
              ? `Seen so far: step${touched.length > 1 ? "s" : ""} ${touched.join(", ")}. It will carry on from ${
                  nextStep ? label(nextStep) : "the end of the workflow"
                }.`
              : `No step recognised yet — if you do not do any, it will try step ${waitingOrder ?? ""} again.`}
          </p>
        )}
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => run("resume", () => onResume(from === AUTO ? AUTO : Number(from)))}
            disabled={busy !== null}
            data-testid="resume-automation"
            className="rounded-md bg-signal text-ink font-semibold text-sm px-4 py-1.5 disabled:opacity-40"
          >
            {busy === "resume" ? "Resuming…" : "Resume automation"}
          </button>
          {intervention?.type !== InterventionType.HUMAN_CONTROL && (
            <button
              onClick={() => run("release", onRelease)}
              disabled={busy !== null}
              className="btn-ghost text-xs disabled:opacity-40"
              title="Stop controlling, keep the run paused"
            >
              {busy === "release" ? "…" : "Release control"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── asked for, waiting for the next step ──
  if (control.requested && running) {
    return (
      <div className="border border-ink-line bg-ink-raised rounded-lg p-4 flex items-center justify-between gap-3">
        <span className="text-sm text-text-muted">Pausing after the current step so you can take over…</span>
        <button onClick={() => run("release", onRelease)} disabled={busy !== null} className="btn-ghost text-xs disabled:opacity-40">
          Cancel
        </button>
      </div>
    );
  }

  if (control.controlledByOther) {
    return (
      <div className="border border-ink-line bg-ink-raised rounded-lg p-4 text-sm text-text-muted">
        Someone else is controlling this browser.
      </div>
    );
  }

  // ── not in control yet ──
  return (
    <div className="border border-ink-line bg-ink-raised rounded-lg p-4 flex items-center justify-between gap-3">
      <div>
        <div className="text-sm text-text-primary">{paused ? "Take over the browser yourself" : "Take control of the browser"}</div>
        <div className="text-[11px] text-text-dim">
          {paused ? "You get it right away; the automation waits." : "The run pauses after the current step, then it is yours."}
        </div>
      </div>
      <button
        onClick={() => run("take", onTake)}
        disabled={busy !== null}
        data-testid="take-control"
        className="rounded-md bg-signal text-ink font-semibold text-sm px-4 py-1.5 whitespace-nowrap disabled:opacity-40"
      >
        {busy === "take" ? "Taking…" : "Take control"}
      </button>
    </div>
  );
}
