"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { ApplicationBadge } from "@/components/ApplicationBadge";
import { Pagination } from "@/components/Pagination";
import { SearchBox, ViewToggle, useViewMode } from "@/components/ViewToggle";
import { RESULT_TONE, formatDuration } from "@/components/SummaryParts";
import { api, ApiError } from "@/lib/api";
import { DEFAULT_FILTERS, ago, rangeOf, useAnalytics } from "@/lib/analytics";
import { InterventionType, RunListItem, RunStatus } from "@/lib/types";

// ---------- what the page asks for (all of it lives in the address bar, so Back returns to the same view) ----------

type Filter = "all" | "attention" | "active" | "succeeded" | "failed" | "finished";
type Range = "all" | "today" | "24h" | "7d" | "30d" | "custom";

const FILTERS: Array<{ id: Filter; label: string; statuses: RunStatus[] }> = [
  { id: "all", label: "All", statuses: [] },
  { id: "attention", label: "Needs attention", statuses: [RunStatus.PAUSED] },
  { id: "active", label: "Active", statuses: [RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.PAUSED] },
  { id: "succeeded", label: "Succeeded", statuses: [RunStatus.SUCCESS] },
  { id: "failed", label: "Failed", statuses: [RunStatus.FAILED] },
  { id: "finished", label: "Finished", statuses: [RunStatus.SUCCESS, RunStatus.FAILED, RunStatus.CANCELLED] },
];

const RANGES: Array<{ id: Range; label: string }> = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "24h", label: "24 hours" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
];

interface PageResponse {
  items: RunListItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: Partial<Record<RunStatus, number>>;
}

// The coloured edge of each card: what state the run is in, at a glance.
const EDGE: Record<RunStatus, { color: string; live: boolean }> = {
  [RunStatus.QUEUED]: { color: "var(--c-cancelled)", live: false },
  [RunStatus.RUNNING]: { color: "var(--c-accent)", live: true },
  [RunStatus.PAUSED]: { color: "#E2B94F", live: true },
  [RunStatus.SUCCESS]: { color: "var(--c-success)", live: false },
  [RunStatus.FAILED]: { color: "var(--c-failed)", live: false },
  [RunStatus.CANCELLED]: { color: "var(--c-cancelled)", live: false },
};

