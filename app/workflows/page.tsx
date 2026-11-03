"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/PageHeader";
import { SearchBox, ViewToggle, useViewMode } from "@/components/ViewToggle";
import { api, ApiError } from "@/lib/api";
import { ago, fmtDuration, fmtNum, fmtPct } from "@/lib/analytics";
import { Workflow, TriggerType, StepType } from "@/lib/types";

// What the last 30 days looked like for a workflow (from the analytics service). Optional: if it can't be
// loaded the cards simply show no numbers.
interface Stats {
  total: number;
  successRate: number | null;
  durationP50Ms: number | null;
  lastRunAt: string;
}

type StatusFilter = "all" | "active" | "inactive";
type SortKey = "edited" | "name" | "runs" | "success";

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: "edited", label: "Recently edited" },
  { id: "name", label: "Name A–Z" },
  { id: "runs", label: "Most runs" },
  { id: "success", label: "Lowest success first" },
];

// Each workflow gets a stable accent colour from its name, so a card is recognisable at a glance.
const ACCENTS = ["#E8A33D", "#3987E5", "#199E70", "#9085E9", "#E66767", "#D55181", "#5CB8C9"];
function accentOf(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

export default function WorkflowsPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const { readOnly } = useAuth(); // Observers can look but not run, copy, delete or create
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [stats, setStats] = useState<Map<string, Stats>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setView] = useViewMode("workflows", "grid");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("edited");

  useEffect(() => {
    if (!user) return;
    api
      .get<Workflow[]>("/workflows")
      .then(setWorkflows)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load workflows"));
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86_400_000);
    api
      .get<Array<Stats & { workflowId: string }>>(`/analytics/services?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then((rows) => setStats(new Map(rows.map((r) => [r.workflowId, r]))))
      .catch(() => {});
  }, [user]);

  async function runNow(id: string) {
    setBusyId(id);
    try {
      const run = await api.post<{ _id: string }>(`/workflows/${id}/run`);
      router.push(`/runs/${run._id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start run");
    } finally {
      setBusyId(null);
    }
  }

  async function duplicate(id: string) {
    setBusyId(id);
    try {
      const copy = await api.post<Workflow>(`/workflows/${id}/duplicate`);
      setWorkflows((prev) => (prev ? [copy, ...prev] : [copy]));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not duplicate workflow");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this workflow? Run history is kept, but it will no longer run.")) return;
    setBusyId(id);
    try {
      await api.delete(`/workflows/${id}`);
      setWorkflows((prev) => (prev ? prev.filter((w) => w._id !== id) : prev));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete workflow");
    } finally {
      setBusyId(null);
    }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (workflows ?? []).filter(
      (w) =>
        (status === "all" || (status === "active" ? w.isActive : !w.isActive)) &&
        (!q || w.name.toLowerCase().includes(q) || (w.description ?? "").toLowerCase().includes(q)),
    );
    const s = (w: Workflow) => stats.get(w._id);
    return list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "runs") return (s(b)?.total ?? 0) - (s(a)?.total ?? 0);
      if (sort === "success") return (s(a)?.successRate ?? 101) - (s(b)?.successRate ?? 101);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [workflows, stats, query, status, sort]);

  if (authLoading || !user) return null;

  const total = workflows?.length ?? 0;
  const activeCount = (workflows ?? []).filter((w) => w.isActive).length;
  const runs30 = [...stats.values()].reduce((a, s) => a + s.total, 0);
  const actions = { runNow, duplicate, remove, busyId, readOnly };

  return (
    <div>
      <PageHeader
        eyebrow="Dashboard"
        title="Workflows"
        actions={
          readOnly ? undefined : (
            <>
              <Link href="/workflows/record" className="btn-ghost">
                Record instead
              </Link>
              <Link
                href="/workflows/new"
                className="rounded-md bg-signal text-ink font-semibold text-sm px-4 py-2 hover:bg-signal-glow transition-colors"
              >
                + New workflow
              </Link>
            </>
          )
        }
      />

      <div className="p-8 max-w-[1600px]">
        {error && (
          <p className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-md px-3 py-2 mb-4">{error}</p>
        )}

        {workflows !== null && total > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-text-muted mb-5">
              <span><span className="font-display font-semibold text-text-primary tabular-nums">{total}</span> workflows</span>
              <span><span className="font-display font-semibold text-ok tabular-nums">{activeCount}</span> active</span>
              {runs30 > 0 && (
                <span><span className="font-display font-semibold text-text-primary tabular-nums">{fmtNum(runs30)}</span> runs in the last 30 days</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-6">
              <SearchBox value={query} onChange={setQuery} placeholder="Search workflows…" />
              <div className="inline-flex rounded-md border border-ink-line bg-ink-panel p-0.5" role="group" aria-label="Status">
                {(["all", "active", "inactive"] as StatusFilter[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    aria-pressed={status === s}
                    className={`px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors ${
                      status === s ? "bg-signal/15 text-signal" : "text-text-muted hover:text-text-primary hover:bg-ink-raised"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <select className="input !py-1.5 !text-xs" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by">
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              <div className="ml-auto flex items-center gap-3">
                {shown.length !== total && <span className="text-xs text-text-dim">Showing {shown.length} of {total}</span>}
                <ViewToggle value={view} onChange={setView} />
              </div>
            </div>
          </>
        )}

        {workflows === null && <GridSkeleton view={view} />}
        {workflows !== null && total === 0 && <EmptyState readOnly={readOnly} />}
        {workflows !== null && total > 0 && shown.length === 0 && (
          <div className="border border-dashed border-ink-line rounded-xl p-12 text-center text-text-muted text-sm">
            No workflows match &ldquo;{query || status}&rdquo;.{" "}
            <button className="text-signal hover:underline" onClick={() => { setQuery(""); setStatus("all"); }}>Clear</button>
          </div>
        )}

        {workflows !== null && shown.length > 0 &&
          (view === "grid" ? (
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(310px,1fr))]" data-testid="workflow-grid">
              {shown.map((wf) => (
                <WorkflowCard key={wf._id} wf={wf} stats={stats.get(wf._id)} {...actions} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2" data-testid="workflow-list">
              {shown.map((wf) => (
                <WorkflowRow key={wf._id} wf={wf} stats={stats.get(wf._id)} {...actions} />
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

interface CardActions {
  runNow: (id: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  busyId: string | null;
  readOnly: boolean;
}

// ---------- pieces ----------

const STEP_TONE: Partial<Record<StepType, string>> = {
  [StepType.AWAIT_INPUT]: "var(--c-accent)", // waits for a code
  [StepType.DECIDE]: "var(--c-active)", // gives a verdict
  [StepType.EXTRACT]: "var(--c-success)", // reads data
};

/** The workflow's steps as a row of small segments: asks-for-code amber, verdict blue, read-data green. */
function StepStrip({ wf }: { wf: Workflow }) {
  const max = 18;
  const steps = wf.steps.slice(0, max);
  const asks = wf.steps.some((s) => s.type === StepType.AWAIT_INPUT);
  const decides = wf.steps.some((s) => s.type === StepType.DECIDE);
  return (
    <div title={`${wf.steps.length} steps${asks ? " · asks for a code" : ""}${decides ? " · gives a verdict" : ""}`}>
      <div className="flex items-center gap-[3px] h-1.5">
        {steps.map((s) => (
          <span key={s.order} className="flex-1 h-full rounded-full min-w-[3px]" style={{ background: STEP_TONE[s.type] ?? "var(--c-cancelled)", opacity: STEP_TONE[s.type] ? 1 : 0.35 }} />
        ))}
        {wf.steps.length > max && <span className="text-[9px] font-mono text-text-dim pl-1">+{wf.steps.length - max}</span>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] font-mono text-text-dim">
        <span>{wf.steps.length} step{wf.steps.length === 1 ? "" : "s"}</span>
        {asks && <span className="text-warn">asks for a code</span>}
        {decides && <span style={{ color: "var(--c-active)" }}>gives a verdict</span>}
      </div>
    </div>
  );
}

function Ring({ value, size = 38 }: { value: number | null; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const pct = value ?? 0;
  const color = value === null ? "var(--c-cancelled)" : value >= 85 ? "var(--c-success)" : value >= 60 ? "var(--c-accent)" : "var(--c-failed)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={value === null ? "No finished runs yet" : `${fmtPct(value)} of finished runs succeeded`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-grid)" strokeWidth="3.5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: "stroke-dashoffset .6s ease" }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-text-primary">{value === null ? "–" : Math.round(value)}</span>
    </div>
  );
}

function Tile({ name, accent }: { name: string; accent: string }) {
  return (
    <span
      className="w-10 h-10 rounded-xl flex items-center justify-center font-display font-semibold text-base shrink-0 border"
      style={{ background: `${accent}1f`, color: accent, borderColor: `${accent}55` }}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function Badges({ wf }: { wf: Workflow }) {
  const label = wf.trigger.type === TriggerType.MANUAL ? "Manual" : wf.trigger.type === TriggerType.CRON ? "Scheduled" : "Webhook";
  const notWired = wf.trigger.type !== TriggerType.MANUAL;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider ${wf.isActive ? "text-ok" : "text-text-dim"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${wf.isActive ? "bg-ok" : "bg-text-dim"}`} aria-hidden />
        {wf.isActive ? "Active" : "Inactive"}
      </span>
      <span className="text-ink-line">·</span>
      <span className="text-[10px] font-mono uppercase tracking-wider text-text-dim" title={notWired ? "Not yet wired up to fire automatically" : undefined}>
        {label}{notWired && "*"}
      </span>
      <span className="text-ink-line">·</span>
      <span className="text-[10px] font-mono text-text-dim">v{wf.version}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-mono uppercase tracking-wider text-text-dim">{label}</div>
      <div className="text-sm font-medium text-text-primary tabular-nums truncate">{value}</div>
    </div>
  );
}

function MoreMenu({ id, duplicate, remove, busyId, readOnly }: { id: string } & CardActions) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const item = "w-full text-left px-3 py-2 text-xs hover:bg-ink-panel disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div ref={ref} className="relative z-10">
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label="More actions" className="btn-ghost !px-2 !py-1.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 bottom-full mb-1.5 w-40 rounded-lg border border-ink-line bg-ink-raised shadow-panel py-1 z-30">
          <button role="menuitem" className={item} disabled={busyId === id || readOnly} onClick={() => { setOpen(false); duplicate(id); }}>Duplicate</button>
          <button role="menuitem" className={`${item} text-danger`} disabled={busyId === id || readOnly} onClick={() => { setOpen(false); remove(id); }}>Delete</button>
        </div>
      )}
    </div>
  );
}

function RunButton({ id, runNow, busyId, readOnly }: { id: string } & CardActions) {
  return (
    <button
      type="button"
      onClick={() => runNow(id)}
      disabled={busyId === id || readOnly}
      title={readOnly ? "Observers can't start runs" : "Start a run now"}
      className="relative z-10 inline-flex items-center gap-1.5 rounded-md bg-signal/15 text-signal border border-signal/30 px-3 py-1.5 text-xs font-semibold hover:bg-signal hover:text-ink transition-colors disabled:opacity-40 disabled:hover:bg-signal/15 disabled:hover:text-signal"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4.5v15a1 1 0 001.5.86l12.5-7.5a1 1 0 000-1.72L8.5 3.64A1 1 0 007 4.5z" /></svg>
      {busyId === id ? "Starting…" : "Run"}
    </button>
  );
}

function WorkflowCard({ wf, stats, ...a }: { wf: Workflow; stats?: Stats } & CardActions) {
  const accent = accentOf(wf.name);
  return (
    <article
      data-testid="workflow-card"
      className={`group relative flex flex-col rounded-xl border border-ink-line bg-ink-panel shadow-panel p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-[0_10px_30px_-12px_var(--accent)] focus-within:border-[var(--accent)] ${wf.isActive ? "" : "opacity-75"}`}
      style={{ ["--accent" as string]: `${accent}99` }}
    >
      <span className="absolute inset-x-0 top-0 h-[3px] rounded-t-xl" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} aria-hidden />
      <div className="flex items-start gap-3">
        <Tile name={wf.name} accent={accent} />
        <div className="min-w-0 flex-1">
          <h3 className="font-display font-semibold text-text-primary leading-snug truncate">
            <Link href={`/workflows/${wf._id}`} className="after:absolute after:inset-0 after:rounded-xl focus:outline-none">
              {wf.name}
            </Link>
          </h3>
          <Badges wf={wf} />
        </div>
        <Ring value={stats?.successRate ?? null} />
      </div>

      <p className="mt-3 text-[13px] text-text-muted leading-relaxed line-clamp-2 min-h-[3.25em]">
        {wf.description?.trim() || (wf.inputs?.length ? `Takes ${wf.inputs.map((i) => i.label || i.key).slice(0, 3).join(", ")}${wf.inputs.length > 3 ? "…" : ""}.` : "No description yet.")}
      </p>

      <div className="mt-auto pt-4"><StepStrip wf={wf} /></div>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-ink-line pt-3">
        <Stat label="Runs · 30d" value={stats ? fmtNum(stats.total) : "—"} />
        <Stat label="Typical" value={stats ? fmtDuration(stats.durationP50Ms) : "—"} />
        <Stat label="Last run" value={stats ? ago(stats.lastRunAt) : "never"} />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <RunButton id={wf._id} {...a} />
        <Link href={`/workflows/${wf._id}/runs`} className="btn-ghost !py-1.5 !text-xs relative z-10">History</Link>
        <span className="ml-auto" />
        <MoreMenu id={wf._id} {...a} />
      </div>
    </article>
  );
}

