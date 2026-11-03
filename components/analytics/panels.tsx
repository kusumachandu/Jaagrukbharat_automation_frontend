"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { RunStatus } from "@/lib/types";
import { api, ApiError } from "@/lib/api";
import {
  Failures,
  Filters,
  Funnel,
  Heatmap,
  HumanEffort,
  Live,
  Overview,
  RunRow,
  RunsPage,
  ServiceRow,
  ago,
  fmtDuration,
  fmtNum,
  fmtPct,
  fmtWhen,
} from "@/lib/analytics";
import { CAUSE_COLORS, C, Donut, LeakBar, OTHER_COLOR, Slice, Sparkline, TaperedFunnel } from "./charts";
import { Pagination } from "@/components/Pagination";
import { Card, Skeleton } from "./ui";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ---------- live strip ----------

export function LiveStrip({ live }: { live: Live | undefined }) {
  const items = [
    { label: "Running", value: live?.running, dot: "bg-signal pulse-soft", href: "/sessions" },
    { label: "Queued", value: live?.queued, dot: "bg-text-dim", href: "/sessions" },
    { label: "Waiting on a person", value: live?.paused, dot: "bg-warn pulse-soft", href: "/sessions" },
    { label: "Customers yet to tap Start", value: live?.customersWaitingToStart, dot: "bg-[var(--c-active)]", href: undefined },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-ink-line bg-ink-panel px-5 py-3">
      <span className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-text-dim">
        <span className="w-1.5 h-1.5 rounded-full bg-ok pulse-soft" aria-hidden /> Right now
      </span>
      {items.map((i) => {
        const body = (
          <span className="inline-flex items-center gap-2 text-sm">
            <span className={`w-2 h-2 rounded-full ${i.dot}`} aria-hidden />
            <span className="font-display font-semibold text-text-primary tabular-nums">{live ? fmtNum(i.value) : "–"}</span>
            <span className="text-text-muted">{i.label}</span>
          </span>
        );
        return i.href ? (
          <Link key={i.label} href={i.href} className="hover:opacity-80">{body}</Link>
        ) : (
          <span key={i.label}>{body}</span>
        );
      })}
      {live?.oldestQueuedAt && live.queued > 0 && <span className="text-xs text-warn">Oldest queued run has waited {ago(live.oldestQueuedAt).replace(" ago", "")}</span>}
    </div>
  );
}

// ---------- plain-language insights ----------

interface Insight {
  tone: "good" | "warn" | "info";
  title: string;
  detail?: string;
}

