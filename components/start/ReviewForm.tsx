"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PublicReviewField, PublicReviewForm } from "@/lib/public-api";
import { conditionHolds, fieldMode } from "@/lib/inputOptions";

interface ReviewFormProps {
  form: PublicReviewForm;
  submitting: boolean;
  // What the server found wrong, per field (a 422 from Start). Shown on the fields, and the page scrolls to the first.
  serverErrors: Record<string, string> | null;
  onConfirm: (inputs: Record<string, string>) => void;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

// The "check your details" form on the customer's private Start page. Same questions as the automation needs; what
// the website already had is filled in and marked, what is missing is highlighted. Nothing runs until Confirm.
export function ReviewForm({ form, submitting, serverErrors, onConfirm }: ReviewFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(form.fields.filter((f) => f.value !== undefined).map((f) => [f.key, f.value as string])),
  );
  // Fields the website refused on the last try start highlighted, with what to correct.
  const [errors, setErrors] = useState<Record<string, string>>(() => form.fixes ?? {});

  const fields = form.fields;
  // The order the questions appear in, top to bottom: the first error in this order is the one scrolled to.
  const order = useMemo(() => form.groups.flatMap((g) => g.keys), [form.groups]);
  const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);

  const isAsked = (f: PublicReviewField) => conditionHolds(f.showIf, values);

  function scrollToFirstError(errs: Record<string, string>) {
    const first = order.find((k) => errs[k]) ?? Object.keys(errs)[0];
    if (!first) return;
    // After the errors are painted, so the target is at its final position.
    requestAnimationFrame(() => {
      const wrap = document.getElementById(`rv-${first}`);
      if (!wrap) return;
      wrap.scrollIntoView({ behavior: "smooth", block: "center" });
      (wrap.querySelector("input, select") as HTMLElement | null)?.focus({ preventScroll: true });
    });
  }

  useEffect(() => {
    if (form.fixes && Object.keys(form.fixes).length > 0) scrollToFirstError(form.fixes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!serverErrors) return;
    setErrors(serverErrors);
    scrollToFirstError(serverErrors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverErrors]);

  // Sets one answer. Whatever depends on it (a district, once the state changes) is cleared if it is no longer
  // one of the choices, so a stale district can never be sent.
  function setValue(key: string, value: string) {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      for (const dep of fields) {
        if (!dep.dependsOn?.includes(key) || !next[dep.key]) continue;
        const mode = fieldMode(dep, next, fields);
        const stillValid =
          mode.mode === "text" || (mode.mode === "select" && mode.options.some((o) => norm(o) === norm(next[dep.key])));
        if (!stillValid) next[dep.key] = "";
      }
      return next;
    });
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const { [key]: _gone, ...rest } = prev;
      return rest;
    });
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    for (const key of order) {
      const f = byKey.get(key);
      if (!f || !isAsked(f)) continue;
      const value = (values[key] ?? "").trim();
      // A sensitive answer we already hold stays blank on the form (only a masked hint is shown): blank = keep it.
      if (!value) {
        if (f.required !== false && !(f.sensitive && f.prefilled)) errs[key] = "This is required";
        continue;
      }
      const mode = fieldMode(f, values, fields);
      if (mode.mode === "select" && !mode.options.some((o) => norm(o) === norm(value))) {
        errs[key] = "Please choose one of the options";
        continue;
      }
      if (f.pattern) {
        try {
          if (!new RegExp(f.pattern).test(value)) errs[key] = "This isn't in the expected format";
        } catch {
          // an unusable pattern must not block the customer; the server checks again
        }
      }
    }
    return errs;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      scrollToFirstError(errs);
      return;
    }
    const inputs: Record<string, string> = {};
    for (const f of fields) {
      if (!isAsked(f)) continue; // a hidden question (plant details with no plant) is not sent
      const value = (values[f.key] ?? "").trim();
      if (f.sensitive) {
        if (value) inputs[f.key] = value; // untouched = the server keeps what it already holds
      } else {
        inputs[f.key] = value;
      }
    }
    onConfirm(inputs);
  }

  const errorCount = Object.keys(errors).length;

  return (
    <form onSubmit={handleSubmit} noValidate data-testid="review-form">
      {form.groups.map((group) => {
        const shown = group.keys.map((k) => byKey.get(k)).filter((f): f is PublicReviewField => !!f && isAsked(f));
        if (shown.length === 0) return null;
        return (
          <div key={group.title} className="card rv-group" data-testid={`group-${group.title}`}>
            <h3>{group.title}</h3>
            {shown.map((f) => {
              const mode = fieldMode(f, values, fields);
              const value = values[f.key] ?? "";
              const error = errors[f.key];
              const needed = f.required !== false && !f.prefilled && !value.trim();
              const numeric = !!f.pattern && /^\^?(\\d|\[0-9\])/.test(f.pattern);
              return (
                <div
                  key={f.key}
                  id={`rv-${f.key}`}
                  data-testid={`field-${f.key}`}
                  className={`rv-field${error ? " has-error" : ""}${needed && !error ? " needed" : ""}`}
                >
                  <label htmlFor={`rv-input-${f.key}`} className="rv-label">
                    <span>
                      {f.label || f.key}
                      {f.required !== false && <span className="rv-star"> *</span>}
                    </span>
                    {f.prefilled ? (
                      <span className="rv-tag ok">✓ Filled in for you</span>
                    ) : needed ? (
                      <span className="rv-tag need">Please fill in</span>
                    ) : null}
                  </label>

                  {mode.mode === "waiting" ? (
                    <select id={`rv-input-${f.key}`} className="rv-input" disabled value="">
                      <option value="">Choose {mode.waitingFor.join(" and ").toLowerCase()} first</option>
                    </select>
                  ) : mode.mode === "select" ? (
                    <select
                      id={`rv-input-${f.key}`}
                      className="rv-input"
                      value={value}
                      aria-invalid={!!error}
                      onChange={(e) => setValue(f.key, e.target.value)}
                    >
                      <option value="">{f.required !== false ? "Select…" : "— none —"}</option>
                      {mode.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`rv-input-${f.key}`}
                      className="rv-input"
                      type="text"
                      autoComplete="off"
                      inputMode={numeric ? "numeric" : undefined}
                      value={value}
                      aria-invalid={!!error}
                      placeholder={f.sensitive && f.hint ? `${f.hint} — leave blank to keep` : ""}
                      onChange={(e) => setValue(f.key, e.target.value)}
                    />
                  )}

                  {error && (
                    <div className="rv-error" role="alert" data-testid={`error-${f.key}`}>
                      {error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {errorCount > 0 && (
        <p data-testid="review-errors" className="rv-summary" role="alert">
          Please fix {errorCount === 1 ? "the highlighted detail" : `the ${errorCount} highlighted details`} above.
        </p>
      )}

      <button data-testid="confirm-button" type="submit" className="btn" disabled={submitting}>
        {submitting ? "Starting…" : "Confirm and start application"}
      </button>
    </form>
  );
}
