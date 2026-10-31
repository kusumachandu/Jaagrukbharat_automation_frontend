"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { api, getToken } from "@/lib/api";

const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE_URL ?? "http://localhost:4000";
// The CDP screencast push stream can stall silently (e.g. an in-flight
// restart racing a page navigation) and just stop delivering frames with
// no error — polling a fresh on-demand screenshot on top guarantees the
// displayed frame is never more than this many ms stale, regardless of
// whether the push stream is healthy.
const SCREENSHOT_POLL_MS = 2000;
const SCREENSHOT_POLL_CONTROL_MS = 1000;
const MOUSE_MOVE_THROTTLE_MS = 50;
// The browser the engine drives is this size unless the server says otherwise.
const DEFAULT_VIEWPORT = { width: 1280, height: 1600 };

interface LiveBrowserViewProps {
  runId: string;
  active: boolean; // only connect while the run is actually queued/running/paused
  // A person is driving the browser: mouse, scroll, typing and paste are sent to it.
  controlling?: boolean;
  viewport?: { width: number; height: number } | null;
  // The server took control away (resume / cancel / run ended).
  onControlEnded?: () => void;
}

type ControlInput =
  | { kind: "mouse"; action: "move" | "down" | "up" | "wheel"; x: number; y: number; button?: "left" | "right" | "middle"; deltaX?: number; deltaY?: number }
  | { kind: "key"; action: "press" | "type"; key: string }
  | { kind: "paste"; text: string };

const BUTTONS: Array<"left" | "middle" | "right"> = ["left", "middle", "right"];

// Printable characters are typed; named keys and shortcuts are pressed.
function keyAction(e: React.KeyboardEvent): ControlInput | null {
  if (e.key === "Dead" || e.key === "Process" || e.key === "Unidentified") return null;
  const modifiers = [e.ctrlKey || e.metaKey ? "Control" : "", e.altKey ? "Alt" : ""].filter(Boolean);
  if (e.key.length === 1 && modifiers.length === 0) return { kind: "key", action: "type", key: e.key };
  if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) return null;
  const name = e.key.length === 1 ? (e.key === " " ? "Space" : e.key.toLowerCase()) : e.key;
  return {
    kind: "key",
    action: "press",
    key: [...modifiers, e.shiftKey && e.key.length > 1 ? "Shift" : "", name].filter(Boolean).join("+"),
  };
}