export function buildInsights(o?: Overview, services?: ServiceRow[], f?: Failures, h?: Heatmap, funnel?: Funnel): Insight[] {
  const out: Insight[] = [];
  if (o && o.current.total > 0) {
    const c = o.current;
    const p = o.previous;
    if (c.successRate !== null && p.successRate !== null && p.total >= 10) {
      const d = c.successRate - p.successRate;
      if (Math.abs(d) >= 3) {
        out.push({
          tone: d > 0 ? "good" : "warn",
          title: `Success rate is ${fmtPct(c.successRate)}, ${d > 0 ? "up" : "down"} ${Math.abs(d).toFixed(1)} points`,
          detail: `Compared with ${fmtPct(p.successRate)} in the period before.`,
        });
      }
    }
    if (p.total >= 10 && c.total > 0) {
      const g = ((c.total - p.total) / p.total) * 100;
      if (Math.abs(g) >= 25) out.push({ tone: "info", title: `Volume is ${g > 0 ? "up" : "down"} ${Math.abs(g).toFixed(0)}%`, detail: `${fmtNum(c.total)} runs now, ${fmtNum(p.total)} before.` });
    }
    if (c.automationRate !== null && c.success >= 10) {
      out.push({
        tone: c.automationRate >= 90 ? "good" : "info",
        title: `${fmtPct(c.automationRate)} of successful runs needed no one to step in`,
        detail: "Entering a code the customer receives doesn't count; fixing a step or taking over the browser does.",
      });
    }
    if (c.queueWaitP50Ms !== null && c.queueWaitP50Ms > 60_000) {
      out.push({ tone: "warn", title: `Runs wait ${fmtDuration(c.queueWaitP50Ms)} in the queue before starting`, detail: "A typical run is picked up faster than this; the workers may be saturated." });
    }
  }
  if (services) {
    const sized = services.filter((s) => s.total >= 10 && s.successRate !== null);
    const worst = [...sized].sort((a, b) => (a.successRate ?? 100) - (b.successRate ?? 100))[0];
    if (worst && (worst.successRate ?? 100) < 80) {
      out.push({ tone: "warn", title: `${worst.name} is the weakest service at ${fmtPct(worst.successRate)} success`, detail: `${fmtNum(worst.failed)} of ${fmtNum(worst.total)} runs failed.` });
    }
    const dropped = sized.filter((s) => s.previousSuccessRate !== null && (s.successRate ?? 0) - (s.previousSuccessRate ?? 0) <= -10).sort((a, b) => (a.successRate ?? 0) - (a.previousSuccessRate ?? 0) - ((b.successRate ?? 0) - (b.previousSuccessRate ?? 0)))[0];
    if (dropped) {
      out.push({ tone: "warn", title: `${dropped.name} dropped ${((dropped.previousSuccessRate ?? 0) - (dropped.successRate ?? 0)).toFixed(0)} points`, detail: `From ${fmtPct(dropped.previousSuccessRate)} to ${fmtPct(dropped.successRate)}.` });
    }
  }
  if (f && f.total >= 5 && f.causes[0]) {
    const top = f.causes[0];
    out.push({ tone: "warn", title: `${top.label} causes ${fmtPct(top.share)} of failures`, detail: `${fmtNum(top.count)} of ${fmtNum(f.total)} failed runs.` });
  }
  if (h && h.cells.length) {
    const byHour = new Map<number, number>();
    const byDay = new Map<number, number>();
    for (const c of h.cells) {
      byHour.set(c.hour, (byHour.get(c.hour) ?? 0) + c.total);
      byDay.set(c.day, (byDay.get(c.day) ?? 0) + c.total);
    }
    const peakHour = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0];
    const peakDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
    if (peakHour && peakDay) {
      const hh = peakHour[0];
      const label = `${hh % 12 === 0 ? 12 : hh % 12}${hh < 12 ? "am" : "pm"}`;
      out.push({ tone: "info", title: `Busiest around ${label}, and on ${DAY_NAMES[peakDay[0]]}s`, detail: "Indian time, across the selected period." });
    }
  }
  if (funnel && funnel.totals.orders >= 10) {
    const t = funnel.totals;
    const expired = (t.expired / t.orders) * 100;
    if (expired >= 20) out.push({ tone: "warn", title: `${fmtPct(expired)} of paid orders expired before the customer finished`, detail: `${fmtNum(t.expired)} of ${fmtNum(t.orders)}. Earlier or more reminders may recover some.` });
    if (t.recoveredByReminder > 0) out.push({ tone: "good", title: `${fmtNum(t.recoveredByReminder)} customers started only after a reminder`, detail: "Reminders are earning their keep." });
  }
  return out.slice(0, 8);
}

const TONE_DOT: Record<Insight["tone"], string> = { good: "bg-ok", warn: "bg-warn", info: "bg-[var(--c-active)]" };
const TONE_WORD: Record<Insight["tone"], string> = { good: "Good news", warn: "Worth a look", info: "Good to know" };

