"use client";

import { useState } from "react";
import {
  Step,
  StepType,
  StepOnFail,
  STEP_TYPE_LABEL,
  WorkflowInput,
  Decision,
  ResultTone,
} from "@/lib/types";

interface StepEditorDrawerProps {
  step: Step;
  index: number;
  onChange: (step: Step) => void;
  onClose: () => void;
  onDelete: () => void;
  workflowInputs?: WorkflowInput[];
  // Declares a new workflow variable and points this step's value at it.
  onCreateVariable: (key: string, label: string, sensitive: boolean) => void;
  // Reposition / disconnect this step (the canvas offers drag-and-drop too).
  stepCount: number;
  onMove: (delta: -1 | 1) => void;
  onToggleEnabled: () => void;
  // Edits here only update the builder's in-memory copy; these let the
  // drawer persist them without hunting for the header Save button.
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
  justSaved: boolean;
  isNewWorkflow: boolean;
  saveError: string | null;
}

const VALUE_HELP: Partial<Record<StepType, string>> = {
  [StepType.NAVIGATE]: "Destination URL to open",
  [StepType.TYPE]: "Text to type into the field",
};

// What a fresh "Result rule" starts with; every field is editable.
function defaultDecision(): Decision {
  return {
    text: "",
    isRegex: false,
    scope: "",
    settleMs: 2500,
    ifFound: { label: "", tone: "positive" },
    ifNotFound: { label: "", tone: "negative" },
  };
}

const TONES: ResultTone[] = ["positive", "negative", "neutral"];

