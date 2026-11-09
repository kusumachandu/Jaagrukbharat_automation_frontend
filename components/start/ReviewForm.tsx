"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PublicReviewField, PublicReviewForm } from "@/lib/public-api";
import { conditionHolds, fieldMode } from "@/lib/inputOptions";
import { NicHit, nicByCode } from "@/lib/nicSearch";
import { NicSearch } from "./NicSearch";

interface ReviewFormProps {
  form: PublicReviewForm;
  submitting: boolean;
  // What the server found wrong, per field (a 422 from Start). Shown on the fields, and the page scrolls to the first.
  serverErrors: Record<string, string> | null;
  onConfirm: (inputs: Record<string, string>) => void;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

// A NIC line's wording, cleaned to what the description question accepts (letters/digits/basic punctuation, ≤100 chars).
function cleanNicName(name: string): string {
  const words = name
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^A-Za-z0-9 ,&/'().-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const text = words.length > 100 ? words.slice(0, 100).replace(/\s+\S*$/, "") : words;
  return text.replace(/[^A-Za-z0-9)]+$/, "");
}

// The "check your details" form on the customer's private Start page. Same questions as the automation needs; what
// the website already had is filled in and marked, what is missing is highlighted. Nothing runs until Confirm.
export function ReviewForm({ form: rawForm, submitting, serverErrors, onConfirm }: ReviewFormProps) {
  // One question, not two: "what work does your business do" is the NIC search. Picking a line fills the 5-digit code
  // and the description the automation also wants, so the separate description box is not shown.
  const form = useMemo<PublicReviewForm>(() => {
    const hasBoth = rawForm.fields.some((f) => f.key === "nic_5_digit") && rawForm.fields.some((f) => f.key === "business_description");
    if (!hasBoth) return rawForm;
    const fixes = rawForm.fixes ? { ...rawForm.fixes } : undefined;
    if (fixes?.business_description) {
      fixes.nic_5_digit = fixes.nic_5_digit ?? fixes.business_description;
      delete fixes.business_description;
    }
    return {
      ...rawForm,
      fields: rawForm.fields
        .filter((f) => f.key !== "business_description")
        .map((f) => (f.key === "nic_5_digit" ? { ...f, required: true } : f)),
      groups: rawForm.groups.map((g) => ({ ...g, keys: g.keys.filter((k) => k !== "business_description") })),
      ...(fixes ? { fixes } : {}),
    };
  }, [rawForm]);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(form.fields.filter((f) => f.value !== undefined).map((f) => [f.key, f.value as string])),
  );
  // Fields the website refused on the last try start highlighted, with what to correct.
  const [errors, setErrors] = useState<Record<string, string>>(() => form.fixes ?? {});

  const fields = form.fields;
  // The order the questions appear in, top to bottom: the first error in this order is the one scrolled to.
  // (The "fill these first" block comes before the sections, so its fields lead.)
  const order = useMemo(() => {
    const all = form.groups.flatMap((g) => g.keys);
    const first = all.filter((k) => {
      const f = form.fields.find((x) => x.key === k);
      return !!f && (k in (form.fixes ?? {}) || (f.required !== false && !f.prefilled && !(f.value ?? "").trim()));
    });
    return [...first, ...all.filter((k) => !first.includes(k))];
  }, [form.groups, form.fields, form.fixes]);
  const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);

  const isAsked = (f: PublicReviewField) => conditionHolds(f.showIf, values);

  // The fields to fill in first: what was missing (or refused last time) when the page opened, in section order. Fixed
  // at load, so a field does not jump down to its section while the customer is typing in it.
  const [firstKeys] = useState<string[]>(() =>
    form.groups
      .flatMap((g) => g.keys)
      .filter((k) => {
        const f = form.fields.find((x) => x.key === k);
        return !!f && (k in (form.fixes ?? {}) || (f.required !== false && !f.prefilled && !(f.value ?? "").trim()));
      }),
  );

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
    // The hidden description's problem is shown on the question the customer actually sees.
    const { business_description: descProblem, ...others } = serverErrors;
    const shown = descProblem && !byKey.has("business_description") ? { ...others, nic_5_digit: others.nic_5_digit ?? descProblem } : serverErrors;
    setErrors(shown);
    scrollToFirstError(shown);
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

  // A line picked from the NIC search: its 5-digit code goes on the form, and its wording (cleaned to what the
  // description question accepts) fills "what does your business do" — the run's backup if the portal refuses the code.
  function pickNic(hit: NicHit | null) {
    if (!hit) {
      setValue("nic_5_digit", "");
      return;
    }
    const text = cleanNicName(hit.name);
    setValues((prev) => ({ ...prev, nic_5_digit: hit.code, business_description: text }));
    setErrors((prev) => {
      const { nic_5_digit: _a, ...rest } = prev;
      return rest;
    });
  }

  // The description the run keeps as a backup: what was picked, else the official wording of the chosen code.
  function describe(): string {
    const have = (values.business_description ?? "").trim();
    if (have) return have;
    const chosen = /^\d{5}$/.test(values.nic_5_digit ?? "") ? nicByCode(values.nic_5_digit) : null;
    return chosen ? cleanNicName(chosen.name) : "";
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
    if (byKey.has("nic_5_digit") && rawForm.fields.some((f) => f.key === "business_description")) inputs.business_description = describe();
    onConfirm(inputs);
  }

  const errorCount = Object.keys(errors).length;

  function renderField(f: PublicReviewField, section?: string) {
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
            {f.key === "nic_5_digit" ? "What work does your business do?" : f.label || f.key}
            {f.required !== false && <span className="rv-star"> *</span>}
            {section && <span className="rv-section"> · {section}</span>}
          </span>
          {f.prefilled ? (
            <span className="rv-tag ok">✓ Filled in for you</span>
          ) : needed ? (
            <span className="rv-tag need">Please fill in</span>
          ) : null}
        </label>

        {f.key === "nic_5_digit" ? (
          <NicSearch inputId={`rv-input-${f.key}`} code={value} error={error} onPick={pickNic} />
        ) : mode.mode === "waiting" ? (
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
  }

  const sectionOf = (key: string) => form.groups.find((g) => g.keys.includes(key))?.title;
  // Still-asked fields from the "fill these first" list, in section order.
  const firstShown = firstKeys.map((k) => byKey.get(k)).filter((f): f is PublicReviewField => !!f && isAsked(f));

  return (
    <form onSubmit={handleSubmit} noValidate data-testid="review-form">
      {firstShown.length > 0 && (
        <div className="card rv-group rv-first" data-testid="group-fill-first">
          <h3>Please fill these in first</h3>
          <p className="rv-hint">We couldn't find these. Everything else below is already filled in from your application — just check it.</p>
          {firstShown.map((f) => renderField(f, sectionOf(f.key)))}
        </div>
      )}

      {form.groups.map((group) => {
        const shown = group.keys
          .map((k) => byKey.get(k))
          .filter((f): f is PublicReviewField => !!f && isAsked(f) && !firstKeys.includes(f.key));
        if (shown.length === 0) return null;
        return (
          <div key={group.title} className="card rv-group" data-testid={`group-${group.title}`}>
            <h3>{group.title}</h3>
            {shown.map((f) => renderField(f))}
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
