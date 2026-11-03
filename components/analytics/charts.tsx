"use client";

import { ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { SeriesPoint, Timeseries, fmtBucket, fmtNum, fmtPct } from "@/lib/analytics";

// Series colours come from CSS variables (globals.css), validated against the dashboard's dark surface.
export const C = {
  success: "var(--c-success)",
  failed: "var(--c-failed)",
  cancelled: "var(--c-cancelled)",
  active: "var(--c-active)",
  accent: "var(--c-accent)",
};

// Identity colours for the failure-cause donut: the validated dark categorical steps (blue, orange, violet, yellow,
// magenta). Assigned by rank in the current view, with the rest folded into a neutral "Other".
export const CAUSE_COLORS = ["#3987e5", "#d95926", "#9085e9", "#c98500", "#d55181"];
export const OTHER_COLOR = "#5c6b7a";

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** 0 .. a round maximum, with ~4 evenly spaced ticks. */
function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 4, ticks: [0, 1, 2, 3, 4] };
  const rough = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? pow * 10;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { top, ticks };
}

/** A smooth curve through the points that never overshoots them (monotone cubic), as an SVG path starting with "M". */
function smooth(pts: Array<[number, number]>): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0] || 1e-6;
    m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i];
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
    } else {
      const a = t[i] / m[i];
      const b = t[i + 1] / m[i];
      const s = a * a + b * b;
      if (s > 9) {
        const k = 3 / Math.sqrt(s);
        t[i] = k * a * m[i];
        t[i + 1] = k * b * m[i];
      }
    }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + t[i] * h).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - t[i + 1] * h).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

/** A closed band between two curves (top left→right, then bottom right→left). */
function band(top: Array<[number, number]>, bottom: Array<[number, number]>): string {
  const back = smooth([...bottom].reverse()).replace(/^M/, "L");
  return `${smooth(top)} ${back} Z`;
}

// ---------- tooltip shell ----------

function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const flip = x > width * 0.6;
  return (
    <div
      className="pointer-events-none absolute z-20 min-w-[160px] rounded-lg border border-ink-line bg-ink-raised/95 px-3.5 py-2.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.9)] backdrop-blur"
      style={{ top: Math.max(4, y), left: flip ? undefined : x + 16, right: flip ? width - x + 16 : undefined }}
    >
      {children}
    </div>
  );
}

// ---------- sparkline ----------

export function Sparkline({ values, color = C.active, width = 96, height = 30 }: { values: number[]; color?: string; width?: number; height?: number }) {
  const uid = useId().replace(/:/g, "");
  const path = useMemo(() => {
    if (values.length < 2) return null;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 3 - ((v - min) / span) * (height - 8)] as [number, number]);
    const line = smooth(pts);
    return { line, area: `${line} L${width},${height} L0,${height} Z`, last: pts[pts.length - 1] };
  }, [values, width, height]);
  if (!path) return <svg width={width} height={height} aria-hidden />;
  return (
    <svg width={width} height={height} aria-hidden>
      <defs>
        <linearGradient id={`sp-${uid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.32" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#sp-${uid})`} />
      <path d={path.line} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={path.last[0]} cy={path.last[1]} r="2.6" fill={color} stroke="var(--c-surface)" strokeWidth="2" />
    </svg>
  );
}

// ---------- runs over time ----------

const STACK: Array<{ key: "success" | "cancelled" | "failed" | "other"; label: string; color: string; glyph: string }> = [
  // fixed order, bottom to top: the good outcome sits on the baseline so it is comparable point to point
  { key: "success", label: "Success", color: C.success, glyph: "✓" },
  { key: "cancelled", label: "Cancelled", color: C.cancelled, glyph: "–" },
  { key: "failed", label: "Failed", color: C.failed, glyph: "✕" },
  { key: "other", label: "In progress", color: C.active, glyph: "…" },
];

