"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";
import { StepEditorDrawer } from "@/components/canvas/StepEditorDrawer";
import { RunInputsDialog } from "@/components/RunInputsDialog";
import {
  DecisionOutcome,
  Step,
  StepType,
  Trigger,
  TriggerType,
  WorkflowInput,
  SavedSignInStatus,
  emptyStep,
  emptyWorkflowInput,
} from "@/lib/types";
import { api, ApiError } from "@/lib/api";

// A DecisionOutcome needs a label, a setBranch, or both — never send an
// empty-string label, or the API's @IsNotEmpty() rejects it.
function outcomePayload(o: DecisionOutcome) {
  return {
    ...(o.label?.trim() ? { label: o.label.trim() } : {}),
    tone: o.tone,
    ...(o.setBranch?.trim() ? { setBranch: o.setBranch.trim() } : {}),
  };
}

// The exact body the API accepts, built in one place so "what would be
// saved" can be compared against "what was last saved" to detect unsaved
// edits. Steps are rebuilt from only the fields the API accepts — ones
// fetched from the backend carry Mongoose's auto _id, which the update DTO
// rejects as an unrecognized property.
function buildPayload(
  name: string,
  description: string,
  trigger: Trigger,
  steps: Step[],
  inputs: WorkflowInput[],
  keepSignedIn?: boolean,
) {
  return {
    name,
    description,
    trigger,
    // Only present once someone has chosen a value, so workflows that never
    // use it are saved exactly as before.
    ...(keepSignedIn === undefined ? {} : { keepSignedIn }),
    steps: steps.map((s, i) => ({
      order: i,
      type: s.type,
      selector: s.selector,
      fallbackIntent: s.fallbackIntent,
      value: s.value,
      timeoutMs: s.timeoutMs,
      retryPolicy: s.retryPolicy,
      interventionTimeoutMs: s.interventionTimeoutMs,
      selectors: s.selectors,
      enabled: s.enabled !== false,
      ...(s.signInOnly ? { signInOnly: true } : {}),
      ...(s.branch?.trim() ? { branch: s.branch.trim() } : {}),
      // Set by scripts, not editable here — but saving must not wipe them.
      ...(s.extractAs ? { extractAs: s.extractAs } : {}),
      ...(s.rejection ? { rejection: s.rejection } : {}),
      ...(s.type === StepType.DECIDE && s.decision
        ? {
            decision: {
              text: s.decision.text,
              isRegex: !!s.decision.isRegex,
              scope: s.decision.scope?.trim() || undefined,
              settleMs: s.decision.settleMs,
              ifFound: outcomePayload(s.decision.ifFound),
              ifNotFound: outcomePayload(s.decision.ifNotFound),
            },
          }
        : {}),
    })),
    inputs: inputs
      .filter((i) => i.key.trim())
      .map((i) => ({
        key: i.key.trim(),
        label: i.label,
        sensitive: !!i.sensitive,
        required: i.required !== false,
        pattern: i.pattern?.trim() || undefined,
      })),
  };
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

interface WorkflowBuilderProps {
  workflowId?: string;
  initialName?: string;
  initialDescription?: string;
  initialTrigger?: Trigger;
  initialSteps?: Step[];
  initialInputs?: WorkflowInput[];
  initialKeepSignedIn?: boolean;
}

export function WorkflowBuilder({
  workflowId,
  initialName = "",
  initialDescription = "",
  initialTrigger = { type: TriggerType.MANUAL },
  initialSteps = [],
  initialInputs = [],
  initialKeepSignedIn,
}: WorkflowBuilderProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [trigger, setTrigger] = useState<Trigger>(initialTrigger);
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [inputs, setInputs] = useState<WorkflowInput[]>(initialInputs);
  const [keepSignedIn, setKeepSignedIn] = useState<boolean | undefined>(
    initialKeepSignedIn,
  );
  // Whether a sign-in to the target website is currently saved (never its contents).
  const [signIn, setSignIn] = useState<SavedSignInStatus | null>(null);
  const [clearingSignIn, setClearingSignIn] = useState(false);
  const [showVariables, setShowVariables] = useState(false);
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentSnapshot = JSON.stringify(
    buildPayload(name, description, trigger, steps, inputs, keepSignedIn),
  );
  const [savedSnapshot, setSavedSnapshot] = useState(currentSnapshot);
  const dirty = currentSnapshot !== savedSnapshot;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!workflowId || !keepSignedIn) return;
    let cancelled = false;
    api
      .get<SavedSignInStatus>(`/workflows/${workflowId}/sign-in`)
      .then((s) => !cancelled && setSignIn(s))
      .catch(() => !cancelled && setSignIn(null));
    return () => {
      cancelled = true;
    };
  }, [workflowId, keepSignedIn]);

  async function clearSignIn() {
    if (!workflowId) return;
    setClearingSignIn(true);
    setError(null);
    try {
      await api.delete(`/workflows/${workflowId}/sign-in`);
      setSignIn({ saved: false });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not clear the saved sign-in");
    } finally {
      setClearingSignIn(false);
    }
  }

  function addInput() {
    setInputs((prev) => [...prev, emptyWorkflowInput()]);
  }

  function updateInput(index: number, patch: Partial<WorkflowInput>) {
    setInputs((prev) =>
      prev.map((inp, i) => (i === index ? { ...inp, ...patch } : inp)),
    );
  }

  function deleteInput(index: number) {
    setInputs((prev) => prev.filter((_, i) => i !== index));
  }

  function createVariableFromStep(
    stepIndex: number,
    key: string,
    label: string,
    sensitive: boolean,
  ) {
    setInputs((prev) =>
      prev.some((i) => i.key === key)
        ? prev
        : [...prev, { key, label, sensitive, required: true }],
    );
    setSteps((prev) =>
      prev.map((s, i) => (i === stepIndex ? { ...s, value: `{{${key}}}` } : s)),
    );
    setShowVariables(true);
  }

  function addStep() {
    setSteps((prev) => {
      const next = [...prev, emptyStep(prev.length)];
      setSelected(next.length - 1);
      return next;
    });
  }

  function updateStep(index: number, step: Step) {
    setSteps((prev) => prev.map((s, i) => (i === index ? step : s)));
  }

  function deleteStep(index: number) {
    setSteps((prev) =>
      prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i })),
    );
    setSelected(null);
  }

  // `order` is always re-derived from position — the engine, the run logs
  // and the canvas all rely on order === index.
  const renumber = (list: Step[]) => list.map((s, i) => ({ ...s, order: i }));

  function insertStepAt(afterIndex: number) {
    setSteps((prev) => {
      const next = [...prev];
      next.splice(afterIndex + 1, 0, emptyStep(afterIndex + 1));
      return renumber(next);
    });
    setSelected(afterIndex + 1);
  }

  // Lifts the step at `from` out and drops it back so it ends up at `to`.
  function moveStep(from: number, to: number) {
    if (from === to || to < 0 || to >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return renumber(next);
    });
    setSelected(to);
  }

  function toggleStep(index: number) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, enabled: s.enabled === false } : s)),
    );
  }

  async function save(): Promise<boolean> {
    setError(null);
    if (!name.trim()) {
      setError("Give the workflow a name first.");
      return false;
    }
    if (steps.length === 0) {
      setError("Add at least one step before saving.");
      return false;
    }
    setSaving(true);
    try {
      const payload = buildPayload(name, description, trigger, steps, inputs, keepSignedIn);
      if (workflowId) {
        // Stay on the page (and keep any open step editor open) — all the
        // state here is already what was just saved.
        await api.patch(`/workflows/${workflowId}`, payload);
        setSavedSnapshot(JSON.stringify(payload));
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2500);
      } else {
        const created = await api.post<{ _id: string }>("/workflows", payload);
        setSavedSnapshot(JSON.stringify(payload));
        router.push(`/workflows/${created._id}`);
      }
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save workflow");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    if (!workflowId) return;
    setError(null);
    // A run executes the last *saved* version — save pending edits first so
    // it doesn't silently run something older than what's on screen.
    if (dirty && !(await save())) return;
    if (inputs.filter((i) => i.key.trim()).length > 0) {
      setShowRunDialog(true);
      return;
    }
    startRun();
  }

  async function startRun(values?: Record<string, string>) {
    if (!workflowId) return;
    setRunning(true);
    setError(null);
    try {
      const run = await api.post<{ _id: string }>(
        `/workflows/${workflowId}/run`,
        values ? { inputs: values } : undefined,
      );
      router.push(`/runs/${run._id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start run");
      setShowRunDialog(false);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b border-ink-line px-8 py-4 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs font-mono text-text-dim mb-1">
            <Link href="/workflows" className="hover:text-text-primary">
              Workflows
            </Link>
            <span>/</span>
            <span>{workflowId ? "Edit" : "New"}</span>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled workflow"
            className="bg-transparent font-display text-xl font-semibold text-text-primary placeholder:text-text-dim outline-none w-full"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a short description…"
            className="bg-transparent text-sm text-text-muted placeholder:text-text-dim outline-none w-full mt-0.5"
          />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <TriggerSelect trigger={trigger} onChange={setTrigger} />
          <div className="flex flex-col items-start">
            <label
              className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer"
              title="Stay signed in to the website this workflow automates (not this app's login) — the first run signs in, later runs skip the sign-in steps"
            >
              <input
                type="checkbox"
                data-testid="keep-signed-in"
                checked={keepSignedIn === true}
                onChange={(e) => setKeepSignedIn(e.target.checked)}
              />
              Keep signed in
            </label>
            {workflowId && keepSignedIn && signIn && (
              <span
                data-testid="sign-in-status"
                className="text-[10px] font-mono text-text-dim"
              >
                {signIn.saved && signIn.savedAt ? (
                  <>
                    saved {timeAgo(signIn.savedAt)} ·{" "}
                    <button
                      type="button"
                      data-testid="clear-sign-in"
                      onClick={clearSignIn}
                      disabled={clearingSignIn}
                      className="underline decoration-dotted hover:text-danger disabled:opacity-40"
                    >
                      {clearingSignIn ? "clearing…" : "clear"}
                    </button>
                  </>
                ) : (
                  "next run signs in and saves it"
                )}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowVariables((v) => !v)}
            className={`btn-ghost text-xs ${
              showVariables ? "border-signal/40 text-signal" : ""
            }`}
          >
            Variables{inputs.length > 0 ? ` (${inputs.length})` : ""}
          </button>
          {workflowId && (
            <button
              onClick={runNow}
              disabled={running}
              className="btn-ghost text-signal hover:border-signal/40 disabled:opacity-40"
            >
              {running ? "Starting…" : "▶ Run"}
            </button>
          )}
          {dirty && !saving && (
            <span className="text-xs font-mono text-warn">● unsaved changes</span>
          )}
          <button
            onClick={() => save()}
            disabled={saving}
            className="rounded-md bg-signal text-ink font-semibold text-sm px-4 py-2 hover:bg-signal-glow transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : justSaved && !dirty ? "Saved ✓" : "Save"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-danger text-sm bg-danger/10 border-b border-danger/30 px-8 py-2">
          {error}
        </p>
      )}

      {showVariables && (
        <div className="border-b border-ink-line bg-ink-panel px-8 py-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-text-dim">
              Variables — use {"{{key}}"} in a step's value, or {"{{key[0:4]}}"} for
              just part of it (e.g. one box of a split number)
            </span>
            <button onClick={addInput} className="btn-ghost text-xs">
              + Add variable
            </button>
          </div>
          {inputs.length === 0 && (
            <p className="text-xs text-text-muted">
              No variables declared yet. Add one to feed data into this
              workflow (e.g. an applicant ID) each time it's run.
            </p>
          )}
          {inputs.map((input, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="input font-mono w-36"
                placeholder="key"
                value={input.key}
                onChange={(e) => updateInput(i, { key: e.target.value })}
              />
              <input
                className="input flex-1"
                placeholder="Label shown when triggering a run"
                value={input.label}
                onChange={(e) => updateInput(i, { label: e.target.value })}
              />
              <input
                className="input font-mono w-40"
                placeholder="format, e.g. ^\d{12}$"
                title="Optional regex the value must match before a run starts"
                value={input.pattern ?? ""}
                onChange={(e) => updateInput(i, { pattern: e.target.value })}
              />
              <label className="flex items-center gap-1.5 text-xs text-text-muted shrink-0">
                <input
                  type="checkbox"
                  checked={input.required !== false}
                  onChange={(e) =>
                    updateInput(i, { required: e.target.checked })
                  }
                />
                Required
              </label>
              <label className="flex items-center gap-1.5 text-xs text-text-muted shrink-0">
                <input
                  type="checkbox"
                  checked={!!input.sensitive}
                  onChange={(e) =>
                    updateInput(i, { sensitive: e.target.checked })
                  }
                />
                Sensitive
              </label>
              <button
                onClick={() => deleteInput(i)}
                className="text-text-dim hover:text-danger text-sm shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {showRunDialog && (
        <RunInputsDialog
          inputs={inputs.filter((i) => i.key.trim())}
          submitting={running}
          onSubmit={(values) => startRun(values)}
          onCancel={() => setShowRunDialog(false)}
        />
      )}

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0">
          <WorkflowCanvas
            steps={steps}
            selectedIndex={selected}
            onSelect={setSelected}
            onDelete={deleteStep}
            onAdd={addStep}
            onInsert={insertStepAt}
            onMove={moveStep}
            onToggle={toggleStep}
          />
        </div>
        {selected !== null && steps[selected] && (
          <StepEditorDrawer
            step={steps[selected]}
            index={selected}
            workflowInputs={inputs}
            onCreateVariable={(key, label, sensitive) =>
              createVariableFromStep(selected, key, label, sensitive)
            }
            onChange={(s) => updateStep(selected, s)}
            onClose={() => setSelected(null)}
            onDelete={() => deleteStep(selected)}
            stepCount={steps.length}
            onMove={(delta) => moveStep(selected, selected + delta)}
            onToggleEnabled={() => toggleStep(selected)}
            onSave={() => save()}
            saving={saving}
            dirty={dirty}
            justSaved={justSaved}
            isNewWorkflow={!workflowId}
            saveError={error}
          />
        )}
      </div>
    </div>
  );
}

function TriggerSelect({
  trigger,
  onChange,
}: {
  trigger: Trigger;
  onChange: (t: Trigger) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <select
        className="input py-1.5"
        value={trigger.type}
        onChange={(e) =>
          onChange({ ...trigger, type: e.target.value as TriggerType })
        }
      >
        <option value={TriggerType.MANUAL}>Manual</option>
        <option value={TriggerType.CRON}>Scheduled (not wired up yet)</option>
        <option value={TriggerType.WEBHOOK}>Webhook (not wired up yet)</option>
      </select>
    </div>
  );
}
