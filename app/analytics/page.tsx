"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { PageHeader } from "@/components/PageHeader";
import { useAuth, ROLE_LABEL } from "@/lib/auth-context";
import {
  Failures,
  Filters,
  Funnel,
  Heatmap,
  HumanEffort,
  Live,
  Options,
  Overview,
  ServiceRow,
  Timeseries,
  ago,
  filtersFromParams,
  fmtDuration,
  fmtNum,
  fmtPct,
  paramsFromFilters,
  queryOf,
  useAnalytics,
} from "@/lib/analytics";
import { FilterBar } from "@/components/analytics/FilterBar";
import { C, HeatmapChart, RunsLegend, RunsOverTime, RunsTable } from "@/components/analytics/charts";
import { Card, KpiTile, Segmented, Skeleton } from "@/components/analytics/ui";
import { FailureDetailsPanel, FailuresPanel, FunnelPanel, HumanPanel, InsightsPanel, LiveStrip, RunsPanel, ServicesPanel, buildInsights } from "@/components/analytics/panels";

export default function AnalyticsPage() {
  // useSearchParams needs a Suspense boundary in the App Router
  return (
    <Suspense fallback={null}>
      <Analytics />
    </Suspense>
  );
}

function Analytics() {
  const { user, loading: authLoading } = useRequireAuth();
  const { readOnly } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(sp.toString())), [sp]);

  // "Now" moves on every minute so a relative range (last 7 days…) keeps following the clock.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const q = useMemo(() => queryOf(filters), [filters, tick]);

  const setFilters = (next: Filters) => {
    const s = paramsFromFilters(next);
    router.replace(s ? `/analytics?${s}` : "/analytics", { scroll: false });
  };
  const toggle = (key: "workflowId" | "failure", id: string) =>
    setFilters({ ...filters, [key]: filters[key].includes(id) ? filters[key].filter((x) => x !== id) : [...filters[key], id] });

  const ready = !!user;
  const path = (name: string) => (ready ? `/analytics/${name}?${q}` : null);
  const options = useAnalytics<Options>(ready ? "/analytics/options" : null);
  const overview = useAnalytics<Overview>(path("overview"));
  const series = useAnalytics<Timeseries>(path("timeseries"));
  const services = useAnalytics<ServiceRow[]>(path("services"));
  const failures = useAnalytics<Failures>(path("failures"));
  const heatmap = useAnalytics<Heatmap>(path("heatmap"));
  const human = useAnalytics<HumanEffort>(path("human-effort"));
  const funnel = useAnalytics<Funnel>(path("funnel"));
  const live = useAnalytics<Live>(ready ? `/analytics/live?${filters.workflowId.length ? `workflowId=${filters.workflowId.join(",")}` : ""}` : null, 5000);

  const [chartView, setChartView] = useState<"chart" | "table">("chart");
  const [heatMode, setHeatMode] = useState<"volume" | "failures">("volume");

  const insights = useMemo(
    () => buildInsights(overview.data, services.data, failures.data, heatmap.data, funnel.data),
    [overview.data, services.data, failures.data, heatmap.data, funnel.data],
  );

  if (authLoading || !user) return null;

  const cur = overview.data?.current;
  const prev = overview.data?.previous;
  const pts = series.data?.points ?? [];
  const refreshing = overview.loading && !!overview.data;
  // A change against a handful of earlier runs says nothing ("up 2717%"), so it is only shown with a real base.
  const base = (n: number | null | undefined) => ((prev?.total ?? 0) >= 10 ? (n ?? null) : null);
  const rateSeries = pts.map((p) => (p.success + p.failed > 0 ? (p.success / (p.success + p.failed)) * 100 : 0));

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Insights"
        title="Analytics"
        actions={
          <span className="text-xs text-text-muted flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${refreshing ? "bg-signal pulse-soft" : "bg-ok"}`} aria-hidden />
            {refreshing ? "Updating…" : live.data ? `Live · ${ago(live.data.at)}` : "Loading…"}
            {readOnly && <span className="ml-1 rounded border border-warn/40 bg-warn/10 text-warn px-1.5 py-0.5 text-[10px] font-mono uppercase">{ROLE_LABEL[user.role]}</span>}
          </span>
        }
      />

      <div className="sticky top-0 z-20 bg-ink/90 backdrop-blur border-b border-ink-line px-8 py-3">
        <FilterBar filters={filters} options={options.data} onChange={setFilters} />
      </div>

      <div className="px-8 pt-6 flex flex-col gap-5 max-w-[1500px]">
        <LiveStrip live={live.data} />

        {overview.error && <p className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-md px-3 py-2">{overview.error}</p>}

        {/* headline numbers */}
        <div className={`grid gap-3 grid-cols-2 lg:grid-cols-5 transition-opacity ${refreshing ? "opacity-60" : ""}`}>
          {!cur || !prev ? (
            Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[112px]" />)
          ) : (
            <>
              <KpiTile label="Runs" value={fmtNum(cur.total)} spark={pts.map((p) => p.total)} sparkColor={C.active} delta={{ now: cur.total, before: base(prev.total), mode: "pct" }} sub={cur.active ? `${cur.active} active` : undefined} />
              <KpiTile label="Success rate" value={fmtPct(cur.successRate)} spark={rateSeries} sparkColor={C.success} delta={{ now: cur.successRate, before: base(prev.successRate), mode: "pts" }} sub={`${fmtNum(cur.success)} of ${fmtNum(cur.success + cur.failed)} finished`} hint="Successful runs out of runs that finished (cancelled runs are not counted)" />
              <KpiTile label="Hands-free" value={fmtPct(cur.automationRate)} delta={{ now: cur.automationRate, before: base(prev.automationRate), mode: "pts" }} sub={`${fmtNum(cur.interventions)} prompts`} hint="Successful runs where nobody had to fix a step or take over the browser. Entering a code doesn't count against a run." />
              <KpiTile label="Typical run" value={fmtDuration(cur.durationP50Ms)} spark={pts.map((p) => p.avgDurationMs ?? 0)} sparkColor={C.accent} delta={{ now: cur.durationP50Ms, before: base(prev.durationP50Ms), mode: "pct", lowerIsBetter: true }} sub={`slowest 1 in 20: ${fmtDuration(cur.durationP95Ms)}`} hint="Median time of successful runs" />
              <KpiTile label="Failed" value={fmtNum(cur.failed)} spark={pts.map((p) => p.failed)} sparkColor={C.failed} delta={{ now: cur.failed, before: base(prev.failed), mode: "pct", lowerIsBetter: true }} sub={cur.cancelled ? `${fmtNum(cur.cancelled)} cancelled` : undefined} />
            </>
          )}
        </div>

        <InsightsPanel insights={insights} loading={overview.loading || services.loading} />

        <Card
          title="Runs over time"
          subtitle={series.data ? `Per ${series.data.bucket} · Indian time · move across the chart for the numbers` : undefined}
          dim={series.loading && !!series.data}
          error={series.error}
          actions={
            <>
              {chartView === "chart" && <RunsLegend />}
              <Segmented label="View" value={chartView} onChange={setChartView} options={[{ id: "chart", label: "Chart" }, { id: "table", label: "Table" }]} />
            </>
          }
        >
          {!series.data ? <Skeleton className="h-[400px]" /> : chartView === "chart" ? <RunsOverTime data={series.data} /> : <RunsTable data={series.data} />}
        </Card>

        <div className="grid gap-5 xl:grid-cols-12">
          <Card
            className="xl:col-span-7"
            title="When it's busy"
            subtitle="Weekday and hour · Indian time"
            dim={heatmap.loading && !!heatmap.data}
            error={heatmap.error}
            actions={<Segmented label="Show" value={heatMode} onChange={setHeatMode} options={[{ id: "volume", label: "Runs" }, { id: "failures", label: "Failure rate" }]} />}
          >
            {!heatmap.data ? <Skeleton className="h-[320px]" /> : <HeatmapChart cells={heatmap.data.cells} mode={heatMode} />}
          </Card>
          <div className="xl:col-span-5">
            <FunnelPanel data={funnel.data} loading={funnel.loading && !!funnel.data} error={funnel.error} />
          </div>
        </div>

        <ServicesPanel rows={services.data} loading={services.loading && !!services.data} error={services.error} filters={filters} onToggle={(id) => toggle("workflowId", id)} />

        <div className="grid gap-5 xl:grid-cols-12">
          <div className="xl:col-span-7">
            <FailuresPanel data={failures.data} loading={failures.loading && !!failures.data} error={failures.error} filters={filters} onPickCause={(k) => toggle("failure", k)} />
          </div>
          <div className="xl:col-span-5">
            <FailureDetailsPanel data={failures.data} loading={failures.loading && !!failures.data} />
          </div>
        </div>

        <HumanPanel data={human.data} overview={overview.data} loading={human.loading && !!human.data} error={human.error} />

        <RunsPanel query={q} enabled={ready} />
      </div>
    </div>
  );
}