/**
 * Smooth stacked areas for the outcomes, with the success rate as its own strip underneath (same time axis, its own
 * scale - never a second axis on one chart). One crosshair and one tooltip drive both.
 */
export function RunsOverTime({ data, height = 300 }: { data: Timeseries; height?: number }) {
  const uid = useId().replace(/:/g, "");
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pts = data.points;
  const n = pts.length;
  const m = { l: 42, r: 14, t: 14, b: 4 };
  const stripH = 74;
  const axisH = 22;
  const iw = Math.max(0, width - m.l - m.r);
  const ih = height - m.t - m.b;
  const max = Math.max(...pts.map((p) => p.total), 0);
  const { top, ticks } = niceScale(max);
  const x = (i: number) => m.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => m.t + ih - (v / top) * ih;

  // cumulative tops per layer
  const layers = useMemo(() => {
    const acc = pts.map(() => 0);
    return STACK.map((s) => {
      const bottom = acc.map((v) => v);
      pts.forEach((p, i) => (acc[i] += p[s.key]));
      return { ...s, bottomVals: bottom, topVals: acc.map((v) => v), has: pts.some((p) => p[s.key] > 0) };
    });
  }, [pts]);

  const rate = pts.map((p) => (p.success + p.failed > 0 ? (p.success / (p.success + p.failed)) * 100 : null));
  const sy = (v: number) => 8 + (stripH - 16) * (1 - v / 100);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 80))));
  const key = `${n}-${pts.reduce((a, p) => a + p.total, 0)}`;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left - m.l;
    setHover(n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round((px / (iw || 1)) * (n - 1)))));
  };
  const hp: SeriesPoint | null = hover !== null ? pts[hover] : null;

  // success-rate line, broken where nothing finished
  const rateSegments = useMemo(() => {
    const segs: Array<Array<[number, number]>> = [];
    let cur: Array<[number, number]> = [];
    rate.forEach((v, i) => {
      if (v === null) {
        if (cur.length) segs.push(cur);
        cur = [];
      } else cur.push([x(i), sy(v)]);
    });
    if (cur.length) segs.push(cur);
    return segs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, width]);

  const peak = pts.reduce((b, p, i) => (p.total > (pts[b]?.total ?? -1) ? i : b), 0);
  const avg = n ? Math.round(pts.reduce((a, p) => a + p.total, 0) / n) : 0;
  const unit = data.bucket === "hour" ? "hour" : data.bucket === "day" ? "day" : "week";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3 text-xs text-text-muted">
        <span>Peak <span className="font-mono text-text-primary">{pts[peak] ? fmtNum(pts[peak].total) : "–"}</span> <span className="text-text-dim">on {pts[peak] ? fmtBucket(pts[peak].t, data.bucket, true) : "–"}</span></span>
        <span>Average <span className="font-mono text-text-primary">{fmtNum(avg)}</span> <span className="text-text-dim">per {unit}</span></span>
      </div>
      <div ref={ref} className="relative" style={{ height: height + stripH + axisH + 6 }} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height + stripH + axisH + 6} role="img" aria-label="Runs over time, stacked by outcome, with the success rate below">
            <defs>
              {STACK.map((s) => (
                <linearGradient key={s.key} id={`rt-${uid}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={s.color} stopOpacity="0.7" />
                  <stop offset="1" stopColor={s.color} stopOpacity="0.16" />
                </linearGradient>
              ))}
              <linearGradient id={`rt-${uid}-rate`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={C.success} stopOpacity="0.35" />
                <stop offset="1" stopColor={C.success} stopOpacity="0" />
              </linearGradient>
            </defs>

            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke="var(--c-grid)" strokeWidth="1" strokeDasharray={t === 0 ? undefined : "2 5"} />
                <text x={m.l - 10} y={y(t) + 4} textAnchor="end" className="fill-text-dim" fontSize="10" fontFamily="var(--font-mono)">{fmtNum(t)}</text>
              </g>
            ))}

            <g key={key} className="chart-reveal">
              {[...layers].reverse().map((l) =>
                l.has ? (
                  <g key={l.key}>
                    <path d={band(pts.map((_, i) => [x(i), y(l.topVals[i])]), pts.map((_, i) => [x(i), y(l.bottomVals[i])]))} fill={`url(#rt-${uid}-${l.key})`} />
                    <path d={smooth(pts.map((_, i) => [x(i), y(l.topVals[i])]))} fill="none" stroke={l.color} strokeWidth="1.75" strokeLinejoin="round" />
                  </g>
                ) : null,
              )}
            </g>

            {hover !== null && hp && (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={height + stripH + axisH - 18} stroke="var(--c-crosshair)" strokeWidth="1" />
                {layers.map((l) => (hp[l.key] > 0 ? <circle key={l.key} cx={x(hover)} cy={y(l.topVals[hover])} r="4.5" fill={l.color} stroke="var(--c-surface)" strokeWidth="2" /> : null))}
              </g>
            )}

            {/* success-rate strip */}
            <g transform={`translate(0, ${height + 4})`}>
              <text x={m.l - 10} y={sy(100) + 3} textAnchor="end" className="fill-text-dim" fontSize="9" fontFamily="var(--font-mono)">100%</text>
              <text x={m.l - 10} y={sy(0) + 3} textAnchor="end" className="fill-text-dim" fontSize="9" fontFamily="var(--font-mono)">0</text>
              <line x1={m.l} x2={width - m.r} y1={sy(100)} y2={sy(100)} stroke="var(--c-grid)" strokeDasharray="2 5" />
              <line x1={m.l} x2={width - m.r} y1={sy(0)} y2={sy(0)} stroke="var(--c-grid)" />
              <g key={`r${key}`} className="chart-reveal">
                {rateSegments.map((seg, i) =>
                  seg.length > 1 ? (
                    <g key={i}>
                      <path d={`${smooth(seg)} L${seg[seg.length - 1][0]},${sy(0)} L${seg[0][0]},${sy(0)} Z`} fill={`url(#rt-${uid}-rate)`} />
                      <path d={smooth(seg)} fill="none" stroke={C.success} strokeWidth="1.75" strokeLinejoin="round" />
                    </g>
                  ) : (
                    <circle key={i} cx={seg[0][0]} cy={seg[0][1]} r="2.5" fill={C.success} />
                  ),
                )}
              </g>
              {hover !== null && rate[hover] !== null && <circle cx={x(hover)} cy={sy(rate[hover] as number)} r="4" fill={C.success} stroke="var(--c-surface)" strokeWidth="2" pointerEvents="none" />}
              <text x={m.l} y={stripH + 2} className="fill-text-dim" fontSize="9" fontFamily="var(--font-mono)">SUCCESS RATE</text>
            </g>

            {pts.map((p, i) =>
              i % every === 0 ? (
                <text key={p.t} x={x(i)} y={height + stripH + axisH + 2} textAnchor="middle" className="fill-text-dim" fontSize="10" fontFamily="var(--font-mono)">
                  {fmtBucket(p.t, data.bucket)}
                </text>
              ) : null,
            )}
          </svg>
        )}
        {hp && hover !== null && (
          <Tip x={x(hover)} y={m.t + 4} width={width}>
            <div className="text-[11px] font-mono text-text-muted mb-1.5">{fmtBucket(hp.t, data.bucket, true)}</div>
            <div className="font-display text-xl font-semibold text-text-primary leading-none mb-2.5">{fmtNum(hp.total)} <span className="text-xs font-body font-normal text-text-muted">runs</span></div>
            {[...STACK].reverse().map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-xs py-0.5">
                <span className="w-3 h-0.5 rounded" style={{ background: s.color }} />
                <span className="text-text-muted flex-1">{s.label}</span>
                <span className="font-mono text-text-primary">{fmtNum(hp[s.key])}</span>
              </div>
            ))}
            {hp.success + hp.failed > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-ink-line text-[11px] text-text-muted flex justify-between gap-4">
                <span>Success rate</span>
                <span className="font-mono text-text-primary">{fmtPct((hp.success / (hp.success + hp.failed)) * 100)}</span>
              </div>
            )}
          </Tip>
        )}
      </div>
    </div>
  );
}

