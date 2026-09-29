"use client";

import { ClipboardEvent, KeyboardEvent, useRef } from "react";

// One box per character. Typing advances, Backspace steps back, pasting or an
// SMS autofill (iOS/Android drop the whole code into the first box) spreads
// across the boxes. `value` is the code so far, with no gaps.
export function OtpBoxes({
  length,
  value,
  onChange,
  disabled,
  onComplete,
  boxClassName,
}: {
  length: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  onComplete?: () => void;
  // Replaces the default box styling (the branded end-user window has its own).
  boxClassName?: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  // Synchronous on purpose: deferring to the next frame lets a fast second
  // keystroke (two quick Backspaces, say) act on the box we just left.
  function focusBox(i: number) {
    refs.current[Math.max(0, Math.min(i, length - 1))]?.focus();
  }

  function commit(next: string, focusIndex: number) {
    const clipped = next.slice(0, length);
    onChange(clipped);
    focusBox(focusIndex);
    if (clipped.length === length) onComplete?.();
  }

  function handleChange(i: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      // cleared this box
      commit(value.slice(0, i) + value.slice(i + 1), i);
      return;
    }
    const hadChar = i < value.length;
    // Bulk entry (an SMS autofill drops the whole code in at once): more than
    // two digits can't be a keystroke, and two into an empty box can't either.
    // Spread from this box.
    if (digits.length > 2 || (digits.length === 2 && !hadChar)) {
      commit(value.slice(0, i) + digits, i + digits.length);
      return;
    }
    // A single typed digit; if the box was already filled the browser gives
    // us old+new, and the new one is last.
    const d = digits.slice(-1);
    commit(value.slice(0, i) + d + value.slice(i + 1), i + 1);
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !value[i] && i > 0) {
      e.preventDefault();
      commit(value.slice(0, i - 1) + value.slice(i), i - 1);
    } else if (e.key === "ArrowLeft") {
      focusBox(i - 1);
    } else if (e.key === "ArrowRight") {
      focusBox(i + 1);
    } else if (e.key === "Enter" && value.length === length) {
      onComplete?.();
    }
  }

  function handlePaste(i: number, e: ClipboardEvent<HTMLInputElement>) {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!digits) return;
    e.preventDefault();
    commit(value.slice(0, i) + digits, i + digits.length);
  }

  return (
    <div className="flex justify-center gap-2 sm:gap-3" data-testid="otp-boxes">
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          data-testid={`otp-box-${i}`}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={i === 0 ? length : 2}
          aria-label={`Digit ${i + 1} of ${length}`}
          disabled={disabled}
          value={value[i] ?? ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.currentTarget.select()}
          className={
            boxClassName ??
            "w-11 h-14 sm:w-12 sm:h-16 text-center text-2xl font-mono rounded-lg bg-ink-raised border border-ink-line text-text-primary outline-none focus:border-signal focus:ring-2 focus:ring-signal/30 disabled:opacity-50"
          }
        />
      ))}
    </div>
  );
}
