"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { publicSession } from "@/lib/public-api";
import { ApiError } from "@/lib/api";
import { PublicAwaiting } from "@/lib/types";
import { OtpBoxes } from "./OtpBoxes";

// Where the person is asked for a value — an OTP, a CAPTCHA, a code. Only ever
// a value: there is no selector, skip or "fix it" control here by design, and
// the server would refuse them anyway.
export function PromptCard({
  runId,
  sessionKey,
  awaiting,
  onAnswered,
}: {
  runId: string;
  sessionKey: string;
  awaiting: PublicAwaiting;
  onAnswered: () => void;
}) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [imageNonce, setImageNonce] = useState(0);

  const isOtp = awaiting.kind === "otp";
  const otpLength = awaiting.length ?? 6;

  const loadImage = useCallback(async () => {
    setImageError(false);
    try {
      const res = await publicSession.promptImage(runId, sessionKey);
      setImage(res.dataUrl);
    } catch {
      setImage(null);
      setImageError(true);
    }
  }, [runId, sessionKey]);

  useEffect(() => {
    if (awaiting.hasImage) loadImage();
  }, [awaiting.hasImage, awaiting.prompt, imageNonce, loadImage]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (submitting || sent) return;
    setError(null);
    setSubmitting(true);
    try {
      await publicSession.answer(runId, sessionKey, value);
      setSent(true);
      onAnswered();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't go through — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  const ready = isOtp ? value.length === otpLength : value.trim().length > 0;

  if (sent) {
    return (
      <div
        data-testid="prompt-sent"
        className="rounded-2xl border border-ok/40 bg-ok/10 px-5 py-6 text-center"
      >
        <div className="text-ok font-display font-semibold">Thanks — got it</div>
        <p className="text-sm text-text-muted mt-1">Continuing now. You can keep this page open.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      data-testid="prompt-card"
      data-kind={awaiting.kind}
      className="rounded-2xl border border-signal/50 bg-ink-panel shadow-glow px-5 py-6 sm:px-7 sm:py-7"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full bg-signal pulse-soft" />
        <span className="font-mono text-xs uppercase tracking-wider text-signal">
          We need something from you
        </span>
      </div>
      <p className="font-display text-lg sm:text-xl font-semibold text-text-primary leading-snug">
        {awaiting.prompt}
      </p>
      {isOtp && !/\d+[- ]?digit/i.test(awaiting.prompt) && (
        <p className="text-sm text-text-muted mt-1">
          Enter the {otpLength}-digit code you received.
        </p>
      )}

      {awaiting.hasImage && (
        <div className="mt-5">
          <div className="rounded-xl bg-white p-3 flex items-center justify-center min-h-[72px]">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                data-testid="prompt-image"
                src={image}
                alt="The image to read"
                className="max-h-56 w-auto max-w-full"
              />
            ) : (
              <span className="text-xs text-neutral-500 font-mono">
                {imageError ? "couldn't load the image" : "loading image…"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setImageNonce((n) => n + 1)}
            className="mt-1.5 text-xs text-text-muted hover:text-signal underline decoration-dotted underline-offset-2"
          >
            Reload image
          </button>
        </div>
      )}

      <div className="mt-5">
        {isOtp ? (
          <OtpBoxes
            length={otpLength}
            value={value}
            onChange={setValue}
            disabled={submitting}
            onComplete={() => {
              /* explicit confirm below — never auto-submit a code */
            }}
          />
        ) : (
          <input
            data-testid="prompt-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={64}
            disabled={submitting}
            placeholder={awaiting.kind === "captcha" ? "Type what you see above" : "Type it here"}
            className="input w-full text-lg py-3 text-center tracking-widest font-mono"
          />
        )}
      </div>

      {error && (
        <p role="alert" className="text-danger text-sm mt-3 text-center">
          {error}
        </p>
      )}

      <button
        type="submit"
        data-testid="prompt-submit"
        disabled={!ready || submitting}
        className="mt-5 w-full rounded-xl bg-signal text-ink font-semibold py-3 text-base hover:bg-signal-glow transition-colors disabled:opacity-40"
      >
        {submitting ? "Sending…" : "Continue"}
      </button>
    </form>
  );
}
