'use client';

import { FormEvent, useState } from 'react';
import {
  Intervention,
  InterventionType,
  ResolutionAction,
  Step,
  StepType,
  STEP_TYPE_LABEL,
} from '@/lib/types';

interface InterventionPanelProps {
  intervention: Intervention;
  step?: Step;
  onResolve: (action: ResolutionAction, value?: string) => Promise<void>;
}

// Manual takeover offers two different fixes for the same failed step:
// "the data was wrong" (retype the value, same element) vs "the page
// changed" (a new CSS selector, same value). Defaulting to value-fix
// keeps the common case (stale OTP, typo) out of CSS-selector territory.
// The one exception is the AWAIT_INPUT follow-up (see below) — there,
// the value already worked, so only a selector fix is offered at all.
type FixMode = 'value' | 'selector';

export function InterventionPanel({ intervention, step, onResolve }: InterventionPanelProps) {
  const [value, setValue] = useState('');
  const [fixMode, setFixMode] = useState<FixMode>('value');
  const [busy, setBusy] = useState<ResolutionAction | null>(null);
  const isInput = intervention.type === InterventionType.INPUT_REQUIRED;

  // An AWAIT_INPUT step's own value/OTP already succeeded — this
  // MANUAL_TAKEOVER only ever shows up here because the recorded
  // selector(s) for that field didn't match the live page. Only a
  // selector fix applies; there's no "value was wrong" mode to offer.
  const isAwaitInputFollowUp = !isInput && step?.type === StepType.AWAIT_INPUT;
  const boxCount = step?.selectors?.length ?? 0;
  const isMultiBoxFix = isAwaitInputFollowUp && boxCount > 1;
  const effectiveFixMode: FixMode = isAwaitInputFollowUp ? 'selector' : fixMode;

  async function submitValue(e: FormEvent) {
    e.preventDefault();
    const action =
      isInput || effectiveFixMode === 'value'
        ? ResolutionAction.PROVIDE_VALUE
        : ResolutionAction.PROVIDE_SELECTOR;
    setBusy(action);
    try {
      await onResolve(action, value);
    } finally {
      setBusy(null);
    }
  }

  async function quick(action: ResolutionAction) {
    setBusy(action);
    try {
      await onResolve(action);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border border-warn/40 bg-warn/10 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-1.5 h-1.5 rounded-full bg-warn pulse-soft" />
        <span className="font-mono text-xs uppercase tracking-wider text-warn">
          {isInput ? 'Needs a value from you' : 'Needs your help to continue'}
        </span>
      </div>
      <p className="text-text-primary text-sm mb-3">{intervention.prompt}</p>

      {!isInput && step && (
        <div className="rounded-md border border-ink-line bg-ink-raised px-3 py-2 mb-3 text-xs font-mono text-text-muted">
          <div>
            step {intervention.stepOrder} · {STEP_TYPE_LABEL[step.type]}
          </div>
          {step.value && (
            <div className="mt-1 text-text-dim">
              tried to enter: <span className="text-text-muted">"{step.value}"</span>
            </div>
          )}
          {isAwaitInputFollowUp && (
            <div className="mt-1 text-text-dim">
              your value was accepted — only the target element(s) need fixing
            </div>
          )}
        </div>
      )}

      {!isInput && !isAwaitInputFollowUp && (
        <div className="flex gap-1.5 mb-2">
          <button
            type="button"
            onClick={() => setFixMode('value')}
            className={`flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors ${
              fixMode === 'value'
                ? 'border-signal/50 bg-signal/10 text-signal'
                : 'border-ink-line text-text-muted hover:text-text-primary'
            }`}
          >
            The data was wrong (e.g. stale OTP)
          </button>
          <button
            type="button"
            onClick={() => setFixMode('selector')}
            className={`flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors ${
              fixMode === 'selector'
                ? 'border-signal/50 bg-signal/10 text-signal'
                : 'border-ink-line text-text-muted hover:text-text-primary'
            }`}
          >
            The page changed (technical)
          </button>
        </div>
      )}

      <form onSubmit={submitValue} className="flex gap-2 mb-2">
        {isMultiBoxFix ? (
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`${boxCount} CSS selectors, one per line in order — or a single selector that matches all the boxes`}
            rows={boxCount}
            className="input flex-1 font-mono text-xs"
            autoFocus
          />
        ) : (
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              isInput
                ? boxCount > 1
                  ? `Enter the ${boxCount}-character value (e.g. OTP)`
                  : 'Enter the value (e.g. OTP or CAPTCHA)'
                : effectiveFixMode === 'value'
                  ? 'Corrected value to enter'
                  : 'CSS selector, e.g. #otp-input'
            }
            className={`input flex-1 ${isInput || effectiveFixMode === 'selector' ? 'font-mono' : ''}`}
            autoFocus
          />
        )}
        <button
          type="submit"
          disabled={!value || busy !== null}
          className="rounded-md bg-signal text-ink font-semibold text-sm px-4 disabled:opacity-40 self-start"
        >
          {busy === ResolutionAction.PROVIDE_VALUE || busy === ResolutionAction.PROVIDE_SELECTOR
            ? 'Sending…'
            : 'Submit'}
        </button>
      </form>
      {!isInput && effectiveFixMode === 'selector' && (
        <p className="text-[11px] text-text-dim mb-2">
          {isAwaitInputFollowUp
            ? "Only use this if you know CSS — it targets the element(s) on the page. Not sure? Skip or abort below; you won't need to re-enter the value if you retry."
            : 'Only use this if you know CSS — it targets a specific element on the page. Not sure? Use ' +
              '"the data was wrong" instead, or skip/abort below.'}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => quick(ResolutionAction.SKIP)}
          disabled={busy !== null}
          className="btn-ghost text-xs disabled:opacity-40"
        >
          {busy === ResolutionAction.SKIP ? 'Skipping…' : 'Skip this step'}
        </button>
        <button
          onClick={() => quick(ResolutionAction.ABORT)}
          disabled={busy !== null}
          className="btn-ghost text-xs hover:text-danger hover:border-danger/40 disabled:opacity-40"
        >
          {busy === ResolutionAction.ABORT ? 'Aborting…' : 'Abort run'}
        </button>
      </div>
    </div>
  );
}