function WorkflowRow({ wf, stats, ...a }: { wf: Workflow; stats?: Stats } & CardActions) {
  const accent = accentOf(wf.name);
  return (
    <article
      data-testid="workflow-row"
      className={`group relative flex items-center gap-4 rounded-xl border border-ink-line bg-ink-panel px-4 py-3 transition-colors hover:border-[var(--accent)] ${wf.isActive ? "" : "opacity-75"}`}
      style={{ ["--accent" as string]: `${accent}99` }}
    >
      <span className="absolute left-0 inset-y-2 w-[3px] rounded-r" style={{ background: accent }} aria-hidden />
      <Tile name={wf.name} accent={accent} />
      <div className="min-w-0 flex-1 basis-60">
        <h3 className="font-display font-semibold text-text-primary truncate">
          <Link href={`/workflows/${wf._id}`} className="after:absolute after:inset-0 after:rounded-xl focus:outline-none">{wf.name}</Link>
        </h3>
        <Badges wf={wf} />
      </div>
      <div className="hidden lg:block w-56 shrink-0"><StepStrip wf={wf} /></div>
      <div className="hidden md:grid grid-cols-3 gap-5 w-[270px] shrink-0">
        <Stat label="Runs · 30d" value={stats ? fmtNum(stats.total) : "—"} />
        <Stat label="Typical" value={stats ? fmtDuration(stats.durationP50Ms) : "—"} />
        <Stat label="Last run" value={stats ? ago(stats.lastRunAt) : "never"} />
      </div>
      <Ring value={stats?.successRate ?? null} />
      <div className="flex items-center gap-2 shrink-0">
        <RunButton id={wf._id} {...a} />
        <Link href={`/workflows/${wf._id}/runs`} className="btn-ghost !py-1.5 !text-xs relative z-10">History</Link>
        <MoreMenu id={wf._id} {...a} />
      </div>
    </article>
  );
}

