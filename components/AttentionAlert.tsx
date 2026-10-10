"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { InterventionType, RunListItem } from "@/lib/types";

// Fires the moment any run needs a person: a banner pinned to the top of every
// operator page, a short chime (once per new request), a flashing tab
// title and — if allowed — a desktop notification for when this tab is hidden.
//
// Browsers only let a page make sound after the person has interacted with it
// once, so the first click/keypress anywhere "unlocks" audio; until then the
// banner shows an "Enable sound" button.

const POLL_MS = 4000;
const MUTE_KEY = "autoflow_alert_muted";

function wants(run: RunListItem): string {
  return run.awaiting === InterventionType.MANUAL_TAKEOVER
    ? "needs a manual fix"
    : "is waiting for a value (CAPTCHA / OTP)";
}

export function AttentionAlert() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [waiting, setWaiting] = useState<RunListItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState(false);
  const [soundReady, setSoundReady] = useState(true);
  const ctxRef = useRef<AudioContext | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const baseTitle = useRef<string>("");

  const hidden =
    !user || pathname === "/login" || pathname === "/signup" || pathname?.startsWith("/session/");

  useEffect(() => {
    try {
      setMuted(window.localStorage.getItem(MUTE_KEY) === "1");
    } catch {
      // storage blocked — start unmuted
    }
  }, []);

  // --- audio -----------------------------------------------------------
  const audio = useCallback((): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current;
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctxRef.current = new Ctor();
    return ctxRef.current;
  }, []);

  const unlock = useCallback(async () => {
    const ctx = audio();
    if (!ctx) return;
    try {
      await ctx.resume();
    } catch {
      // still locked
    }
    setSoundReady(ctx.state === "running");
  }, [audio]);

  useEffect(() => {
    if (hidden) return;
    const onGesture = () => void unlock();
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, [hidden, unlock]);

  // A short, soft two-note chime (~0.6s) — a notification, not an alarm.
  const chime = useCallback(() => {
    const ctx = audio();
    if (!ctx || ctx.state !== "running") {
      setSoundReady(false);
      return;
    }
    const t0 = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t0 + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.45);
    });
  }, [audio]);

  // --- polling ---------------------------------------------------------
  useEffect(() => {
    if (hidden) return;
    let stop = false;
    const tick = async () => {
      try {
        const runs = await api.get<RunListItem[]>("/runs?limit=100");
        if (stop) return;
        const now = runs.filter((r) => r.awaiting !== null);
        setWaiting(now);
        // A run that stopped waiting can alert again if it ever waits again.
        const ids = new Set(now.map((r) => r._id));
        seen.current.forEach((id) => !ids.has(id) && seen.current.delete(id));
        setDismissed((d) => new Set(Array.from(d).filter((id) => ids.has(id))));
        const fresh = now.filter((r) => !seen.current.has(r._id));
        fresh.forEach((r) => seen.current.add(r._id));
        if (fresh.length > 0) {
          if (!muted) chime();
          notify(fresh[0], fresh.length);
        }
      } catch {
        // the page's own requests surface errors; the alert just tries again
      }
    };
    void tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [hidden, muted, chime]);

  const open = waiting.filter((r) => !dismissed.has(r._id));

  // Flash the tab title so it stands out among other tabs.
  useEffect(() => {
    if (hidden) return;
    if (!baseTitle.current) baseTitle.current = document.title;
    if (open.length === 0) {
      document.title = baseTitle.current;
      return;
    }
    let on = false;
    const t = setInterval(() => {
      on = !on;
      document.title = on ? `🚨 (${open.length}) Needs you` : baseTitle.current;
    }, 1000);
    return () => {
      clearInterval(t);
      document.title = baseTitle.current;
    };
  }, [hidden, open.length]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    try {
      window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    } catch {
      // not persisted — fine
    }
    void unlock();
  }

  if (hidden || open.length === 0) return null;

  return (
    <div
      role="alert"
      data-testid="attention-alert"
      className="fixed top-0 inset-x-0 z-[100] bg-danger text-white shadow-lg"
    >
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-3 text-sm">
        <span className="text-lg animate-pulse">🚨</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">
            {open.length === 1 ? "A run needs you now" : `${open.length} runs need you now`}
          </div>
          <div className="truncate opacity-90">
            {open
              .slice(0, 3)
              .map((r) => `${r.workflowName} ${wants(r)}`)
              .join(" · ")}
            {open.length > 3 ? ` · +${open.length - 3} more` : ""}
          </div>
        </div>
        {!soundReady && !muted && (
          <button
            onClick={() => {
              void unlock().then(chime);
            }}
            className="px-2 py-1 rounded bg-white/20 hover:bg-white/30 text-xs font-mono"
          >
            Enable sound
          </button>
        )}
        <button
          onClick={toggleMute}
          className="px-2 py-1 rounded bg-white/20 hover:bg-white/30 text-xs font-mono"
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        <Link
          href={open.length === 1 ? `/runs/${open[0]._id}` : "/sessions"}
          className="px-3 py-1 rounded bg-white text-danger font-semibold text-xs"
        >
          {open.length === 1 ? "Open" : "See all"}
        </Link>
        <button
          aria-label="Dismiss"
          onClick={() => setDismissed(new Set(open.map((r) => r._id).concat(Array.from(dismissed))))}
          className="px-1 text-white/80 hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// A desktop notification, for when this tab is in the background. Asked for
// once; silently skipped if the browser or the person says no.
function notify(run: RunListItem, count: number) {
  if (typeof Notification === "undefined" || document.visibilityState === "visible") return;
  const show = () =>
    new Notification(count > 1 ? `${count} runs need you` : "A run needs you", {
      body: `${run.workflowName} ${wants(run)}`,
      tag: "autoflow-attention",
    });
  if (Notification.permission === "granted") show();
  else if (Notification.permission === "default") {
    void Notification.requestPermission().then((p) => p === "granted" && show());
  }
}
