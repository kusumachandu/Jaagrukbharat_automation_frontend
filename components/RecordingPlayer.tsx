"use client";

import { useEffect, useState } from "react";
import { fetchAuthedBlobUrl, ApiError } from "@/lib/api";

// The run's own screen recording (Playwright's webm, saved once the run
// ends) — fetched as an authenticated blob since a plain <video src> can't
// carry a bearer token. See lib/api.ts's fetchAuthedBlobUrl for the tradeoff
// (loads the whole file up front rather than streaming it as it seeks).
export function RecordingPlayer({ runId }: { runId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setError(null);
    fetchAuthedBlobUrl(`/runs/${runId}/recording`)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        objectUrl = u;
        setUrl(u);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Could not load the recording");
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [runId]);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-danger text-sm font-mono">
        {error}
      </div>
    );
  }

  if (!url) {
    return (
      <div className="h-full flex items-center justify-center text-text-dim text-sm font-mono">
        loading recording…
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center bg-black">
      <video
        data-testid="recording-player"
        src={url}
        controls
        className="max-h-full max-w-full"
      />
    </div>
  );
}