function EmptyState({ readOnly }: { readOnly: boolean }) {
  return (
    <div className="border border-dashed border-ink-line rounded-xl p-14 text-center">
      <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-signal/10 border border-signal/30 flex items-center justify-center">
        <span className="w-2.5 h-2.5 rounded-full bg-signal pulse-soft" />
      </div>
      <p className="font-display text-text-primary mb-1">No workflows yet</p>
      <p className="text-text-muted text-sm mb-5">
        {readOnly ? "Nothing has been built yet." : "Build your first automation — wire up steps, then run it."}
      </p>
      {!readOnly && (
        <div className="flex items-center justify-center gap-2">
          <Link href="/workflows/record" className="btn-ghost">Record instead</Link>
          <Link href="/workflows/new" className="inline-block rounded-md bg-signal text-ink font-semibold text-sm px-4 py-2 hover:bg-signal-glow transition-colors">+ New workflow</Link>
        </div>
      )}
    </div>
  );
}

function GridSkeleton({ view }: { view: "grid" | "list" }) {
  return view === "grid" ? (
    <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(310px,1fr))]">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-[300px] rounded-xl bg-ink-panel border border-ink-line animate-pulse" />
      ))}
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[72px] rounded-xl bg-ink-panel border border-ink-line animate-pulse" />
      ))}
    </div>
  );
}