function windowUrl(run: RunListItem): string | null {
  if (!run.sessionKey || typeof window === "undefined") return null;
  return `${window.location.origin}/session/${run._id}/${run.sessionKey}`;
}

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const today = (offsetDays = 0) => new Date(Date.now() + 330 * 60_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

export default function SessionsPage() {
  // useSearchParams needs a Suspense boundary in the App Router
  return (
    <Suspense fallback={null}>
      <Sessions />
    </Suspense>
  );
}

function Sessions() {
  const { user, loading } = useRequireAuth();
  const { readOnly } = useAuth(); // Observers can look, but not retry
  const router = useRouter();
  const sp = useSearchParams();
  const [view, setView] = useViewMode("sessions", "grid");
  const [copied, setCopied] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filter = (FILTERS.find((f) => f.id === sp.get("f"))?.id ?? "all") as Filter;
  const range = (([...RANGES.map((r) => r.id), "custom"] as string[]).includes(sp.get("range") ?? "") ? sp.get("range") : "all") as Range;
  const from = sp.get("from") ?? undefined;
  const to = sp.get("to") ?? undefined;
  const qParam = sp.get("q") ?? "";
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = [12, 24, 48].includes(Number(sp.get("size"))) ? Number(sp.get("size")) : 12;

  const setParams = (patch: Record<string, string | undefined>, resetPage = true) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
    if (resetPage) p.delete("page");
    const s = p.toString();
    router.replace(s ? `/sessions?${s}` : "/sessions", { scroll: false });
  };

  // typing is local and lands in the URL a moment after the last key
  const [typed, setTyped] = useState(qParam);
  useEffect(() => setTyped(qParam), [qParam]);
  useEffect(() => {
    if (typed === qParam) return;
    const t = setTimeout(() => setParams({ q: typed.trim() || undefined }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  // ---- the page of runs
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const path = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (range !== "all") {
      const r = rangeOf({ ...DEFAULT_FILTERS, preset: range as never, from, to });
      p.set("from", r.from.toISOString());
      p.set("to", r.to.toISOString());
    }
    const statuses = FILTERS.find((f) => f.id === filter)!.statuses;
    if (statuses.length) p.set("status", statuses.join(","));
    if (qParam) p.set("q", qParam);
    return `/runs/page?${p.toString()}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, range, from, to, filter, qParam, tick]);
  const { data, loading: fetching, error } = useAnalytics<PageResponse>(user ? path : null, 5000);

  // past the last page (a filter shrank the list): go to the last one
  useEffect(() => {
    if (data && data.total > 0 && page > Math.ceil(data.total / pageSize)) setParams({ page: String(Math.ceil(data.total / pageSize)) }, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, page, pageSize]);

  async function retry(run: RunListItem) {
    setRetrying(run._id);
    try {
      await api.post(`/runs/${run._id}/retry`);
      setActionError(null);
      setTick((n) => n + 1); // refetch now: the new run appears at the top
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not retry the run");
    } finally {
      setRetrying(null);
    }
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
    } catch {
      window.prompt("Copy this:", text);
    }
  }

  if (loading || !user) return null;

  const items = data?.items ?? [];
  const counts = data?.counts ?? {};
  const n = (...s: RunStatus[]) => s.reduce((a, k) => a + (counts[k] ?? 0), 0);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const props = { copied, retrying, readOnly, retry, copy };
  const scopeLabel = range === "all" ? "" : range === "custom" ? ` · ${from ?? "…"} → ${to ?? "…"}` : ` · ${RANGES.find((r) => r.id === range)?.label.toLowerCase()}`;

  return (
    <div>
      <PageHeader
        eyebrow="Sessions"
        title="Live sessions"
        actions={
          <>
            <Link href="/analytics" className="btn-ghost">Analytics</Link>
            <Link href="/workflows" className="btn-ghost">Workflows</Link>
          </>
        }
      />
      <div className="p-8 max-w-[1700px]">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Tile label="Needs attention" value={n(RunStatus.PAUSED)} tone={n(RunStatus.PAUSED) ? "warn" : "idle"} pulse={n(RunStatus.PAUSED) > 0} onClick={() => setParams({ f: "attention" })} active={filter === "attention"} hint="Waiting for a code or an operator" />
          <Tile label="Running now" value={n(RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.PAUSED)} tone={n(RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.PAUSED) ? "live" : "idle"} pulse={n(RunStatus.RUNNING) > 0} onClick={() => setParams({ f: "active" })} active={filter === "active"} hint="Queued, running or waiting" />
          <Tile label={`Succeeded${scopeLabel}`} value={n(RunStatus.SUCCESS)} tone="ok" onClick={() => setParams({ f: "succeeded" })} active={filter === "succeeded"} />
          <Tile label={`Failed${scopeLabel}`} value={n(RunStatus.FAILED)} tone={n(RunStatus.FAILED) ? "bad" : "idle"} onClick={() => setParams({ f: "failed" })} active={filter === "failed"} />
        </div>

        {/* one sticky toolbar: search, dates, status, layout, page */}
        <div className="sticky top-0 z-20 -mx-8 px-8 py-3 mb-5 bg-ink/90 backdrop-blur border-y border-ink-line">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <SearchBox value={typed} onChange={setTyped} placeholder="Run ID, session ID or workflow…" wide />
            </div>
            <div className="inline-flex rounded-md border border-ink-line bg-ink-panel p-0.5" role="group" aria-label="Date range">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setParams({ range: r.id === "all" ? undefined : r.id, from: undefined, to: undefined })}
                  aria-pressed={range === r.id}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${range === r.id ? "bg-signal/15 text-signal" : "text-text-muted hover:text-text-primary hover:bg-ink-raised"}`}
                >
                  {r.label}
                </button>
              ))}
              <button
                onClick={() => setParams({ range: "custom", from: from ?? today(-7), to: to ?? today(0) })}
                aria-pressed={range === "custom"}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${range === "custom" ? "bg-signal/15 text-signal" : "text-text-muted hover:text-text-primary hover:bg-ink-raised"}`}
              >
                Custom
              </button>
            </div>
            {range === "custom" && (
              <div className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                <input type="date" className="input !py-1 !text-xs" value={from ?? ""} max={to} onChange={(e) => setParams({ from: e.target.value || undefined })} aria-label="From" />
                <span>to</span>
                <input type="date" className="input !py-1 !text-xs" value={to ?? ""} min={from} max={today(0)} onChange={(e) => setParams({ to: e.target.value || undefined })} aria-label="To" />
              </div>
            )}
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden sm:flex items-center gap-1 text-xs text-text-muted tabular-nums">
                <button className="w-7 h-7 rounded border border-ink-line hover:bg-ink-raised disabled:opacity-35" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) }, false)} aria-label="Previous page">‹</button>
                <span className="px-1">{page} / {pages}</span>
                <button className="w-7 h-7 rounded border border-ink-line hover:bg-ink-raised disabled:opacity-35" disabled={page >= pages} onClick={() => setParams({ page: String(page + 1) }, false)} aria-label="Next page">›</button>
              </span>
              <ViewToggle value={view} onChange={setView} />
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter sessions">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                data-testid={`filter-${f.id}`}
                onClick={() => setParams({ f: f.id === "all" ? undefined : f.id })}
                className={`rounded-full border px-3 py-1 text-xs font-mono transition-colors ${filter === f.id ? "border-signal/50 bg-signal/10 text-signal" : "border-ink-line text-text-muted hover:text-text-primary"}`}
              >
                {f.label}
                {f.id === "attention" && n(RunStatus.PAUSED) > 0 && <span className="ml-1.5 rounded-full bg-warn/20 text-warn px-1.5">{n(RunStatus.PAUSED)}</span>}
              </button>
            ))}
            <span className="ml-auto text-xs text-text-dim tabular-nums">{data ? `${total.toLocaleString("en-IN")} runs` : ""}</span>
          </div>
        </div>

        {(error || actionError) && <p className="text-danger text-sm mb-3">{actionError ?? error}</p>}
        {!data && !error && <Skeleton view={view} count={pageSize} />}
        {data && items.length === 0 && (
          <div className="border border-dashed border-ink-line rounded-xl p-12 text-center text-text-muted text-sm">
            {total === 0 && !qParam && range === "all" && filter === "all" ? (
              "No runs yet — start one from a workflow and it will show up here."
            ) : (
              <>
                Nothing matches{qParam ? ` “${qParam}”` : " these filters"}.{" "}
                <button className="text-signal hover:underline" onClick={() => { setTyped(""); router.replace("/sessions"); }}>Clear all</button>
              </>
            )}
          </div>
        )}

        <div className={`transition-opacity duration-150 ${fetching && data ? "opacity-60" : ""}`}>
          {view === "grid" ? (
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]" data-testid="session-list">
              {items.map((run) => <SessionCard key={run._id} run={run} {...props} />)}
            </div>
          ) : (
            <div className="flex flex-col gap-2" data-testid="session-list">
              {items.map((run) => <SessionRow key={run._id} run={run} {...props} />)}
            </div>
          )}
        </div>

        {data && total > 0 && (
          <div className="mt-6 pt-4 border-t border-ink-line">
            <Pagination page={page} pageSize={pageSize} total={total} onPage={(p) => setParams({ page: String(p) }, false)} onPageSize={(s) => setParams({ size: s === 12 ? undefined : String(s) })} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- pieces ----------

interface RowProps {
  run: RunListItem;
  copied: string | null;
  retrying: string | null;
  readOnly: boolean;
  retry: (r: RunListItem) => void;
  copy: (key: string, text: string) => void;
}

function Tile({ label, value, tone, pulse, onClick, active, hint }: { label: string; value: number; tone: "warn" | "live" | "ok" | "bad" | "idle"; pulse?: boolean; onClick: () => void; active: boolean; hint?: string }) {
  const color = { warn: "text-warn", live: "text-signal", ok: "text-ok", bad: "text-danger", idle: "text-text-primary" }[tone];
  const dot = { warn: "bg-warn", live: "bg-signal", ok: "bg-ok", bad: "bg-danger", idle: "bg-text-dim" }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={`text-left rounded-xl border bg-ink-panel shadow-panel px-4 py-3 transition-colors hover:border-signal/40 ${active ? "border-signal/50" : "border-ink-line"}`}
    >
      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-text-dim truncate">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot} ${pulse ? "pulse-soft" : ""}`} aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className={`font-display text-3xl font-semibold tabular-nums mt-1 ${color}`}>{value.toLocaleString("en-IN")}</div>
    </button>
  );
}