export function StepEditorDrawer({
  step,
  index,
  onChange,
  onClose,
  onDelete,
  workflowInputs = [],
  onCreateVariable,
  stepCount,
  onMove,
  onToggleEnabled,
  onSave,
  saving,
  dirty,
  justSaved,
  isNewWorkflow,
  saveError,
}: StepEditorDrawerProps) {
  function set<K extends keyof Step>(key: K, value: Step[K]) {
    onChange({ ...step, [key]: value });
  }

  // Switching to/from a result rule adds/drops its settings, so a step never
  // carries a rule it doesn't use.
  function changeType(type: StepType) {
    const next: Step = { ...step, type };
    if (type === StepType.DECIDE) {
      next.decision = step.decision ?? defaultDecision();
    } else {
      delete next.decision;
    }
    onChange(next);
  }

  const needsSelector =
    step.type !== StepType.NAVIGATE && step.type !== StepType.DECIDE;
  const needsValue =
    step.type === StepType.NAVIGATE || step.type === StepType.TYPE;

  return (
    <div className="w-96 shrink-0 border-l border-ink-line bg-ink-panel flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-ink-line">
        <div>
          <div className="font-mono text-[10px] text-text-dim uppercase tracking-wider">
            Step #{index}
          </div>
          <div className="font-display font-medium text-text-primary">
            Edit step
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-text-dim hover:text-text-primary text-lg leading-none"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-ink-line">
        <button
          type="button"
          data-testid="move-earlier"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          className="btn-ghost text-xs disabled:opacity-30"
          title="Run this step earlier"
        >
          ← Earlier
        </button>
        <button
          type="button"
          data-testid="move-later"
          onClick={() => onMove(1)}
          disabled={index >= stepCount - 1}
          className="btn-ghost text-xs disabled:opacity-30"
          title="Run this step later"
        >
          Later →
        </button>
        <button
          type="button"
          data-testid="toggle-enabled"
          onClick={onToggleEnabled}
          className={`btn-ghost text-xs ml-auto ${
            step.enabled === false ? "text-signal border-signal/40" : ""
          }`}
          title={
            step.enabled === false
              ? "Put this step back into the flow"
              : "Skip this step when the workflow runs (keeps it on the canvas)"
          }
        >
          {step.enabled === false ? "Connect" : "Disconnect"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
        <Field label="Type">
          <select
            className="input"
            value={step.type}
            onChange={(e) => changeType(e.target.value as StepType)}
          >
            {Object.values(StepType).map((t) => (
              <option key={t} value={t}>
                {STEP_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>

        {needsSelector ? (
          <Field label="CSS selector" hint="Tried first on replay">
            <input
              className="input font-mono"
              value={step.selector ?? ""}
              onChange={(e) => set("selector", e.target.value)}
              placeholder="#submit-button"
            />
          </Field>
        ) : step.type === StepType.DECIDE ? null : (
          <p className="text-[11px] text-text-dim bg-ink-raised border border-ink-line rounded-md px-3 py-2">
            Navigate steps don't use a selector — the destination URL below is
            all this step needs.
          </p>
        )}

        {step.type === StepType.DECIDE && step.decision && (
          <ResultRuleEditor
            decision={step.decision}
            onChange={(d) => set("decision", d)}
          />
        )}

        <Field
          label="What it's trying to do"
          hint="Used by the AI fallback if the selector breaks"
        >
          <textarea
            className="input min-h-[64px] resize-none"
            value={step.fallbackIntent}
            onChange={(e) => set("fallbackIntent", e.target.value)}
            placeholder="click the Verify button on the status form"
          />
        </Field>

        {needsValue && (
          <Field label="Value" hint={VALUE_HELP[step.type]}>
            <input
              className="input"
              value={step.value ?? ""}
              onChange={(e) => set("value", e.target.value)}
            />
            {workflowInputs.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {workflowInputs
                  .filter((i) => i.key.trim())
                  .map((i) => (
                    <button
                      key={i.key}
                      type="button"
                      onClick={() =>
                        set("value", `${step.value ?? ""}{{${i.key}}}`)
                      }
                      className="rounded-md border border-ink-line bg-ink-raised px-1.5 py-0.5 text-[11px] font-mono text-text-muted hover:text-signal hover:border-signal/40"
                      title={i.label || i.key}
                    >
                      {`{{${i.key}}}`}
                    </button>
                  ))}
                <p className="basis-full text-[11px] text-text-dim leading-snug">
                  Need only part of a variable? {"{{key[0:4]}}"} inserts just its
                  first 4 characters, {"{{key[4:8]}}"} the next 4 — so one value
                  can fill several boxes.
                </p>
              </div>
            )}
          </Field>
        )}

        {needsValue && (
          <div className="flex flex-col gap-2 -mt-2">
            <MakeVariable
              suggestedLabel={step.fallbackIntent}
              onCreate={onCreateVariable}
            />
            {step.type === StepType.TYPE && (
              <button
                type="button"
                onClick={() =>
                  onChange({ ...step, type: StepType.AWAIT_INPUT, value: undefined })
                }
                className="text-left text-[11px] text-text-muted hover:text-signal underline decoration-dotted underline-offset-2"
                title="For one-time values like an OTP or CAPTCHA: the run pauses and you type just the value"
              >
                Or: ask the operator for this value during the run (OTP, CAPTCHA…)
              </button>
            )}
          </div>
        )}

        {step.type === StepType.AWAIT_INPUT && (
          <>
            <Field
              label="Pause timeout"
              hint="How long to wait for an operator before this run gives up"
            >
              <input
                type="number"
                className="input"
                value={step.interventionTimeoutMs}
                onChange={(e) =>
                  set("interventionTimeoutMs", Number(e.target.value))
                }
              />
            </Field>
            {step.selectors && step.selectors.length > 1 && (
              <p className="text-[11px] text-text-dim bg-ink-raised border border-ink-line rounded-md px-3 py-2">
                This step expects a {step.selectors.length}-character value —
                the operator enters it once and it's split across{" "}
                {step.selectors.length} page elements (e.g. individual OTP
                digit boxes).
              </p>
            )}
            {step.selectors && step.selectors.length === 1 && (
              <p className="text-[11px] text-text-dim bg-ink-raised border border-ink-line rounded-md px-3 py-2">
                The operator enters one value and it's split one character per
                box across every element this selector matches.
              </p>
            )}
          </>
        )}

        <label
          className="flex items-start gap-2 text-xs text-text-muted cursor-pointer"
          title="Steps that only sign in to the website are skipped on runs that reuse a saved sign-in"
        >
          <input
            type="checkbox"
            data-testid="sign-in-only"
            className="mt-0.5"
            checked={step.signInOnly === true}
            onChange={(e) => {
              const next: Step = { ...step };
              if (e.target.checked) next.signInOnly = true;
              else delete next.signInOnly;
              onChange(next);
            }}
          />
          <span>
            Sign-in step
            <span className="block text-[11px] text-text-dim leading-snug">
              Skipped once the workflow has a saved sign-in (turn on “Keep
              signed in” in the toolbar).
            </span>
          </span>
        </label>

        <Field
          label="Branch (optional)"
          hint="Only runs while an earlier result rule has set this as the active branch — e.g. 'existing' or 'new'. Leave blank to always run."
        >
          <input
            className="input font-mono"
            data-testid="step-branch"
            value={step.branch ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              const next: Step = { ...step };
              if (v.trim()) next.branch = v;
              else delete next.branch;
              onChange(next);
            }}
            placeholder="e.g. existing, new"
          />
        </Field>

        <Field label="Step timeout (ms)">
          <input
            type="number"
            className="input"
            value={step.timeoutMs}
            onChange={(e) => set("timeoutMs", Number(e.target.value))}
          />
        </Field>

        <div className="border-t border-ink-line pt-4">
          <div className="text-xs font-mono uppercase tracking-wider text-text-dim mb-2">
            On failure
          </div>
          <div className="flex gap-2">
            {Object.values(StepOnFail).map((o) => (
              <button
                key={o}
                onClick={() =>
                  set("retryPolicy", { ...step.retryPolicy, onFail: o })
                }
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-mono uppercase transition-colors ${
                  step.retryPolicy.onFail === o
                    ? "border-signal/50 bg-signal/10 text-signal"
                    : "border-ink-line text-text-muted hover:text-text-primary"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
          {step.retryPolicy.onFail === StepOnFail.RETRY && (
            <div className="mt-3">
              <Field label="Retries" hint="Attempts beyond the first">
                <input
                  type="number"
                  min={0}
                  max={5}
                  className="input"
                  value={step.retryPolicy.retries}
                  onChange={(e) =>
                    set("retryPolicy", {
                      ...step.retryPolicy,
                      retries: Number(e.target.value),
                    })
                  }
                />
              </Field>
            </div>
          )}
          <p className="text-[11px] text-text-dim mt-2 leading-snug">
            {step.retryPolicy.onFail === StepOnFail.ABORT &&
              "One attempt. If it fails, the run stops immediately."}
            {step.retryPolicy.onFail === StepOnFail.SKIP &&
              "One attempt. If it fails, the run logs it and moves on."}
            {step.retryPolicy.onFail === StepOnFail.RETRY &&
              "Retries with backoff. If every attempt fails, the run stops — there is no fallback after retries run out."}
          </p>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-ink-line flex flex-col gap-2">
        {saveError && <p className="text-danger text-xs">{saveError}</p>}
        <button
          onClick={onSave}
          disabled={saving || (!dirty && !isNewWorkflow)}
          className="w-full rounded-md bg-signal text-ink font-semibold text-sm py-2 hover:bg-signal-glow transition-colors disabled:opacity-50"
        >
          {saving
            ? "Saving…"
            : dirty || isNewWorkflow
              ? "Save workflow"
              : justSaved
                ? "Saved ✓"
                : "All changes saved"}
        </button>
        <button
          onClick={onDelete}
          className="w-full rounded-md border border-danger/30 text-danger text-sm py-2 hover:bg-danger/10 transition-colors"
        >
          Delete this step
        </button>
      </div>
    </div>
  );
}

// "Look for this text on the page: found -> this result, otherwise -> that one."
function ResultRuleEditor({
  decision,
  onChange,
}: {
  decision: Decision;
  onChange: (d: Decision) => void;
}) {
  let regexError: string | null = null;
  if (decision.isRegex && decision.text) {
    try {
      new RegExp(decision.text);
    } catch {
      regexError = "That isn't a valid pattern.";
    }
  }

  function outcome(which: "ifFound" | "ifNotFound", title: string) {
    const o = decision[which];
    return (
      <div className="rounded-md border border-ink-line bg-ink-raised p-3 flex flex-col gap-2">
        <div className="text-[11px] font-mono uppercase tracking-wider text-text-dim">
          {title}
        </div>
        <input
          className="input"
          data-testid={`decision-${which}-label`}
          placeholder="Result shown to the person, e.g. Eligible — leave blank if this only sets a branch below"
          value={o.label ?? ""}
          onChange={(e) =>
            onChange({ ...decision, [which]: { ...o, label: e.target.value } })
          }
        />
        <div className="flex gap-1.5">
          {TONES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() =>
                onChange({ ...decision, [which]: { ...o, tone: t } })
              }
              className={`flex-1 rounded-md border px-2 py-1 text-[11px] font-mono uppercase transition-colors ${
                o.tone === t
                  ? t === "positive"
                    ? "border-ok/50 bg-ok/10 text-ok"
                    : t === "negative"
                      ? "border-danger/50 bg-danger/10 text-danger"
                      : "border-signal/50 bg-signal/10 text-signal"
                  : "border-ink-line text-text-muted hover:text-text-primary"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          className="input font-mono text-xs"
          data-testid={`decision-${which}-branch`}
          placeholder="Set branch (optional) — e.g. existing, new"
          value={o.setBranch ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            const next = { ...o };
            if (v.trim()) next.setBranch = v;
            else delete next.setBranch;
            onChange({ ...decision, [which]: next });
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="result-rule">
      <p className="text-[11px] text-text-dim bg-ink-raised border border-ink-line rounded-md px-3 py-2 leading-snug">
        Reads the page and ends the run with a result. A “not eligible” style
        answer is still a successful run — it's an answer, not an error.
      </p>
      <Field
        label="Look for this text"
        hint="Not case-sensitive; line breaks and extra spaces are ignored"
      >
        <input
          className="input font-mono"
          data-testid="decision-text"
          value={decision.text}
          onChange={(e) => onChange({ ...decision, text: e.target.value })}
          placeholder="no beneficiaries found"
        />
        <label className="flex items-center gap-1.5 text-xs text-text-muted mt-1">
          <input
            type="checkbox"
            checked={decision.isRegex === true}
            onChange={(e) =>
              onChange({ ...decision, isRegex: e.target.checked })
            }
          />
          Treat as a pattern (regular expression)
        </label>
        {regexError && <span className="text-[11px] text-danger">{regexError}</span>}
      </Field>
      {outcome("ifFound", "If it's on the page")}
      {outcome("ifNotFound", "If it isn't")}
      <Field
        label="Only look inside (optional)"
        hint="CSS selector; the whole page when empty"
      >
        <input
          className="input font-mono"
          value={decision.scope ?? ""}
          onChange={(e) => onChange({ ...decision, scope: e.target.value })}
          placeholder="#results"
        />
      </Field>
      <Field
        label="Wait up to (ms)"
        hint="How long to keep looking before deciding it isn't there"
      >
        <input
          type="number"
          min={0}
          max={60000}
          className="input"
          value={decision.settleMs ?? 2500}
          onChange={(e) =>
            onChange({ ...decision, settleMs: Number(e.target.value) })
          }
        />
      </Field>
    </div>
  );
}

// Recordings bake in whatever was typed (an Aadhaar number, a one-time code…).
// This turns that fixed value into a declared workflow variable in one step.
function MakeVariable({
  suggestedLabel,
  onCreate,
}: {
  suggestedLabel: string;
  onCreate: (key: string, label: string, sensitive: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [sensitive, setSensitive] = useState(false);
  const keyOk = /^[a-zA-Z0-9_]+$/.test(key);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setLabel(suggestedLabel.length <= 40 ? suggestedLabel : "");
          setOpen(true);
        }}
        className="text-left text-[11px] text-text-muted hover:text-signal underline decoration-dotted underline-offset-2"
      >
        Use a variable instead of a fixed value…
      </button>
    );
  }

  return (
    <div className="rounded-md border border-ink-line bg-ink-raised p-3 flex flex-col gap-2">
      <div className="text-[11px] text-text-muted">
        Fed in each time the workflow runs, instead of this recorded value.
      </div>
      <input
        className="input font-mono"
        placeholder="name, e.g. aadhaarNumber"
        value={key}
        onChange={(e) => setKey(e.target.value.trim())}
        autoFocus
      />
      <input
        className="input"
        placeholder="Label shown when starting a run"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <label className="flex items-center gap-1.5 text-xs text-text-muted">
        <input
          type="checkbox"
          checked={sensitive}
          onChange={(e) => setSensitive(e.target.checked)}
        />
        Sensitive (hide as it's typed)
      </label>
      {key && !keyOk && (
        <p className="text-[11px] text-danger">
          Letters, numbers and underscores only.
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!key || !keyOk}
          onClick={() => {
            onCreate(key, label.trim() || key, sensitive);
            setOpen(false);
            setKey("");
            setLabel("");
            setSensitive(false);
          }}
          className="rounded-md bg-signal text-ink font-semibold text-xs px-3 py-1.5 disabled:opacity-40"
        >
          Create variable
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn-ghost text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-mono uppercase tracking-wider text-text-dim">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-text-muted">{hint}</span>}
    </label>
  );
}