export function InsightsPanel({ insights, loading }: { insights: Insight[]; loading: boolean }) {
  return (
    <Card title="What stands out" subtitle="Written from the numbers on this page" dim={loading}>
      {insights.length === 0 ? (
        <p className="text-sm text-text-muted py-4">{loading ? "Reading the numbers…" : "Nothing unusual in this period."}</p>
      ) : (
        <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
          {insights.map((i, n) => (
            <li key={n} className="flex gap-3">
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${TONE_DOT[i.tone]}`} aria-hidden />
              <div className="min-w-0">
                <p className="text-sm text-text-primary leading-snug"><span className="sr-only">{TONE_WORD[i.tone]}: </span>{i.title}</p>
                {i.detail && <p className="text-xs text-text-muted mt-0.5">{i.detail}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------- services ----------

type SortKey = "total" | "successRate" | "durationP50Ms" | "automationRate";

const GRID = "md:grid-cols-[minmax(190px,1.5fr)_150px_74px_minmax(190px,1.3fr)_minmax(170px,1fr)]";

export function ServicesPanel({ rows, loading, error, filters, onToggle }: { rows: ServiceRow[] | undefined; loading: boolean; error: string | null; filters: Filters; onToggle: (id: string) => void }) {
  const [sort, setSort] = useState<SortKey>("total");
  const sorted = useMemo(() => {
    const r = [...(rows ?? [])];
    return r.sort((a, b) => (sort === "durationP50Ms" ? (a[sort] ?? Infinity) - (b[sort] ?? Infinity) : ((b[sort] ?? -1) as number) - ((a[sort] ?? -1) as number)));
  }, [rows, sort]);
  const slowest = Math.max(...(rows ?? []).map((r) => r.durationP95Ms ?? 0), 1);
  const head = (key: SortKey, label: string) => (
    <button onClick={() => setSort(key)} className={`uppercase tracking-wider hover:text-text-primary transition-colors ${sort === key ? "text-signal" : ""}`} aria-label={`Sort by ${label}`}>
      {label}{sort === key ? " ↓" : ""}
    </button>
  );
  return (
    <Card title="Services" subtitle="How each workflow is doing · select one to focus the whole page on it" dim={loading} error={error}>
      {!rows ? (
        <Skeleton className="h-56" />
      ) : sorted.length === 0 ? (
        <p className="text-sm text-text-muted py-6 text-center">No runs in this period.</p>
      ) : (
        <div className="-mx-2">
          <div className={`hidden md:grid ${GRID} gap-x-5 px-3 pb-2 text-[10px] font-mono text-text-dim`}>
            <span>SERVICE</span>
            <span>VOLUME</span>
            <span className="text-right">{head("total", "RUNS")}</span>
            <span>{head("successRate", "SUCCESS")}</span>
            <span>{head("durationP50Ms", "TIME TAKEN")}</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {sorted.map((s, rank) => {
              const on = filters.workflowId.includes(s.workflowId);
              const delta = s.successRate !== null && s.previousSuccessRate !== null ? s.successRate - s.previousSuccessRate : null;
              const rateColor = s.successRate === null ? C.cancelled : s.successRate >= 85 ? C.success : s.successRate >= 60 ? C.accent : C.failed;
              const p50 = s.durationP50Ms ?? 0;
              const p95 = s.durationP95Ms ?? 0;
              return (
                <li key={s.workflowId}>
                  <button
                    onClick={() => onToggle(s.workflowId)}
                    aria-pressed={on}
                    className={`w-full text-left grid grid-cols-1 ${GRID} gap-x-5 gap-y-2 items-center rounded-xl border px-3 py-3 transition-colors ${on ? "border-signal/50 bg-signal/10" : "border-transparent bg-ink-faint/60 hover:bg-ink-raised/70 hover:border-ink-line"}`}
                  >
                    {/* who */}
                    <span className="flex items-center gap-3 min-w-0">
                      <span className={`w-6 h-6 rounded-md text-[11px] font-mono flex items-center justify-center shrink-0 ${rank === 0 ? "bg-signal/20 text-signal" : "bg-ink-raised text-text-dim"}`}>{rank + 1}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-text-primary truncate">{s.name}</span>
                        <span className="block text-[11px] text-text-dim truncate">last run {ago(s.lastRunAt)}{s.automationRate !== null ? ` · ${fmtPct(s.automationRate)} hands-free` : ""}</span>
                      </span>
                    </span>
                    {/* volume line */}
                    <span className="hidden md:block" aria-hidden><Sparkline values={s.trend} width={150} height={34} color={C.active} /></span>
                    {/* runs */}
                    <span className="font-display text-xl font-semibold text-text-primary tabular-nums md:text-right">
                      {fmtNum(s.total)}<span className="md:hidden text-xs font-body font-normal text-text-muted"> runs</span>
                    </span>
                    {/* success */}
                    <span className="min-w-0" title={`${s.success} success · ${s.failed} failed · ${s.cancelled} cancelled`}>
                      <span className="flex items-baseline justify-between gap-2 mb-1.5">
                        <span className="font-display text-lg font-semibold tabular-nums" style={{ color: rateColor }}>{fmtPct(s.successRate)}</span>
                        <span className={`font-mono text-[11px] ${delta === null || Math.abs(delta) < 1 ? "text-text-dim" : delta > 0 ? "text-ok" : "text-danger"}`}>
                          {delta === null || Math.abs(delta) < 1 ? "steady" : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(0)} pts`}
                        </span>
                      </span>
                      <span className="flex h-2 rounded-full overflow-hidden gap-[2px] bg-ink-raised">
                        <span style={{ width: `${(s.success / Math.max(1, s.total)) * 100}%`, background: C.success }} />
                        <span style={{ width: `${(s.cancelled / Math.max(1, s.total)) * 100}%`, background: C.cancelled }} />
                        <span style={{ width: `${(s.failed / Math.max(1, s.total)) * 100}%`, background: C.failed }} />
                      </span>
                    </span>
                    {/* time taken: typical to slowest-1-in-20 on one shared scale */}
                    <span className="min-w-0">
                      <span className="flex items-baseline justify-between text-[11px] mb-1.5">
                        <span className="text-text-muted">typical <span className="font-mono text-text-primary">{fmtDuration(s.durationP50Ms)}</span></span>
                        <span className="text-text-muted">slow <span className="font-mono text-text-primary">{fmtDuration(s.durationP95Ms)}</span></span>
                      </span>
                      <span className="relative block h-2 rounded-full bg-ink-raised">
                        <span className="absolute top-0 bottom-0 rounded-full" style={{ left: `${(p50 / slowest) * 100}%`, width: `${Math.max(1.5, ((p95 - p50) / slowest) * 100)}%`, background: "var(--c-active)", opacity: 0.45 }} />
                        <span className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full -ml-1.5 border-2" style={{ left: `${(p50 / slowest) * 100}%`, background: "var(--c-active)", borderColor: "var(--c-surface)" }} />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ---------- failures ----------

export function FailuresPanel({ data, loading, error, filters, onPickCause }: { data: Failures | undefined; loading: boolean; error: string | null; filters: Filters; onPickCause: (key: string) => void }) {
  // The five biggest causes get an identity colour; everything smaller is folded into one neutral "Other".
  const slices: Slice[] = useMemo(() => {
    if (!data) return [];
    const top = data.causes.slice(0, CAUSE_COLORS.length);
    const rest = data.causes.slice(CAUSE_COLORS.length).reduce((a, c) => a + c.count, 0);
    return [
      ...top.map((c, i) => ({ key: c.key, label: c.label, value: c.count, color: CAUSE_COLORS[i] })),
      ...(rest > 0 ? [{ key: "__other", label: "Other causes", value: rest, color: OTHER_COLOR }] : []),
    ];
  }, [data]);

  return (
    <Card title="Why runs fail" subtitle={data ? `${fmtNum(data.total)} failed runs · select a cause to filter the page` : undefined} dim={loading} error={error} className="h-full">
      {!data ? (
        <Skeleton className="h-64" />
      ) : data.total === 0 ? (
        <p className="text-sm text-text-muted py-10 text-center">No failures in this period.</p>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-8">
          <Donut slices={slices} centerTop={fmtNum(data.total)} centerBottom="failed runs" active={filters.failure} onPick={(k) => k !== "__other" && onPickCause(k)} />
          <ul className="flex-1 min-w-0 w-full flex flex-col gap-1.5">
            {slices.map((sl) => {
              const on = filters.failure.includes(sl.key);
              const c = data.causes.find((x) => x.key === sl.key);
              return (
                <li key={sl.key}>
                  <button
                    disabled={sl.key === "__other"}
                    onClick={() => onPickCause(sl.key)}
                    aria-pressed={on}
                    title={c ? `Last seen ${ago(c.lastSeen)}` : undefined}
                    className={`w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${on ? "bg-signal/10" : "hover:bg-ink-raised/60"} disabled:cursor-default disabled:hover:bg-transparent`}
                  >
                    <span className="w-3 h-3 rounded-[4px] shrink-0" style={{ background: sl.color }} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-text-primary truncate">{sl.label}</span>
                        <span className="font-mono text-xs shrink-0 text-text-primary tabular-nums">{fmtNum(sl.value)} <span className="text-text-muted">{fmtPct((sl.value / data.total) * 100)}</span></span>
                      </span>
                      <span className="mt-1.5 block h-1.5 rounded-full bg-ink-faint overflow-hidden">
                        <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${(sl.value / data.causes[0].count) * 100}%`, background: sl.color }} />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function FailureDetailsPanel({ data, loading }: { data: Failures | undefined; loading: boolean }) {
  return (
    <Card title="Behind the failures" subtitle="Where runs stop, and what the official website said" dim={loading} className="h-full">
      {!data ? (
        <Skeleton className="h-64" />
      ) : data.total === 0 ? (
        <p className="text-sm text-text-muted py-10 text-center">Nothing to show.</p>
      ) : (
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="text-[11px] font-mono uppercase tracking-wider text-text-dim mb-3">Steps where runs stop most</h3>
            {data.steps.length === 0 ? (
              <p className="text-sm text-text-muted">No step data.</p>
            ) : (
              <ol className="flex flex-col gap-2.5">
                {data.steps.slice(0, 5).map((st, i) => (
                  <li key={`${st.workflow}-${st.stepOrder}`} className="flex items-center gap-3">
                    <span className="w-5 text-[11px] font-mono text-text-dim text-right">{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-text-primary truncate">{st.workflow} <span className="text-text-muted">· step {st.stepOrder}</span></span>
                      {st.what && <span className="block text-[11px] text-text-dim truncate">{st.what}</span>}
                      <span className="mt-1 block h-1 rounded-full bg-ink-faint overflow-hidden">
                        <span className="block h-full rounded-full" style={{ width: `${(st.count / data.steps[0].count) * 100}%`, background: "var(--c-failed)" }} />
                      </span>
                    </span>
                    <span className="font-mono text-xs text-text-primary tabular-nums">{st.count}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          {data.websiteSaid.length > 0 && (
            <div>
              <h3 className="text-[11px] font-mono uppercase tracking-wider text-text-dim mb-3">What the official website said</h3>
              <ul className="flex flex-col gap-2">
                {data.websiteSaid.slice(0, 5).map((w) => (
                  <li key={w.text} className="flex items-start justify-between gap-3 rounded-lg bg-ink-faint/70 px-3 py-2">
                    <span className="text-[13px] text-text-muted leading-snug">&ldquo;{w.text}&rdquo;</span>
                    <span className="font-mono text-xs text-text-primary shrink-0 rounded-full bg-ink-raised px-2 py-0.5">{w.count}×</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.savedSignInFailures > 0 && (
            <p className="text-xs text-text-muted rounded-lg border border-warn/25 bg-warn/5 px-3 py-2">
              {fmtNum(data.savedSignInFailures)} of these began from a saved sign-in, which may have expired.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------- people ----------

const INTERVENTION_LABEL: Record<string, string> = {
  input_required: "Code entered (OTP or CAPTCHA)",
  manual_takeover: "A step needed fixing by hand",
  human_control: "Someone took over the browser",
};

export function HumanPanel({ data, overview, loading, error }: { data: HumanEffort | undefined; overview: Overview | undefined; loading: boolean; error: string | null }) {
  const c = overview?.current;
  return (
    <Card title="Human effort" subtitle="How often a person had to step in, and how long it took" dim={loading} error={error}>
      {!data ? (
        <Skeleton className="h-44" />
      ) : (
        <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10">
          <div className="grid grid-cols-3 gap-3 text-center lg:w-[440px] shrink-0">
            {[
              { label: "Prompts", value: fmtNum(c?.interventions) },
              { label: "CAPTCHAs auto-solved", value: fmtNum(c?.captchasSolved) },
              { label: "AI fallbacks", value: fmtNum(c?.fallbacksUsed) },
            ].map((x) => (
              <div key={x.label} className="rounded-lg bg-ink-faint py-2.5">
                <div className="font-display text-xl font-semibold text-text-primary tabular-nums">{x.value}</div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-text-dim mt-0.5">{x.label}</div>
              </div>
            ))}
          </div>
          {data.byType.length === 0 ? (
            <p className="text-sm text-text-muted text-center">No one needed to step in.</p>
          ) : (
            <ul className="flex-1 grid gap-x-8 gap-y-4 md:grid-cols-3">
              {data.byType.map((t) => (
                <li key={t.type} className="rounded-lg bg-ink-faint/60 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-text-primary">{INTERVENTION_LABEL[t.type] ?? t.type}</span>
                    <span className="font-mono text-xs text-text-primary">{fmtNum(t.total)}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                    <span>typical wait <span className="font-mono text-text-primary">{fmtDuration(t.waitP50Ms)}</span></span>
                    <span>slowest 1 in 20 <span className="font-mono text-text-primary">{fmtDuration(t.waitP95Ms)}</span></span>
                    {t.timedOut > 0 && <span className="text-warn">{fmtNum(t.timedOut)} timed out</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------- customer funnel ----------

const SERVICE_NAME: Record<string, string> = { abha: "ABHA card", gstin: "GSTIN verification" };
const serviceName = (k: string) => SERVICE_NAME[k] ?? k.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());

export function FunnelPanel({ data, loading, error }: { data: Funnel | undefined; loading: boolean; error: string | null }) {
  const t = data?.totals;
  return (
    <Card title="Customer journey" subtitle="From a paid order to a finished run" dim={loading} error={error} className="h-full">
      {!data || !t ? (
        <Skeleton className="h-72" />
      ) : t.orders === 0 ? (
        <p className="text-sm text-text-muted py-10 text-center">No paid orders in this period.</p>
      ) : (
        <div className="flex flex-col gap-6">
          <TaperedFunnel
            stages={[
              { label: "Paid orders", value: t.orders },
              { label: "Tapped Start", value: t.started },
              { label: "Completed", value: t.completed },
            ]}
          />
          <LeakBar
            of={t.orders - t.completed}
            parts={[
              { label: "Expired unfinished", value: t.expired, color: "var(--c-accent)" },
              { label: "Failed all tries", value: t.failed, color: "var(--c-failed)" },
              { label: "Still waiting", value: t.waiting, color: "var(--c-active)" },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-ink-faint/70 px-3 py-2.5">
              <div className="font-display text-xl font-semibold text-text-primary tabular-nums">{fmtNum(t.linkSent)}</div>
              <div className="text-[11px] text-text-muted">links sent by us on WhatsApp</div>
            </div>
            <div className="rounded-lg bg-ink-faint/70 px-3 py-2.5">
              <div className={`font-display text-xl font-semibold tabular-nums ${t.recoveredByReminder ? "text-ok" : "text-text-primary"}`}>{fmtNum(t.recoveredByReminder)}</div>
              <div className="text-[11px] text-text-muted">started only after a reminder</div>
            </div>
          </div>
          {data.services.length > 1 && (
            <table className="w-full text-xs">
              <thead className="text-text-dim font-mono uppercase text-[10px]">
                <tr><th className="text-left font-medium py-1">Service</th><th className="text-right font-medium">Orders</th><th className="text-right font-medium">Completed</th><th className="text-right font-medium">Time to start</th></tr>
              </thead>
              <tbody>
                {data.services.map((s) => (
                  <tr key={s.service} className="border-t border-ink-line/60">
                    <td className="py-1.5 text-text-primary">{serviceName(s.service)}</td>
                    <td className="text-right font-mono">{fmtNum(s.orders)}</td>
                    <td className="text-right font-mono">{fmtPct(s.completionRate)}</td>
                    <td className="text-right font-mono text-text-muted">{fmtDuration(s.startDelayP50Ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------- the runs behind the charts ----------

export function RunsPanel({ query, enabled }: { query: string; enabled: boolean }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<RunsPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // A new slice starts again at page 1.
  useEffect(() => setPage(1), [query, pageSize]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setBusy(true);
    api
      .get<RunsPage>(`/analytics/runs?${query}&page=${page}&pageSize=${pageSize}`)
      .then((p) => {
        if (!alive) return;
        setData(p);
        setError(null);
      })
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : "Could not load runs"))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [query, enabled, page, pageSize]);

  // The export covers the whole slice, not just the page on screen.
  async function exportCsv() {
    setExporting(true);
    try {
      const rows: RunRow[] = [];
      for (let p = 1; p <= 20; p++) {
        const r = await api.get<RunsPage>(`/analytics/runs?${query}&page=${p}&pageSize=200`);
        rows.push(...r.items);
        if (rows.length >= r.total) break;
      }
      const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const head = ["Run", "Started", "Service", "Status", "Trigger", "Duration (s)", "Queue wait (s)", "Failure cause", "Prompts", "Result", "Application"];
      const lines = rows.map((r) =>
        [r.id, r.createdAt, r.workflow, r.status, r.trigger, r.durationMs === null ? "" : Math.round(r.durationMs / 1000), r.queueMs === null ? "" : Math.round(r.queueMs / 1000), r.failure?.label ?? "", r.interventions, r.result?.label ?? "", r.application?.status ?? ""].map(cell).join(","),
      );
      const url = URL.createObjectURL(new Blob([[head.map(cell).join(","), ...lines].join("\n")], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `autoflow-runs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not export");
    } finally {
      setExporting(false);
    }
  }

  const rows = data?.items ?? [];
  return (
    <Card
      title="Runs"
      subtitle={data ? `${fmtNum(data.total)} runs match these filters · newest first` : undefined}
      dim={busy && !!data}
      error={error}
      actions={data && data.total > 0 && <button onClick={exportCsv} disabled={exporting} className="btn-ghost !py-1 !text-xs disabled:opacity-50">{exporting ? "Preparing…" : "Export CSV"}</button>}
    >
      {!data ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-muted py-8 text-center">No runs match these filters.</p>
      ) : (
        <>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-text-dim border-b border-ink-line">
                  {["Started", "Service", "Status", "Took", "Why it failed / result", "Prompts", "Trigger"].map((h) => (
                    <th key={h} className="font-medium py-2 pr-4 first:pl-1">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    onClick={() => router.push(`/runs/${r.id}`)}
                    onKeyDown={(e) => e.key === "Enter" && router.push(`/runs/${r.id}`)}
                    className="border-b border-ink-line/60 last:border-0 cursor-pointer hover:bg-ink-raised/60 focus:bg-ink-raised/60 outline-none"
                  >
                    <td className="py-2.5 pr-4 pl-1 text-text-muted whitespace-nowrap text-xs font-mono">{fmtWhen(r.createdAt)}</td>
                    <td className="pr-4 text-text-primary">
                      <Link href={`/runs/${r.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-signal">{r.workflow}</Link>
                    </td>
                    <td className="pr-4"><StatusBadge status={r.status as RunStatus} /></td>
                    <td className="pr-4 font-mono text-xs tabular-nums text-text-muted">{fmtDuration(r.durationMs)}</td>
                    <td className="pr-4 text-xs max-w-[300px] truncate" title={r.errorMessage ?? r.result?.label ?? ""}>
                      {r.failure ? <span className="text-danger">{r.failure.label}</span> : r.result ? <span className="text-text-muted">{r.result.label}</span> : <span className="text-text-dim">—</span>}
                    </td>
                    <td className="pr-4 font-mono text-xs tabular-nums text-text-muted">{r.interventions || "—"}</td>
                    <td className="pr-1 text-xs text-text-muted capitalize">{r.trigger}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pt-4 mt-1 border-t border-ink-line">
            <Pagination page={page} pageSize={pageSize} total={data.total} onPage={setPage} onPageSize={setPageSize} sizes={[10, 25, 50]} />
          </div>
        </>
      )}
    </Card>
  );
}
