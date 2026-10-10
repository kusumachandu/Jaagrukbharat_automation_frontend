"use client";

import { useRef, useState } from "react";

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// A drag-and-drop file picker in the app's style, replacing the browser's
// default "Choose file" button. Still a real <input type="file"> underneath
// (visually hidden), so keyboard and screen-reader use work as normal.
export function FileDropzone({
  file,
  onFile,
  accept,
  hint,
  maxBytes,
  testId,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  // Extensions, e.g. ".xlsx". Files that don't match are refused with a message.
  accept: string;
  hint?: string;
  maxBytes?: number;
  testId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function take(f: File | undefined) {
    if (!f) return;
    const allowed = accept.split(",").map((a) => a.trim().toLowerCase());
    if (!allowed.some((ext) => f.name.toLowerCase().endsWith(ext))) {
      setProblem(`That isn't a ${allowed.join(" / ")} file`);
      return;
    }
    if (maxBytes && f.size > maxBytes) {
      setProblem(`That file is ${size(f.size)} — the limit is ${size(maxBytes)}`);
      return;
    }
    setProblem(null);
    onFile(f);
  }

  function clear() {
    setProblem(null);
    onFile(null);
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept={accept}
        data-testid={testId}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => take(e.target.files?.[0])}
      />
      {file ? (
        <div className="flex items-center gap-3 rounded-lg border border-signal/40 bg-signal/5 px-4 py-3">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="text-ok shrink-0">
            <path
              d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M14 3v5h5M9 14l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-text-primary font-mono">{file.name}</div>
            <div className="text-xs text-text-muted">{size(file.size)} · ready to upload</div>
          </div>
          <button type="button" onClick={() => input.current?.click()} className="btn-ghost">
            Change
          </button>
          <button type="button" onClick={clear} aria-label="Remove file" className="btn-ghost">
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            take(e.dataTransfer.files?.[0]);
          }}
          className={`w-full rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
            over
              ? "border-signal bg-signal/10"
              : "border-ink-line bg-ink-raised/40 hover:border-signal/50 hover:bg-signal/5"
          }`}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" className="mx-auto mb-2 text-signal">
            <path d="M12 16V4m0 0L7 9m5-5l5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <div className="text-sm text-text-primary">
            <span className="text-signal font-semibold">Click to choose</span> or drag a file here
          </div>
          {hint && <div className="mt-1 text-xs text-text-muted">{hint}</div>}
        </button>
      )}
      {problem && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
