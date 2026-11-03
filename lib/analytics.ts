"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

// ---------- filters ----------

export type Preset = "today" | "24h" | "7d" | "30d" | "90d" | "custom";

export interface Filters {
  preset: Preset;
  from?: string; // YYYY-MM-DD, when preset = custom
  to?: string;
  workflowId: string[];
  status: string[];
  trigger: string[];
  failure: string[];
  intervened: "" | "yes" | "no";
  savedSignIn: "" | "yes" | "no";
}

export const DEFAULT_FILTERS: Filters = {
  preset: "7d",
  workflowId: [],
  status: [],
  trigger: [],
  failure: [],
  intervened: "",
  savedSignIn: "",
};

export const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: "today", label: "Today" },
  { id: "24h", label: "24 hours" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
];

const LIST_KEYS = ["workflowId", "status", "trigger", "failure"] as const;
const IST_OFFSET_MS = 330 * 60_000; // Indian time has no daylight saving

/** Start of today in Indian time, as a UTC instant. */
function istMidnight(now: number): number {
  return Math.floor((now + IST_OFFSET_MS) / 86_400_000) * 86_400_000 - IST_OFFSET_MS;
}

/** The window the filters describe. `now` is rounded down to the minute so identical views share cache entries. */
export function rangeOf(f: Filters, now = Date.now()): { from: Date; to: Date } {
  const minute = Math.floor(now / 60_000) * 60_000;
  if (f.preset === "custom" && f.from && f.to) {
    const from = new Date(new Date(f.from).getTime() - IST_OFFSET_MS);
    const to = new Date(new Date(f.to).getTime() - IST_OFFSET_MS + 86_400_000);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from < to) return { from, to };
  }
  const DAY = 86_400_000;
  const days = f.preset === "90d" ? 90 : f.preset === "30d" ? 30 : f.preset === "24h" ? 1 : 7;
  const from = f.preset === "today" ? istMidnight(minute) : minute - days * DAY;
  return { from: new Date(from), to: new Date(minute + 60_000) };
}

/** The query string every analytics endpoint takes. */
export function queryOf(f: Filters, extra: Record<string, string> = {}): string {
  const { from, to } = rangeOf(f);
  const p = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  for (const k of LIST_KEYS) if (f[k].length) p.set(k, f[k].join(","));
  if (f.intervened) p.set("intervened", f.intervened);
  if (f.savedSignIn) p.set("savedSignIn", f.savedSignIn);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

// ---------- the filters live in the address bar, so a view can be shared or bookmarked ----------

export function filtersFromParams(sp: URLSearchParams): Filters {
  const preset = (sp.get("range") as Preset) || DEFAULT_FILTERS.preset;
  const list = (k: string) => (sp.get(k) ?? "").split(",").filter(Boolean);
  const yn = (k: string): "" | "yes" | "no" => (sp.get(k) === "yes" ? "yes" : sp.get(k) === "no" ? "no" : "");
  return {
    preset: [...PRESETS.map((p) => p.id), "custom"].includes(preset) ? preset : "7d",
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    workflowId: list("workflow"),
    status: list("status"),
    trigger: list("trigger"),
    failure: list("failure"),
    intervened: yn("intervened"),
    savedSignIn: yn("signedIn"),
  };
}

export function paramsFromFilters(f: Filters): string {
  const p = new URLSearchParams();
  if (f.preset !== DEFAULT_FILTERS.preset) p.set("range", f.preset);
  if (f.preset === "custom") {
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
  }
  if (f.workflowId.length) p.set("workflow", f.workflowId.join(","));
  if (f.status.length) p.set("status", f.status.join(","));
  if (f.trigger.length) p.set("trigger", f.trigger.join(","));
  if (f.failure.length) p.set("failure", f.failure.join(","));
  if (f.intervened) p.set("intervened", f.intervened);
  if (f.savedSignIn) p.set("signedIn", f.savedSignIn);
  return p.toString();
}

export function activeFilterCount(f: Filters): number {
  return (
    f.workflowId.length + f.status.length + f.trigger.length + f.failure.length + (f.intervened ? 1 : 0) + (f.savedSignIn ? 1 : 0)
  );
}

// ---------- fetching ----------

// Answers kept for a few seconds so switching a filter back and forth (or two panels asking the same thing) is instant.
const memory = new Map<string, { at: number; data: unknown }>();
const FRESH_MS = 15_000;

export interface Fetched<T> {
  data: T | undefined;
  /** A request is in flight. With `data` already present this is a refresh: keep showing the old chart, dimmed. */
  loading: boolean;
  error: string | null;
}

/**
 * GET `path`, re-asking whenever it changes (and every `refreshMs`). The previous answer stays on screen while a
 * new one loads, so changing a filter never blanks or jumps the page. Older replies that arrive late are ignored.
 */
export function useAnalytics<T>(path: string | null, refreshMs = 0): Fetched<T> {
  const [state, setState] = useState<Fetched<T>>({ data: undefined, loading: !!path, error: null });
  const seq = useRef(0);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    const run = async (quiet: boolean) => {
      const mine = ++seq.current;
      const hit = memory.get(path);
      if (!quiet && hit && Date.now() - hit.at < FRESH_MS) {
        setState({ data: hit.data as T, loading: false, error: null });
        return;
      }
      if (!quiet) setState((s) => ({ data: hit ? (hit.data as T) : s.data, loading: true, error: null }));
      try {
        const data = await api.get<T>(path);
        if (!alive || mine !== seq.current) return;
        memory.set(path, { at: Date.now(), data });
        if (memory.size > 120) memory.delete(memory.keys().next().value as string);
        setState({ data, loading: false, error: null });
      } catch (e) {
        if (!alive || mine !== seq.current) return;
        setState((s) => ({ data: s.data, loading: false, error: e instanceof ApiError ? e.message : "Could not load this" }));
      }
    };
    run(false);
    const timer = refreshMs ? setInterval(() => run(true), refreshMs) : undefined;
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [path, refreshMs]);

  return state;
}

