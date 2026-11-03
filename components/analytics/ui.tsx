"use client";

import { ReactNode } from "react";
import { Sparkline, C } from "./charts";

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
  dim = false,
  error,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** A refresh is in flight: keep the old content, just dimmed (no skeleton, no jump). */
  dim?: boolean;
  error?: string | null;
}) {
  return (
    <section className={`flex flex-col rounded-xl border border-ink-line bg-ink-panel shadow-panel p-5 min-w-0 ${className}`}>
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="font-display text-[15px] font-semibold text-text-primary">{title}</h2>
          {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </header>
      {error && <p className="text-danger text-xs bg-danger/10 border border-danger/30 rounded-md px-3 py-2 mb-3">{error}</p>}
      {/* fills the card, and centres what's inside when a neighbour makes the card taller than its content */}
      <div className={`flex-1 flex flex-col justify-center transition-opacity duration-200 ${dim ? "opacity-50" : "opacity-100"}`}>{children}</div>
    </section>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ id: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex rounded-md border border-ink-line p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${value === o.id ? "bg-signal/15 text-signal" : "text-text-muted hover:text-text-primary"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-ink-raised/70 ${className}`} />;
}

// ---------- change vs the previous period ----------

export interface DeltaSpec {
  now: number | null;
  before: number | null;
  /** "pct": relative change (counts). "pts": percentage-point change (rates). */
  mode: "pct" | "pts";
  lowerIsBetter?: boolean;
}

export function Delta({ now, before, mode, lowerIsBetter }: DeltaSpec) {
  if (now === null || before === null || (mode === "pct" && before === 0)) {
    return <span className="text-[11px] text-text-dim">{before === 0 || before === null ? "no earlier data" : ""}</span>;
  }
  const diff = mode === "pct" ? ((now - before) / before) * 100 : now - before;
  const flat = Math.abs(diff) < (mode === "pct" ? 0.5 : 0.05);
  const up = diff > 0;
  const good = flat ? null : lowerIsBetter ? !up : up;
  const color = good === null ? "text-text-muted" : good ? "text-ok" : "text-danger";
  const text = mode === "pct" ? `${Math.abs(diff).toFixed(Math.abs(diff) >= 10 ? 0 : 1)}%` : `${Math.abs(diff).toFixed(1)} pts`;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-mono ${color}`} title="Compared with the period just before">
      <span aria-hidden>{flat ? "■" : up ? "▲" : "▼"}</span>
      {flat ? "no change" : `${up ? "up" : "down"} ${text}`}
      <span className="sr-only">{good === null ? "" : good ? ", better" : ", worse"}</span>
    </span>
  );
}

export function KpiTile({
  label,
  value,
  sub,
  delta,
  spark,
  sparkColor = C.active,
  hint,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  delta?: DeltaSpec;
  spark?: number[];
  sparkColor?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-ink-line bg-ink-panel shadow-panel p-4 min-w-0 flex flex-col gap-2" title={hint}>
      <span className="text-[11px] font-mono uppercase tracking-wider text-text-dim">{label}</span>
      <div className="flex items-end justify-between gap-2">
        <span className="font-display text-[28px] leading-none font-semibold text-text-primary tabular-nums">{value}</span>
        {spark && spark.length > 1 && <Sparkline values={spark} color={sparkColor} />}
      </div>
      <div className="flex items-center justify-between gap-2 min-h-[16px]">
        {delta ? <Delta {...delta} /> : <span />}
        {sub && <span className="text-[11px] text-text-muted truncate">{sub}</span>}
      </div>
    </div>
  );
}