/** The run's id, always visible, one click to copy. The session id is in the tooltip. */
function RunId({ run, copied, copy }: Pick<RowProps, "run" | "copied" | "copy">) {
  return (
    <button
      type="button"
      data-testid="run-id"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); copy(`id-${run._id}`, run._id); }}
      title={`Click to copy the run ID${run.sessionId ? `\nSession ID: ${run.sessionId}` : ""}`}
      className="relative z-10 group/id inline-flex items-center gap-1.5 rounded-md bg-ink-faint px-2 py-1 font-mono text-[11px] text-text-muted hover:text-text-primary hover:bg-ink-raised transition-colors max-w-full"
    >
      <span className="text-text-dim">ID</span>
      <span className="truncate tracking-tight">{run._id}</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 opacity-60 group-hover/id:opacity-100">
        {copied === `id-${run._id}` ? (
          <path d="M5 12.5l4.5 4.5L19 7" stroke="var(--c-success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <>
            <rect x="8.5" y="8.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M15.5 8.5v-2a2 2 0 00-2-2h-7a2 2 0 00-2 2v7a2 2 0 002 2h2" stroke="currentColor" strokeWidth="2" />
          </>
        )}
      </svg>
    </button>
  );
}

function Chips({ run }: { run: RunListItem }) {
  const any = (run.status === RunStatus.SUCCESS && run.result) || run.application || run.fileCount > 0;
  if (!any) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {run.status === RunStatus.SUCCESS && run.result && (
        <span
          data-testid="session-result"
          data-tone={run.result.tone}
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-mono ${RESULT_TONE[run.result.tone].box} ${RESULT_TONE[run.result.tone].text}`}
        >
          <span aria-hidden>{RESULT_TONE[run.result.tone].glyph} </span>
          {run.result.label}
        </span>
      )}
      {run.application && (
        <span className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-dim">App</span>
          <ApplicationBadge application={run.application} />
        </span>
      )}
      {run.fileCount > 0 && (
        <span className="rounded-full border border-ok/30 bg-ok/10 text-ok px-2.5 py-0.5 text-[11px] font-mono">
          {run.fileCount} file{run.fileCount === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

function Awaiting({ run }: { run: RunListItem }) {
  if (run.awaiting === InterventionType.INPUT_REQUIRED) {
    return (
      <div data-testid="awaiting-input" className="flex items-center gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-1.5 text-xs text-warn">
        <span className="w-2 h-2 rounded-full bg-warn pulse-soft shrink-0" aria-hidden />
        Waiting for a code from the user
      </div>
    );
  }
  if (run.awaiting === InterventionType.MANUAL_TAKEOVER) {
    return (
      <div data-testid="awaiting-operator" className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger">
        <span className="w-2 h-2 rounded-full bg-danger pulse-soft shrink-0" aria-hidden />
        Needs an operator
      </div>
    );
  }
  return null;
}

const iconBtn = "relative z-10 w-8 h-8 rounded-md border border-ink-line text-text-muted hover:text-text-primary hover:bg-ink-raised transition-colors flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none";

function Actions({ run, copied, retrying, readOnly, retry, copy }: RowProps) {
  const url = windowUrl(run);
  const failed = run.status === RunStatus.FAILED || run.status === RunStatus.CANCELLED;
  return (
    <div className="flex items-center gap-1.5">
      <Link href={`/runs/${run._id}`} className="relative z-10 rounded-md bg-signal/15 text-signal border border-signal/30 px-3 py-1.5 text-xs font-semibold hover:bg-signal hover:text-ink transition-colors">
        Operator view
      </Link>
      {failed && (
        <button
          type="button"
          data-testid="retry-run"
          onClick={() => retry(run)}
          disabled={retrying === run._id || readOnly}
          title={readOnly ? "Observers can't retry runs" : "Start a new run with the same details"}
          className={`${iconBtn} !w-auto px-2.5 text-xs gap-1.5 hover:!text-signal hover:!border-signal/40`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M20 12a8 8 0 11-2.6-5.9M20 4v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {retrying === run._id ? "Retrying…" : "Retry"}
        </button>
      )}
      <span className="ml-auto" />
      <button type="button" data-testid="copy-link" onClick={() => url && copy(`link-${run._id}`, url)} disabled={!url} title={url ? "Copy the private link for the user" : "No link for this run"} aria-label="Copy the private link" className={iconBtn}>
        {copied === `link-${run._id}` ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12.5l4.5 4.5L19 7" stroke="var(--c-success)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        )}
      </button>
      {url && (
        <a href={url} target="_blank" rel="noreferrer" data-testid="open-window" title="Open the user's window" aria-label="Open the user's window" className={iconBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
      )}
    </div>
  );
}

const durationOf = (run: RunListItem) =>
  formatDuration(run.startedAt && run.finishedAt ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime() : undefined);

function SessionCard(props: RowProps) {
  const { run } = props;
  const edge = EDGE[run.status];
  const duration = durationOf(run);
  return (
    <article
      data-testid="session-row"
      data-run-id={run._id}
      className={`group relative flex flex-col gap-2.5 rounded-xl border bg-ink-panel shadow-panel px-4 pb-4 pt-5 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.9)] ${run.awaiting ? "border-warn/40" : "border-ink-line hover:border-ink-raised"}`}
    >
      <span className={`absolute inset-x-0 top-0 h-[3px] overflow-hidden ${edge.live ? "sweep" : ""}`} style={{ background: edge.color }} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display font-semibold text-text-primary leading-snug min-w-0 truncate">
          <Link href={`/runs/${run._id}`} className="hover:text-signal after:absolute after:inset-0 focus:outline-none">
            {run.workflowName}
          </Link>
        </h3>
        <StatusBadge status={run.status} />
      </div>
      <RunId {...props} />
      <Chips run={run} />
      <Awaiting run={run} />
      <div className="flex items-center gap-2 text-[11px] font-mono text-text-dim mt-auto pt-1">
        <span title={when(run.startedAt ?? run.createdAt)}>{ago(run.startedAt ?? run.createdAt)}</span>
        {duration && <span>· took {duration}</span>}
      </div>
      <Actions {...props} />
    </article>
  );
}

function SessionRow(props: RowProps) {
  const { run } = props;
  const edge = EDGE[run.status];
  const duration = durationOf(run);
  return (
    <article
      data-testid="session-row"
      data-run-id={run._id}
      className={`relative bg-ink-panel border rounded-xl pl-5 pr-4 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 ${run.awaiting ? "border-warn/40" : "border-ink-line"}`}
    >
      <span className="absolute left-0 inset-y-2 w-[3px] rounded-r" style={{ background: edge.color }} aria-hidden />
      <div className="min-w-0 flex-1 basis-80">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/runs/${run._id}`} className="font-display font-medium text-text-primary hover:text-signal truncate">
            {run.workflowName}
          </Link>
          <StatusBadge status={run.status} />
          <Chips run={run} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-text-dim">
          <RunId {...props} />
          <span>{when(run.startedAt ?? run.createdAt)}</span>
          {duration && <span>{duration}</span>}
          {run.awaiting === InterventionType.INPUT_REQUIRED && <span data-testid="awaiting-input" className="text-warn">● waiting for a code from the user</span>}
          {run.awaiting === InterventionType.MANUAL_TAKEOVER && <span data-testid="awaiting-operator" className="text-danger">● needs an operator</span>}
        </div>
      </div>
      <div className="w-[300px] shrink-0"><Actions {...props} /></div>
    </article>
  );
}

function Skeleton({ view, count }: { view: "grid" | "list"; count: number }) {
  const n = Math.min(count, 12);
  return view === "grid" ? (
    <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
      {Array.from({ length: n }, (_, i) => <div key={i} className="h-[170px] rounded-xl bg-ink-panel border border-ink-line animate-pulse" />)}
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      {Array.from({ length: Math.min(n, 8) }, (_, i) => <div key={i} className="h-16 rounded-xl bg-ink-panel border border-ink-line animate-pulse" />)}
    </div>
  );
}