export function RunsLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
      {STACK.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: s.color }} />
          <span aria-hidden className="font-mono text-[10px] text-text-dim">{s.glyph}</span>
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** The same numbers as the chart, for anyone who can't or doesn't want to read it. */
export function RunsTable({ data }: { data: Timeseries }) {
  return (
    <div className="max-h-[380px] overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-ink-panel text-text-dim font-mono uppercase text-[10px]">
          <tr>
            <th className="text-left py-1.5 font-medium">{data.bucket === "hour" ? "Hour" : data.bucket === "day" ? "Day" : "Week"}</th>
            <th className="text-right font-medium">Total</th>
            <th className="text-right font-medium">Success</th>
            <th className="text-right font-medium">Failed</th>
            <th className="text-right font-medium">Cancelled</th>
          </tr>
        </thead>
        <tbody>
          {[...data.points].reverse().map((p) => (
            <tr key={p.t} className="border-t border-ink-line/60">
              <td className="py-1.5 text-text-muted">{fmtBucket(p.t, data.bucket, true)}</td>
              <td className="text-right font-mono text-text-primary">{p.total}</td>
              <td className="text-right font-mono">{p.success}</td>
              <td className="text-right font-mono">{p.failed}</td>
              <td className="text-right font-mono">{p.cancelled}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- weekday x hour heatmap, with the totals along its edges ----------

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hourLabel = (h: number) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);

export function HeatmapChart({ cells, mode }: { cells: Array<{ day: number; hour: number; total: number; failed: number }>; mode: "volume" | "failures" }) {
  const [hover, setHover] = useState<{ day: number; hour: number } | null>(null);
  const grid = useMemo(() => {
    const g = new Map<string, { total: number; failed: number }>();
    for (const c of cells) g.set(`${c.day}:${c.hour}`, c);
    return g;
  }, [cells]);
  const cellValue = (c?: { total: number; failed: number }) => (!c ? 0 : mode === "volume" ? c.total : c.total >= 3 ? c.failed / c.total : 0); // a rate from 1-2 runs is noise

  const { byHour, byDay, max, peak } = useMemo(() => {
    const hour = Array.from({ length: 24 }, () => ({ total: 0, failed: 0 }));
    const day = Array.from({ length: 7 }, () => ({ total: 0, failed: 0 }));
    let mx = 0;
    let pk: { day: number; hour: number; v: number } | null = null;
    for (const c of cells) {
      hour[c.hour].total += c.total;
      hour[c.hour].failed += c.failed;
      day[c.day].total += c.total;
      day[c.day].failed += c.failed;
      const v = cellValue(c);
      mx = Math.max(mx, v);
      if (v > 0 && (!pk || v > pk.v)) pk = { day: c.day, hour: c.hour, v };
    }
    return { byHour: hour, byDay: day, max: mx, peak: pk };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, mode]);

  const marginal = (t: { total: number; failed: number }) => (mode === "volume" ? t.total : t.total >= 5 ? t.failed / t.total : 0);
  const maxHour = Math.max(...byHour.map(marginal), mode === "volume" ? 1 : 0.0001);
  const maxDay = Math.max(...byDay.map(marginal), mode === "volume" ? 1 : 0.0001);
  const rgb = mode === "volume" ? "57,135,229" : "230,103,103";
  const hc = hover ? grid.get(`${hover.day}:${hover.hour}`) : undefined;
  const fmtMarg = (v: number) => (mode === "volume" ? fmtNum(v) : `${Math.round(v * 100)}%`);

  return (
    <div>
      <div className="grid gap-x-[3px] gap-y-[3px]" style={{ gridTemplateColumns: "34px repeat(24, minmax(0, 1fr)) 64px" }} onPointerLeave={() => setHover(null)}>
        {/* hour labels */}
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className={`text-center text-[9px] font-mono ${hover?.hour === h ? "text-text-primary" : "text-text-dim"}`}>{h % 3 === 0 ? hourLabel(h) : ""}</span>
        ))}
        <span />

        {DAYS.map((name, d) => (
          <div key={name} className="contents">
            <span className={`text-[11px] font-mono self-center ${hover?.day === d ? "text-text-primary" : "text-text-dim"}`}>{name}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const c = grid.get(`${d}:${h}`);
              const v = cellValue(c);
              const a = max > 0 && v > 0 ? 0.16 + 0.84 * Math.pow(v / max, 0.65) : 0;
              const isPeak = peak && peak.day === d && peak.hour === h;
              const inLine = hover && (hover.day === d || hover.hour === h);
              return (
                <button
                  key={h}
                  type="button"
                  aria-label={`${name} ${h}:00 — ${c?.total ?? 0} runs, ${c?.failed ?? 0} failed`}
                  onPointerEnter={() => setHover({ day: d, hour: h })}
                  onFocus={() => setHover({ day: d, hour: h })}
                  onBlur={() => setHover(null)}
                  className={`h-9 rounded-[6px] outline-none transition-[transform,box-shadow,opacity] duration-150 focus-visible:ring-2 focus-visible:ring-signal/70 hover:scale-[1.18] hover:z-10 ${hover && !inLine ? "opacity-60" : ""}`}
                  style={{
                    background: a ? `rgba(${rgb},${a.toFixed(3)})` : "var(--c-grid)",
                    boxShadow: isPeak ? `0 0 0 1.5px rgba(${rgb},1), 0 0 14px rgba(${rgb},0.55)` : undefined,
                  }}
                />
              );
            })}
            {/* the weekday's total, as a bar along the edge */}
            <div className="flex items-center gap-1.5 pl-1.5" title={`${name}: ${fmtMarg(marginal(byDay[d]))}`}>
              <div className="h-2.5 rounded-full" style={{ width: `${Math.max(2, (marginal(byDay[d]) / maxDay) * 100)}%`, background: `rgba(${rgb},${hover?.day === d ? 1 : 0.7})`, maxWidth: "calc(100% - 26px)" }} />
              <span className="text-[9px] font-mono text-text-dim tabular-nums">{fmtMarg(marginal(byDay[d]))}</span>
            </div>
          </div>
        ))}

        {/* the hour's total, as a bar along the bottom */}
        <span />
        {byHour.map((t, h) => (
          <div key={h} className="flex items-start justify-center h-14 pt-2" title={`${hourLabel(h)}: ${fmtMarg(marginal(t))}`}>
            <div className="w-full rounded-[3px] origin-top" style={{ height: `${Math.max(2, (marginal(t) / maxHour) * 100)}%`, background: `rgba(${rgb},${hover?.hour === h ? 1 : 0.7})` }} />
          </div>
        ))}
        <span />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-2">
          {mode === "volume" ? "Quiet" : "Reliable"}
          <span className="h-2.5 w-28 rounded-full" style={{ background: `linear-gradient(90deg, rgba(${rgb},0.16), rgba(${rgb},1))` }} aria-hidden />
          {mode === "volume" ? "Busy" : "Failing"}
        </span>
        {hover ? (
          <span className="text-text-primary">
            {DAYS[hover.day]} {String(hover.hour).padStart(2, "0")}:00 · <span className="font-mono">{fmtNum(hc?.total ?? 0)}</span> runs
            <span className="text-text-muted">, {fmtNum(hc?.failed ?? 0)} failed{hc && hc.total > 0 ? ` (${fmtPct((hc.failed / hc.total) * 100)})` : ""}</span>
          </span>
        ) : peak ? (
          <span>
            {mode === "volume" ? "Busiest" : "Worst"}: <span className="text-text-primary">{DAYS[peak.day]} {String(peak.hour).padStart(2, "0")}:00</span>
          </span>
        ) : null}
      </div>
      {mode === "failures" && <p className="mt-2 text-[10px] text-text-dim">Hours with fewer than 3 runs are left blank: a rate from one or two runs is noise.</p>}
    </div>
  );
}

