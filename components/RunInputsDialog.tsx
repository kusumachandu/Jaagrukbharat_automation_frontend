"use client";

import { FormEvent, useState } from "react";
import { WorkflowInput } from "@/lib/types";

interface RunInputsDialogProps {
  inputs: WorkflowInput[];
  submitting: boolean;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
  // Edit-and-retry: start from what the run had. Sensitive values are never sent to the browser, so
  // those in keepKeys show "unchanged" and are kept when left blank.
  initialValues?: Record<string, string>;
  keepKeys?: string[];
  title?: string;
  description?: string;
  submitLabel?: string;
}

// Testing convenience: the last values used for a workflow are remembered in this browser and filled in
// next time. Never for sensitive variables (an Aadhaar number…) — those are retyped every run — and not
// when editing a run to retry it (that starts from the run's own values).
function storageKey(inputs: WorkflowInput[]): string {
  return `autoflow:last-run-inputs:${inputs.map((i) => i.key).join(",")}`;
}

function loadSaved(inputs: WorkflowInput[]): Record<string, string> {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(inputs)) ?? "{}") as Record<string, string>;
    const out: Record<string, string> = {};
    for (const i of inputs) if (!i.sensitive && typeof saved[i.key] === "string") out[i.key] = saved[i.key];
    return out;
  } catch {
    return {};
  }
}

function saveValues(inputs: WorkflowInput[], values: Record<string, string>): void {
  try {
    const out: Record<string, string> = {};
    for (const i of inputs) if (!i.sensitive && values[i.key]) out[i.key] = values[i.key];
    window.localStorage.setItem(storageKey(inputs), JSON.stringify(out));
  } catch {
    // storage blocked or full: remembering is only a convenience
  }
}

export function RunInputsDialog({
  inputs,
  submitting,
  onSubmit,
  onCancel,
  initialValues,
  keepKeys = [],
  title = "Run this workflow",
  description = "Fill in the variables this workflow needs before it starts.",
  submitLabel = "Start run",
}: RunInputsDialogProps) {
  const [values, setValues] = useState<Record<string, string>>(() => initialValues ?? loadSaved(inputs));
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed: Record<string, string> = {};
    for (const i of inputs) trimmed[i.key] = (values[i.key] ?? "").trim();

    const missing = inputs.filter(
      (i) => i.required !== false && !trimmed[i.key] && !keepKeys.includes(i.key),
    );
    if (missing.length > 0) {
      setError(
        `Fill in: ${missing.map((i) => i.label || i.key).join(", ")}`,
      );
      return;
    }

    const badFormat = inputs.filter((i) => {
      if (!i.pattern || !trimmed[i.key]) return false;
      try {
        return !new RegExp(i.pattern).test(trimmed[i.key]);
      } catch {
        return false; // an unusable pattern shouldn't block the run; the server re-checks
      }
    });
    if (badFormat.length > 0) {
      setError(
        `Check the format of: ${badFormat.map((i) => i.label || i.key).join(", ")}`,
      );
      return;
    }

    setError(null);
    if (!initialValues) saveValues(inputs, trimmed);
    onSubmit(trimmed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-lg border border-ink-line bg-ink-panel shadow-panel">
        <div className="px-5 py-4 border-b border-ink-line">
          <div className="font-display font-medium text-text-primary">
            {title}
          </div>
          <p className="text-xs text-text-muted mt-0.5">{description}</p>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-3">
          {/* One scrollbar for the fields, at a fixed maximum height: the title and the
              Start / Cancel buttons stay in view however many variables there are. */}
          <div className="flex flex-col gap-3 max-h-[55vh] overflow-y-auto pr-2">
          {inputs.map((input) => (
            <label key={input.key} className="flex flex-col gap-1.5">
              <span className="text-xs font-mono uppercase tracking-wider text-text-dim">
                {input.label || input.key}
                {input.required !== false && (
                  <span className="text-danger"> *</span>
                )}
              </span>
              {input.options && input.options.length > 0 ? (
                // A variable with choices is a dropdown, so nobody has to remember the exact words.
                <select
                  className="input"
                  value={values[input.key] ?? ""}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [input.key]: e.target.value }))
                  }
                  autoFocus={inputs[0]?.key === input.key}
                >
                  <option value="">
                    {input.required !== false ? "Select…" : "— none —"}
                  </option>
                  {input.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={input.sensitive ? "password" : "text"}
                  className="input"
                  value={values[input.key] ?? ""}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [input.key]: e.target.value }))
                  }
                  placeholder={
                    keepKeys.includes(input.key) ? "•••• unchanged — type to replace" : input.key
                  }
                  autoFocus={inputs[0]?.key === input.key}
                />
              )}
            </label>
          ))}
          </div>

          {error &&<p className="text-danger text-xs">{error}</p>}

          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="btn-ghost text-xs disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-signal text-ink font-semibold text-sm px-4 py-1.5 hover:bg-signal-glow transition-colors disabled:opacity-50"
            >
              {submitting ? "Starting…" : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
