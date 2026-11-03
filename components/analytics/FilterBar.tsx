"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { DEFAULT_FILTERS, Filters, Options, PRESETS, Preset, activeFilterCount } from "@/lib/analytics";

const TRIGGER_LABEL: Record<string, string> = { manual: "Manual", cron: "Scheduled", webhook: "Webhook" };
const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  paused: "Waiting on a person",
  success: "Success",
  failed: "Failed",
  cancelled: "Cancelled",
};

interface Props {
  filters: Filters;
  options: Options | undefined;
  onChange: (next: Filters) => void;
}

/** One row above the charts; everything below re-renders against the same slice. */
export function FilterBar({ filters, options, onChange }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const count = activeFilterCount(filters);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-ink-line bg-ink-panel p-0.5" role="group" aria-label="Date range">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => set({ preset: p.id as Preset })}
            aria-pressed={filters.preset === p.id}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              filters.preset === p.id ? "bg-signal/15 text-signal" : "text-text-muted hover:text-text-primary hover:bg-ink-raised"
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => set({ preset: "custom", from: filters.from ?? today(-7), to: filters.to ?? today(0) })}
          aria-pressed={filters.preset === "custom"}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            filters.preset === "custom" ? "bg-signal/15 text-signal" : "text-text-muted hover:text-text-primary hover:bg-ink-raised"
          }`}
        >
          Custom
        </button>
      </div>

      {filters.preset === "custom" && (
        <div className="inline-flex items-center gap-1.5 text-xs text-text-muted">
          <input type="date" className="input !py-1 !text-xs" value={filters.from ?? ""} max={filters.to} onChange={(e) => set({ from: e.target.value })} aria-label="From" />
          <span>to</span>
          <input type="date" className="input !py-1 !text-xs" value={filters.to ?? ""} min={filters.from} max={today(0)} onChange={(e) => set({ to: e.target.value })} aria-label="To" />
        </div>
      )}

      <span className="w-px h-6 bg-ink-line mx-1" aria-hidden />

      <Multi
        label="Service"
        all="All services"
        selected={filters.workflowId}
        choices={(options?.workflows ?? []).map((w) => ({ id: w.id, label: w.name }))}
        onChange={(workflowId) => set({ workflowId })}
        searchable
      />
      <Multi
        label="Status"
        all="Any status"
        selected={filters.status}
        choices={(options?.statuses ?? []).map((s) => ({ id: s, label: STATUS_LABEL[s] ?? s }))}
        onChange={(status) => set({ status })}
      />
      <Multi
        label="Failure cause"
        all="Any cause"
        selected={filters.failure}
        choices={(options?.failures ?? []).map((f) => ({ id: f.key, label: f.label }))}
        onChange={(failure) => set({ failure })}
        searchable
      />
      <Multi
        label="Trigger"
        all="Any trigger"
        selected={filters.trigger}
        choices={(options?.triggers ?? []).map((t) => ({ id: t, label: TRIGGER_LABEL[t] ?? t }))}
        onChange={(trigger) => set({ trigger })}
      />
      <Pick label="Manual help" value={filters.intervened} onChange={(intervened) => set({ intervened })} yes="Needed a prompt" no="Fully automatic" />
      <Pick label="Saved sign-in" value={filters.savedSignIn} onChange={(savedSignIn) => set({ savedSignIn })} yes="Used" no="Not used" />

      {count > 0 && (
        <button onClick={() => onChange({ ...DEFAULT_FILTERS, preset: filters.preset, from: filters.from, to: filters.to })} className="text-xs text-text-muted hover:text-signal underline-offset-2 hover:underline ml-1">
          Clear {count} filter{count > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}

function today(offsetDays: number): string {
  const d = new Date(Date.now() + 330 * 60_000 + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function useOutside(close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [close]);
  return ref;
}

function Trigger({ label, summary, active, open, onClick }: { label: string; summary: string; active: boolean; open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-haspopup="listbox"
      aria-expanded={open}
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors ${
        active ? "border-signal/40 bg-signal/10 text-signal" : "border-ink-line bg-ink-panel text-text-muted hover:text-text-primary hover:bg-ink-raised"
      }`}
    >
      <span className="text-text-dim">{label}</span>
      <span className="font-medium max-w-[150px] truncate">{summary}</span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function Menu({ children }: { children: ReactNode }) {
  return <div className="absolute left-0 top-full mt-1.5 z-30 min-w-[220px] max-w-[300px] rounded-lg border border-ink-line bg-ink-raised shadow-panel py-1.5">{children}</div>;
}

function Multi({ label, all, selected, choices, onChange, searchable }: { label: string; all: string; selected: string[]; choices: Array<{ id: string; label: string }>; onChange: (next: string[]) => void; searchable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useOutside(() => setOpen(false));
  const names = selected.map((id) => choices.find((c) => c.id === id)?.label).filter(Boolean) as string[];
  const summary = !selected.length ? all : names.length === 1 ? names[0] : `${selected.length} selected`;
  const shown = choices.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <div ref={ref} className="relative">
      <Trigger label={label} summary={summary} active={selected.length > 0} open={open} onClick={() => setOpen(!open)} />
      {open && (
        <Menu>
          {searchable && choices.length > 6 && (
            <div className="px-2 pb-1.5">
              <input autoFocus className="input !py-1 !text-xs w-full" placeholder={`Find ${label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
          <ul role="listbox" aria-multiselectable className="max-h-64 overflow-y-auto">
            {shown.map((c) => {
              const on = selected.includes(c.id);
              return (
                <li key={c.id}>
                  <button role="option" aria-selected={on} onClick={() => toggle(c.id)} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs hover:bg-ink-panel">
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-signal border-signal text-ink" : "border-ink-line"}`}>
                      {on && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate text-text-primary">{c.label}</span>
                  </button>
                </li>
              );
            })}
            {!shown.length && <li className="px-3 py-2 text-xs text-text-muted">No matches</li>}
          </ul>
          {selected.length > 0 && (
            <div className="border-t border-ink-line mt-1 pt-1 px-3 pb-0.5">
              <button onClick={() => onChange([])} className="text-xs text-text-muted hover:text-signal">Clear</button>
            </div>
          )}
        </Menu>
      )}
    </div>
  );
}

function Pick({ label, value, onChange, yes, no }: { label: string; value: "" | "yes" | "no"; onChange: (v: "" | "yes" | "no") => void; yes: string; no: string }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(() => setOpen(false));
  const opts: Array<{ id: "" | "yes" | "no"; label: string }> = [
    { id: "", label: "Any" },
    { id: "yes", label: yes },
    { id: "no", label: no },
  ];
  return (
    <div ref={ref} className="relative">
      <Trigger label={label} summary={opts.find((o) => o.id === value)?.label ?? "Any"} active={value !== ""} open={open} onClick={() => setOpen(!open)} />
      {open && (
        <Menu>
          <ul role="listbox">
            {opts.map((o) => (
              <li key={o.id}>
                <button
                  role="option"
                  aria-selected={value === o.id}
                  onClick={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs hover:bg-ink-panel"
                >
                  <span className="w-4 text-signal">{value === o.id ? "✓" : ""}</span>
                  <span className="text-text-primary">{o.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </Menu>
      )}
    </div>
  );
}
