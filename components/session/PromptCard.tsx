"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { publicSession } from "@/lib/public-api";
import { ApiError } from "@/lib/api";
import { PublicAwaiting } from "@/lib/types";
import { OtpBoxes } from "./OtpBoxes";
import { BRAND_NAME } from "@/lib/brand";

// Where the person is asked for a value — an OTP, a CAPTCHA, a code. Only ever
// a value: there is no selector, skip or "fix it" control here by design, and
// the server would refuse them anyway. Styled by the end-user window's
// session.css (.jbs).
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
      <div data-testid="prompt-sent" className="note ok">
        <b>Thanks — got it</b>
        <div>Continuing now. You can keep this page open.</div>
      </div>
    );
  }

  const hint =
    isOtp && !/\d+[- ]?digit/i.test(awaiting.prompt)
      ? `Enter the ${otpLength}-digit code you received.`
      : awaiting.kind === "captcha"
        ? "Type the characters exactly as shown in the picture."
        : null;

  return (
    <form onSubmit={submit} data-testid="prompt-card" data-kind={awaiting.kind} className="card ask">
      <h3>Action needed · we&apos;re paused</h3>
      <h2>{awaiting.prompt}</h2>
      {hint && <p className="hint">{hint}</p>}

      {awaiting.hasImage && (
        <div>
          <div className="captcha">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img data-testid="prompt-image" src={image} alt="The image to read" />
            ) : (
              <span>{imageError ? "couldn't load the image" : "loading image…"}</span>
            )}
          </div>
          <button type="button" className="reload" onClick={() => setImageNonce((n) => n + 1)}>
            Can&apos;t read it? Reload image
          </button>
        </div>
      )}

      {isOtp ? (
        <div className="boxes">
          <OtpBoxes
            length={otpLength}
            value={value}
            onChange={setValue}
            disabled={submitting}
            boxClassName="otpbox"
            onComplete={() => {
              /* explicit confirm below — never auto-submit a code */
            }}
          />
        </div>
      ) : (
        <input
          data-testid="prompt-input"
          className="field"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={64}
          disabled={submitting}
          placeholder={awaiting.kind === "captcha" ? "Type what you see" : "Type it here"}
        />
      )}

      {error && (
        <p role="alert" className="err">
          {error}
        </p>
      )}

      <button type="submit" data-testid="prompt-submit" className="btn" disabled={!ready || submitting}>
        {submitting ? "Sending…" : "Submit & continue"}
      </button>
      {isOtp && (
        <p data-testid="otp-caution" className="caution">
          Only enter this code if you asked {BRAND_NAME} to do this for you.
        </p>
      )}
    </form>
  );
}
