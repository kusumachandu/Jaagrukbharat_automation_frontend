"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { publicSession } from "@/lib/public-api";
import { ApiError } from "@/lib/api";
import { PublicAwaiting } from "@/lib/types";
import { OtpBoxes } from "./OtpBoxes";
import { NicSearch } from "@/components/start/NicSearch";
import { nicByCode } from "@/lib/nicSearch";
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

  // The NIC business activity the portal listed, to confirm: "YES", or the 5-digit code picked in the search below.
  const [nicCode, setNicCode] = useState("");

  async function submit(e?: FormEvent, override?: string) {
    e?.preventDefault();
    if (submitting || sent) return;
    setError(null);
    setSubmitting(true);
    try {
      await publicSession.answer(runId, sessionKey, override ?? value);
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

  if (awaiting.kind === "nic") {
    return (
      <div data-testid="prompt-card" data-kind="nic" className="card ask">
        <h3>Please confirm · we&apos;re paused</h3>
        <h2>Is this your type of business?</h2>
        <NicSummary prompt={awaiting.prompt} />
        <button type="button" data-testid="nic-confirm-yes" className="btn" disabled={submitting} onClick={() => submit(undefined, "YES")}>
          {submitting && !nicCode ? "Sending…" : "Yes, this is right"}
        </button>
        <p className="hint" style={{ marginTop: 18 }}>
          Not right? Search for your type of business and pick the correct one:
        </p>
        <NicSearch
          inputId="nic-confirm-search"
          code={nicCode}
          onPick={(hit) => setNicCode(hit ? hit.code : "")}
        />
        {nicCode && (
          <button type="button" data-testid="nic-confirm-use" className="btn" disabled={submitting} onClick={() => submit(undefined, nicCode)}>
            {submitting ? "Sending…" : "Use this one instead"}
          </button>
        )}
        {error && (
          <p role="alert" className="err">
            {error}
          </p>
        )}
      </div>
    );
  }

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

// The long official wording, broken into short points a business owner can read at a glance:
// "Manufacture of hume pipes and other pre-fabricated components of cement and/or concrete" becomes
// "Manufacture of:" with one point for the pipes and one for the other components.
function explain(name: string): { lead: string; points: string[] } {
  const m = /^(.*?(?:of|in|for))s+(.*)$/i.exec(name.trim());
  const lead = m ? m[1] : "";
  const rest = m ? m[2] : name;
  const points = rest
    .split(/;|,s*| and other | and (?=[a-z])/i)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  return { lead, points };
}

// What was added on the portal, laid out clearly: the industry and group in words, the activity in points, and the
// three codes. Read from the prompt ("… 23955 – name (Manufacturing). Is this …"); the industry and group come from our
// own NIC list when the code is in it.
function NicSummary({ prompt }: { prompt: string }) {
  const code = /([0-9]{5})/.exec(prompt)?.[1] ?? "";
  const hit = code ? nicByCode(code) : null;
  const typed = /[0-9]{5}s*[–-]s*(.*?)(?:s*(([^)]*)))?.s*Is this/i.exec(prompt);
  const name = hit?.name ?? typed?.[1] ?? "";
  const kind = typed?.[2] ?? "";
  if (!code || !name) return <p className="hint">{prompt}</p>;
  const { lead, points } = explain(name);
  return (
    <div data-testid="nic-summary" className="nic-summary">
      <dl>
        {hit && (
          <>
            <dt>Industry</dt>
            <dd>{hit.divisionName}</dd>
            <dt>Type of work</dt>
            <dd>{hit.className}</dd>
          </>
        )}
        <dt>Your activity</dt>
        <dd>
          {lead && <span className="nic-lead">{lead}</span>}
          {points.length > 1 ? (
            <ul className="nic-points">
              {points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : (
            <span> {points[0] ?? name}</span>
          )}
        </dd>
        {kind && (
          <>
            <dt>Activity type</dt>
            <dd>{kind}</dd>
          </>
        )}
      </dl>
      <div className="nic-codes" aria-label="Activity codes">
        <span className="nic-chip"><b>{code.slice(0, 2)}</b><i>Division</i></span>
        <span className="nic-chip"><b>{code.slice(0, 4)}</b><i>Class</i></span>
        <span className="nic-chip main"><b>{code}</b><i>Activity</i></span>
      </div>
    </div>
  );
}