export function LiveBrowserView({
  runId,
  active,
  controlling = false,
  viewport,
  onControlEnded,
}: LiveBrowserViewProps) {
  const [frame, setFrame] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // How the picture is sized: "width" fills the panel's width at full size (scroll down for the rest of the
  // page); "screen" shrinks the whole page to fit the available height. Full screen uses "screen" at first.
  const [fit, setFit] = useState<"width" | "screen">("width");
  const [isFull, setIsFull] = useState(false);
  const lastMove = useRef(0);
  const endedCb = useRef(onControlEnded);
  endedCb.current = onControlEnded;

  useEffect(() => {
    if (!active) return;

    // The login token lets the server tell who is sending input; watching works without it.
    const socket = io(`${WS_BASE}/live-view`, {
      transports: ["websocket"],
      auth: { token: getToken() ?? "" },
    });
    socketRef.current = socket;

    socket.on("connect", () => socket.emit("subscribe", { runId }));
    socket.on("frame", (payload: { dataUrl: string }) =>
      setFrame(payload.dataUrl)
    );
    socket.on("status", (payload: { status: "started" | "stopped" }) => {
      if (payload.status === "stopped") setEnded(true);
    });
    socket.on("control", (payload: { controlled: boolean }) => {
      if (!payload.controlled) endedCb.current?.();
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
    const interval = setInterval(
      poll,
      controlling ? SCREENSHOT_POLL_CONTROL_MS : SCREENSHOT_POLL_MS
    );
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [runId, active, controlling]);

  // Full screen: the whole live view (picture + its buttons) goes full screen; Esc or the button leaves it.
  useEffect(() => {
    function onChange() {
      const full = document.fullscreenElement === rootRef.current;
      setIsFull(full);
      setFit(full ? "screen" : "width");
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFullScreen() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void rootRef.current?.requestFullscreen?.().catch(() => {});
  }

  const send = (input: ControlInput) =>
    socketRef.current?.emit("control:input", { runId, input });

  // Pixel on screen -> pixel in the browser's page (the picture is scaled to fit).
  function toPage(clientX: number, clientY: number) {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    // Outside the picture (the empty margin around it) is not a spot on the page.
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const size =
      viewport ??
      (img.naturalWidth
        ? { width: img.naturalWidth, height: img.naturalHeight }
        : DEFAULT_VIEWPORT);
    return {
      x: ((clientX - rect.left) / rect.width) * size.width,
      y: ((clientY - rect.top) / rect.height) * size.height,
    };
  }

  // The wheel needs a non-passive listener to stop the page behind from scrolling too.
  useEffect(() => {
    const stage = stageRef.current;
    if (!controlling || !stage) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const at = toPage(e.clientX, e.clientY);
      if (!at) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 600 : 1; // lines / pages -> pixels
      send({
        kind: "mouse",
        action: "wheel",
        ...at,
        deltaX: e.deltaX * unit,
        deltaY: e.deltaY * unit,
      });
    }
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlling, viewport, runId, frame === null]);

  useEffect(() => {
    if (controlling) stageRef.current?.focus();
  }, [controlling, frame === null]);

  if (!active) {
    return (
      <div className="h-full flex items-center justify-center text-text-dim font-mono text-xs">
        browser not running
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      data-testid="live-view"
      data-fit={fit}
      data-fullscreen={isFull}
      className="h-full relative bg-black/40"
      style={isFull ? { background: "#000" } : undefined}
    >
      {controlling && (
        <div className="absolute top-2 left-2 z-10 rounded-md bg-signal/90 text-black px-2 py-1 text-[11px] font-mono uppercase tracking-wider">
          You are controlling the browser
        </div>
      )}
      {frame && (
        <div className="absolute top-2 right-4 z-10 flex gap-1.5">
          <button
            type="button"
            data-testid="live-fit"
            onClick={() => setFit((f) => (f === "width" ? "screen" : "width"))}
            title={fit === "width" ? "Shrink the whole page to fit the panel" : "Show at full size (scroll for the rest)"}
            className="rounded-md bg-black/65 hover:bg-black/85 text-white px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider"
          >
            {fit === "width" ? "Fit page" : "Full size"}
          </button>
          <button
            type="button"
            data-testid="live-fullscreen"
            onClick={toggleFullScreen}
            title={isFull ? "Leave full screen (Esc)" : "Click to view the live browser full screen"}
            className="rounded-md bg-black/65 hover:bg-black/85 text-white px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider"
          >
            {isFull ? "✕ Exit full screen" : "⛶ Full screen"}
          </button>
        </div>
      )}
      {frame ? (
        <div className={`h-full w-full ${fit === "width" ? "overflow-y-auto overflow-x-hidden scroll-hover" : "flex items-center justify-center"}`}>
        <div
          ref={stageRef}
          data-testid="live-stage"
          tabIndex={controlling ? 0 : -1}
          className={`outline-none ${fit === "width" ? "w-full" : "h-full w-full flex items-center justify-center"} ${
            controlling ? "cursor-crosshair" : ""
          }`}
          onContextMenu={(e) => controlling && e.preventDefault()}
          onMouseMove={(e) => {
            if (!controlling) return;
            const now = Date.now();
            if (now - lastMove.current < MOUSE_MOVE_THROTTLE_MS) return;
            lastMove.current = now;
            const at = toPage(e.clientX, e.clientY);
            if (at) send({ kind: "mouse", action: "move", ...at });
          }}
          onMouseDown={(e) => {
            if (!controlling) return;
            e.preventDefault();
            stageRef.current?.focus();
            const at = toPage(e.clientX, e.clientY);
            if (at)
              send({ kind: "mouse", action: "down", ...at, button: BUTTONS[e.button] ?? "left" });
          }}
          onMouseUp={(e) => {
            if (!controlling) return;
            const at = toPage(e.clientX, e.clientY);
            if (at)
              send({ kind: "mouse", action: "up", ...at, button: BUTTONS[e.button] ?? "left" });
          }}
          onKeyDown={(e) => {
            if (!controlling) return;
            // Ctrl/Cmd+V is handled by the paste event, which carries the clipboard text.
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") return;
            e.preventDefault();
            const action = keyAction(e);
            if (action) send(action);
          }}
          onPaste={(e) => {
            if (!controlling) return;
            e.preventDefault();
            const text = e.clipboardData.getData("text");
            if (text) send({ kind: "paste", text });
          }}
        >
          <img
            ref={imgRef}
            src={frame}
            alt="live browser view"
            draggable={false}
            className={`select-none ${fit === "width" ? "block w-full h-auto" : "max-h-full max-w-full"} ${
              controlling ? "ring-2 ring-signal" : ""
            }`}
          />
        </div>
        </div>
      ) : (
        <div className="h-full flex items-center justify-center">
          <span className="text-text-dim font-mono text-xs">
            {ended ? "browser closed" : "connecting to live view…"}
          </span>
        </div>
      )}
    </div>
  );
}