// ---------- donut ----------

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => [cx + r * Math.cos(a - Math.PI / 2), cy + r * Math.sin(a - Math.PI / 2)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

export function Donut({ slices, size = 220, centerTop, centerBottom, active = [], onPick }: { slices: Slice[]; size?: number; centerTop: string; centerBottom: string; active?: string[]; onPick?: (key: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const r = size / 2 - 16;
  const gap = slices.length > 1 ? 0.035 : 0;
  let a = 0;
  const hs = slices.find((s) => s.key === hover);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label="Failures by cause">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-grid)" strokeWidth="18" />
        <g className="chart-reveal">
          {slices.map((s) => {
            const sweep = (s.value / total) * Math.PI * 2;
            const a0 = a + gap / 2;
            const a1 = a + sweep - gap / 2;
            a += sweep;
            const on = hover === s.key || active.includes(s.key);
            return (
              <path
                key={s.key}
                d={arc(size / 2, size / 2, r, a0, Math.max(a0 + 0.001, a1))}
                fill="none"
                stroke={s.color}
                strokeWidth={on ? 24 : 18}
                strokeLinecap="round"
                opacity={hover && hover !== s.key ? 0.4 : 1}
                style={{ transition: "stroke-width .15s, opacity .15s", cursor: onPick ? "pointer" : "default" }}
                onPointerEnter={() => setHover(s.key)}
                onPointerLeave={() => setHover(null)}
                onClick={() => onPick?.(s.key)}
              />
            );
          })}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-10">
        <div className="font-display text-3xl font-semibold text-text-primary tabular-nums leading-none">{hs ? fmtNum(hs.value) : centerTop}</div>
        <div className="mt-1.5 text-[11px] text-text-muted leading-tight">{hs ? hs.label : centerBottom}</div>
        {hs && <div className="mt-0.5 text-[11px] font-mono" style={{ color: hs.color }}>{fmtPct((hs.value / total) * 100)}</div>}
      </div>
    </div>
  );
}

// ---------- ranked bars (steps, interventions…) ----------

export function RankedBars({ rows, color = C.failed, empty = "Nothing in this period.", onPick, active = [] }: { rows: Array<{ key: string; label: string; value: number; note?: string; sub?: string }>; color?: string; empty?: string; onPick?: (key: string) => void; active?: string[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length) return <p className="text-sm text-text-muted py-6 text-center">{empty}</p>;
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((r) => {
        const on = active.includes(r.key);
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm mb-1">
              <span className="text-text-primary truncate">{r.label}</span>
              <span className="font-mono text-xs text-text-muted shrink-0">
                <span className="text-text-primary">{fmtNum(r.value)}</span>
                {r.note ? <span className="ml-2">{r.note}</span> : null}
              </span>
            </div>
            <div className="h-2 rounded-full bg-ink-faint overflow-hidden">
              <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} />
            </div>
          </>
        );
        return (
          <li key={r.key} title={r.sub}>
            {onPick ? (
              <button onClick={() => onPick(r.key)} aria-pressed={on} className={`w-full text-left rounded-md px-2 py-1.5 -mx-2 transition-colors ${on ? "bg-signal/10" : "hover:bg-ink-raised/60"}`}>
                {body}
              </button>
            ) : (
              <div className="py-1">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------- customer journey: a tapered funnel ----------

const FUNNEL_STEPS: Array<[string, string]> = [
  ["#6da7ec", "#3987e5"],
  ["#3987e5", "#2a78d6"],
  ["#2a78d6", "#256abf"],
]; // one hue, ordinal steps (gradient start/end per stage)

export function TaperedFunnel({ stages }: { stages: Array<{ label: string; value: number }> }) {
  const uid = useId().replace(/:/g, "");
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const top = Math.max(stages[0]?.value ?? 0, 1);
  const stageH = 64;
  const gap = 6;
  const H = stages.length * stageH + (stages.length - 1) * gap;
  const pad = 4;
  const maxW = Math.max(0, width - 120); // room on the right for the "continue" chips
  const wOf = (v: number) => Math.max(maxW * 0.16, (v / top) * maxW);
  const cx = pad + maxW / 2;

  return (
    <div ref={ref} className="relative" style={{ height: H }}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label="Customer journey funnel">
          <defs>
            {FUNNEL_STEPS.map(([a, b], i) => (
              <linearGradient key={i} id={`fn-${uid}-${i}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor={a} />
                <stop offset="1" stopColor={b} />
              </linearGradient>
            ))}
          </defs>
          <g className="chart-reveal">
            {stages.map((s, i) => {
              const w0 = wOf(s.value);
              const next = stages[i + 1];
              const w1 = next ? wOf(next.value) : w0 * 0.82;
              const y0 = i * (stageH + gap);
              const pts = [
                [cx - w0 / 2, y0],
                [cx + w0 / 2, y0],
                [cx + w1 / 2, y0 + stageH],
                [cx - w1 / 2, y0 + stageH],
              ];
              const kept = i > 0 && stages[i - 1].value > 0 ? (s.value / stages[i - 1].value) * 100 : null;
              return (
                <g key={s.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} opacity={hover === null || hover === i ? 1 : 0.55} style={{ transition: "opacity .15s" }}>
                  <path d={`M${pts.map((p) => p.join(",")).join(" L")} Z`} fill={`url(#fn-${uid}-${Math.min(i, 2)})`} stroke="var(--c-surface)" strokeWidth="1.5" strokeLinejoin="round" />
                  <text x={cx} y={y0 + stageH / 2 - 4} textAnchor="middle" fontSize="22" fontWeight="600" fill="#fff" fontFamily="var(--font-display)">{fmtNum(s.value)}</text>
                  <text x={cx} y={y0 + stageH / 2 + 15} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.85)">{s.label}</text>
                  {kept !== null && (
                    <g transform={`translate(${pad + maxW + 12}, ${y0 + stageH / 2 - 11})`}>
                      <rect width="90" height="22" rx="11" fill="var(--c-hover)" stroke="var(--c-grid)" />
                      <text x="45" y="15" textAnchor="middle" fontSize="11" className="fill-text-primary" fontFamily="var(--font-mono)">↓ {fmtPct(kept)}</text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}

/** Where the rest went: one bar split into expired / failed / still waiting, each with a plain-word legend. */
export function LeakBar({ parts, of }: { parts: Array<{ label: string; value: number; color: string }>; of: number }) {
  const shown = parts.filter((p) => p.value > 0);
  const lost = shown.reduce((a, p) => a + p.value, 0);
  if (of <= 0) return null;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-text-muted mb-2">
        <span>Where the rest went</span>
        <span className="font-mono"><span className="text-text-primary">{fmtNum(lost)}</span> of {fmtNum(of)}</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden bg-ink-faint gap-[2px]">
        {shown.map((p) => (
          <div key={p.label} className="h-full first:rounded-l-full last:rounded-r-full transition-[width] duration-500" style={{ width: `${(p.value / Math.max(lost, 1)) * 100}%`, background: p.color }} title={`${p.label}: ${p.value}`} />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {shown.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5 text-xs text-text-muted">
            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: p.color }} />
            {p.label} <span className="font-mono text-text-primary">{fmtNum(p.value)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
