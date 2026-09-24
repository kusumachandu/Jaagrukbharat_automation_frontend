'use client';

import { Step, STEP_TYPE_ACCENT, STEP_TYPE_LABEL, ActionResult } from '@/lib/types';

export const NODE_WIDTH = 232;
export const NODE_HEIGHT = 128;
export const NODE_GAP = 72;

interface StepNodeProps {
  step: Step;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onToggle?: () => void;
  liveResult?: ActionResult | 'active';
  readOnly?: boolean;
  dragging?: boolean;
}

export function StepNode({
  step,
  index,
  selected,
  onSelect,
  onDelete,
  onToggle,
  liveResult,
  readOnly,
  dragging,
}: StepNodeProps) {
  const accent = STEP_TYPE_ACCENT[step.type];
  const disconnected = step.enabled === false;
  const isActive = liveResult === 'active';
  const isError = liveResult === ActionResult.ERROR;
  const isOk = liveResult === ActionResult.OK || liveResult === ActionResult.FALLBACK_USED || liveResult === ActionResult.MANUAL_FIX || liveResult === ActionResult.MANUAL_INPUT;

  return (
    <button
      onClick={onSelect}
      data-testid={`step-node-${index}`}
      data-disconnected={disconnected ? 'true' : undefined}
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT, borderLeftColor: accent }}
      className={`shrink-0 text-left bg-ink-panel border border-l-[3px] rounded-lg p-3.5 flex flex-col gap-2 transition-all
        ${disconnected ? 'border-dashed border-ink-line opacity-50' : 'border-ink-line'}
        ${selected ? 'ring-2 ring-signal/60 border-signal/40' : 'hover:border-text-dim'}
        ${isActive ? 'shadow-glow' : ''}
        ${dragging ? 'opacity-40' : ''}
        ${readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}
      `}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[10px] text-text-dim">#{index}</span>
          <span
            className="text-[11px] font-mono uppercase tracking-wider truncate"
            style={{ color: accent }}
          >
            {STEP_TYPE_LABEL[step.type]}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-signal pulse-soft" />}
          {isOk && <span className="w-1.5 h-1.5 rounded-full bg-ok" />}
          {isError && <span className="w-1.5 h-1.5 rounded-full bg-danger" />}
          {!readOnly && onToggle && (
            <span
              role="button"
              data-testid={`step-toggle-${index}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="text-[10px] font-mono uppercase tracking-wide text-text-dim hover:text-signal px-1 rounded border border-transparent hover:border-signal/40"
              title={
                disconnected
                  ? 'Connect this step back into the flow'
                  : 'Disconnect: skip this step when the workflow runs'
              }
            >
              {disconnected ? 'connect' : 'skip'}
            </span>
          )}
          {!readOnly && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="text-text-dim hover:text-danger text-xs font-mono px-1"
              title="Delete step"
            >
              ✕
            </span>
          )}
        </div>
      </div>

      <div className="font-mono text-xs text-text-primary truncate">
        {step.type === 'decide' ? (
          step.decision?.text || <span className="text-text-dim italic">no text to look for</span>
        ) : (
          step.selector || <span className="text-text-dim italic">no selector</span>
        )}
      </div>

      <div className="text-xs text-text-muted line-clamp-2 flex-1">
        {step.fallbackIntent || <span className="italic text-text-dim">describe what this does…</span>}
      </div>

      <div className="flex items-center gap-2 text-[10px] font-mono text-text-dim mt-auto pt-1 border-t border-ink-line">
        {disconnected ? (
          <span className="uppercase tracking-wide">disconnected — skipped when run</span>
        ) : (
          <>
            <span>{step.timeoutMs}ms</span>
            <span>·</span>
            <span className="uppercase">{step.retryPolicy.onFail}</span>
            {step.retryPolicy.onFail === 'retry' && <span>×{step.retryPolicy.retries + 1}</span>}
            {step.signInOnly && (
              <span
                data-testid={`sign-in-chip-${index}`}
                className="ml-auto rounded border border-signal/40 px-1 text-signal normal-case"
                title="Skipped once a saved sign-in exists"
              >
                sign-in
              </span>
            )}
            {step.branch && (
              <span
                data-testid={`branch-chip-${index}`}
                className={`${step.signInOnly ? '' : 'ml-auto'} rounded border border-ok/40 px-1 text-ok normal-case`}
                title={`Only runs on the "${step.branch}" branch`}
              >
                {step.branch}
              </span>
            )}
          </>
        )}
      </div>
    </button>
  );
}
