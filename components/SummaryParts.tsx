import { ResultTone, RunSummary, SummaryStepState } from "@/lib/types";

export function formatDuration(ms?: number): string | null {
  if (ms === undefined) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export const RESULT_TONE: Record<
  ResultTone,
  { box: string; text: string; glyph: string; ring: string }
> = {
  positive: { box: "border-ok/40 bg-ok/10", text: "text-ok", glyph: "✓", ring: "bg-ok/20 border-ok/60" },
  negative: { box: "border-danger/40 bg-danger/10", text: "text-danger", glyph: "✕", ring: "bg-danger/20 border-danger/60" },
  neutral: { box: "border-signal/40 bg-signal/10", text: "text-signal", glyph: "i", ring: "bg-signal/20 border-signal/60" },
};

const STATE_STYLE: Record<
  SummaryStepState,
  { ring: string; glyph: string; text: string }
> = {
  done: { ring: "border-ok/60 bg-ok/15 text-ok", glyph: "✓", text: "text-text-primary" },
  current: { ring: "border-signal bg-signal/15 text-signal pulse-soft", glyph: "●", text: "text-signal" },
  failed: { ring: "border-danger/60 bg-danger/15 text-danger", glyph: "✕", text: "text-danger" },
  skipped: { ring: "border-ink-line bg-ink-raised text-text-muted", glyph: "–", text: "text-text-muted" },
  pending: { ring: "border-ink-line text-text-dim", glyph: "", text: "text-text-dim" },
  disconnected: { ring: "border-dashed border-ink-line text-text-dim", glyph: "", text: "text-text-dim line-through" },
};

/** The run's steps as a vertical timeline, in plain language. */
export function StepTimeline({ steps }: { steps: RunSummary["steps"] }) {
  const shown = steps.filter((s) => s.state !== "disconnected");
  return (
    <ol className="flex flex-col" data-testid="step-timeline">
      {shown.map((step, i) => {
        const st = STATE_STYLE[step.state];
        return (
          <li key={step.order} className="flex gap-3" data-state={step.state}>
            <div className="flex flex-col items-center">
              <span
                className={`w-5 h-5 shrink-0 rounded-full border flex items-center justify-center text-[10px] font-mono ${st.ring}`}
              >
                {st.glyph}
              </span>
              {i < shown.length - 1 && <span className="w-px flex-1 bg-ink-line my-0.5" />}
            </div>
            <div className={`pb-3 -mt-0.5 text-sm leading-snug ${st.text}`}>
              {step.label}
              {step.note && (
                <span className="ml-2 text-[11px] font-mono text-text-dim">{step.note}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
