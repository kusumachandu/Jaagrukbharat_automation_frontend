"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { api } from "@/lib/api";

const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE_URL ?? "http://localhost:4000";
// The CDP screencast push stream can stall silently (e.g. an in-flight
// restart racing a page navigation) and just stop delivering frames with
// no error — polling a fresh on-demand screenshot on top guarantees the
// displayed frame is never more than this many ms stale, regardless of
// whether the push stream is healthy.
const SCREENSHOT_POLL_MS = 2000;

interface LiveBrowserViewProps {
  runId: string;
  active: boolean; // only connect while the run is actually queued/running/paused
}

export function LiveBrowserView({ runId, active }: LiveBrowserViewProps) {
  const [frame, setFrame] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!active) return;

    const socket = io(`${WS_BASE}/live-view`, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => socket.emit("subscribe", { runId }));
    socket.on("frame", (payload: { dataUrl: string }) =>
      setFrame(payload.dataUrl)
    );
    socket.on("status", (payload: { status: "started" | "stopped" }) => {
      if (payload.status === "stopped") setEnded(true);
    });

    return () => {
      socket.emit("unsubscribe", { runId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [runId, active]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await api.get<{ dataUrl: string }>(`/runs/${runId}/screenshot`);
        if (!cancelled) setFrame(res.dataUrl);
      } catch {
        // No active browser session yet (or between runs) — next tick retries.
      }
    }

    poll();
    const interval = setInterval(poll, SCREENSHOT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runId, active]);

  if (!active) {
    return (
      <div className="h-full flex items-center justify-center text-text-dim font-mono text-xs">
        browser not running
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center bg-black/40">
      {frame ? (
        <img
          src={frame}
          alt="live browser view"
          className="max-h-full max-w-full"
        />
      ) : (
        <span className="text-text-dim font-mono text-xs">
          {ended ? "browser closed" : "connecting to live view…"}
        </span>
      )}
    </div>
  );
}
