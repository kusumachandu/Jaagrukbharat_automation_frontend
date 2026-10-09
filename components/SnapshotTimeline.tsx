"use client";

import { useEffect, useState } from "react";
import { fetchAuthedBlobUrl, ApiError } from "@/lib/api";
import type { RunSnapshot } from "@/lib/types";

// The run's screenshots (one per action, plus the final result) — the light
// alternative to a full screen recording. Fetched as authenticated blobs since
// a plain <img src> can't carry a bearer token.
export function SnapshotTimeline({
  runId,
  snapshots,
}: {
  runId: string;
  snapshots: RunSnapshot[];
}) {
  const [index, setIndex] = useState(snapshots.length - 1);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A run still in progress gains screenshots — follow the newest unless the
  // person has stepped back.
  const last = snapshots.length - 1;
  useEffect(() => {
    setIndex((i) => (i >= last - 1 ? last : i));
  }, [last]);

  const current = snapshots[Math.min(index, last)];

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setError(null);
    fetchAuthedBlobUrl(`/runs/${runId}/snapshots/${current.n}`)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        objectUrl = u;
        setUrl(u);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Could not load the screenshot");
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [runId, current?.n]);

  if (!current) {
    return (
      <div className="h-full flex items-center justify-center text-text-dim text-sm font-mono">
        no screenshots yet
      </div>
    );
  }

  return (
    <div data-testid="snapshot-timeline" className="h-full flex flex-col bg-black">
      <div className="flex-1 min-h-0 flex items-center justify-center">
        {error ? (
          <span className="text-danger text-sm font-mono">{error}</span>
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={current.label} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-text-dim text-sm font-mono">loading…</span>
        )}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 border-t border-ink-line bg-ink text-xs font-mono">
        <button
          onClick={() => setIndex(Math.max(0, index - 1))}
          disabled={index <= 0}
          className="px-2 py-1 rounded text-text-muted disabled:opacity-30"
        >
          ‹ prev
        </button>
        <span className="flex-1 text-center text-text-muted truncate">
          {index + 1} / {snapshots.length} · {current.label} ·{" "}
          {new Date(current.at).toLocaleTimeString()}
        </span>
        <button
          onClick={() => setIndex(Math.min(last, index + 1))}
          disabled={index >= last}
          className="px-2 py-1 rounded text-text-muted disabled:opacity-30"
        >
          next ›
        </button>
      </div>
    </div>
  );
}