// ---------- response shapes ----------

export interface Kpis {
  total: number;
  success: number;
  failed: number;
  cancelled: number;
  active: number;
  successRate: number | null;
  automationRate: number | null;
  runsNeedingHelp: number;
  interventions: number;
  captchasSolved: number;
  fallbacksUsed: number;
  applicationSuccess: number;
  applicationFailed: number;
  durationP50Ms: number | null;
  durationP95Ms: number | null;
  queueWaitP50Ms: number | null;
}
export interface Overview {
  range: { from: string; to: string };
  current: Kpis;
  previous: Kpis;
}
export interface SeriesPoint {
  t: string;
  total: number;
  success: number;
  failed: number;
  cancelled: number;
  other: number;
  avgDurationMs: number | null;
}
export interface Timeseries {
  bucket: "hour" | "day" | "week";
  points: SeriesPoint[];
}
export interface ServiceRow {
  workflowId: string;
  name: string;
  total: number;
  success: number;
  failed: number;
  cancelled: number;
  successRate: number | null;
  previousSuccessRate: number | null;
  previousTotal: number;
  automationRate: number | null;
  durationP50Ms: number | null;
  durationP95Ms: number | null;
  lastRunAt: string;
  /** Runs per bucket across the period (the line beside each row) and how many of those failed. */
  trend: number[];
  trendFailed: number[];
}
export interface Failures {
  total: number;
  savedSignInFailures: number;
  causes: Array<{ key: string; label: string; count: number; share: number | null; lastSeen: string }>;
  samples: Array<{ key: string; label: string; message: string; count: number; lastSeen: string }>;
  websiteSaid: Array<{ text: string; count: number }>;
  steps: Array<{ workflow: string; stepOrder: number; what: string; count: number }>;
}
export interface Heatmap {
  cells: Array<{ day: number; hour: number; total: number; failed: number }>;
}
export interface HumanEffort {
  byType: Array<{ type: string; total: number; resolved: number; timedOut: number; pending: number; waitP50Ms: number | null; waitP95Ms: number | null }>;
  byResolution: Array<{ action: string; count: number }>;
}
export interface FunnelRow {
  service: string;
  orders: number;
  linkSent: number;
  started: number;
  completed: number;
  failed: number;
  expired: number;
  waiting: number;
  sendFailures: number;
  recoveredByReminder: number;
  startDelayP50Ms: number | null;
  completionRate: number | null;
}
export interface Funnel {
  totals: Omit<FunnelRow, "service" | "sendFailures" | "startDelayP50Ms" | "completionRate">;
  services: FunnelRow[];
}
export interface Live {
  queued: number;
  running: number;
  paused: number;
  oldestQueuedAt: string | null;
  pendingInterventions: number;
  customersWaitingToStart: number;
  at: string;
}
export interface RunRow {
  id: string;
  workflowId: string;
  workflow: string;
  status: string;
  trigger: string;
  createdAt: string;
  durationMs: number | null;
  queueMs: number | null;
  failure: { key: string; label: string } | null;
  errorMessage: string | null;
  interventions: number;
  captchas: number;
  fallbacks: number;
  usedSavedSignIn: boolean | null;
  result: { label: string; tone: string } | null;
  application: { status: string; reference: string | null } | null;
}
export interface RunsPage {
  items: RunRow[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Options {
  workflows: Array<{ id: string; name: string; active: boolean }>;
  statuses: string[];
  triggers: string[];
  failures: Array<{ key: string; label: string }>;
}

// ---------- formatting ----------

const IST = "Asia/Kolkata";

export const fmtNum = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return "—";
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
  return n.toLocaleString("en-IN");
};

export const fmtPct = (n: number | null | undefined): string => (n === null || n === undefined ? "—" : `${n.toFixed(n % 1 === 0 ? 0 : 1)}%`);

export function fmtDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  const s = Math.round(ms / 1000);
  if (s < 1) return `${Math.round(ms)}ms`;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export function fmtBucket(iso: string, unit: "hour" | "day" | "week", long = false): string {
  const d = new Date(iso);
  if (unit === "hour") {
    const t = d.toLocaleTimeString("en-IN", { timeZone: IST, hour: "numeric", hour12: true });
    return long ? `${d.toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short" })}, ${t}` : t.toLowerCase();
  }
  const day = d.toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short" });
  return unit === "week" && long ? `Week of ${day}` : day;
}

export function fmtWhen(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}

export function ago(iso?: string | null): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}
