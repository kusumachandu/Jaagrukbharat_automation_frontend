"use client";

import { useEffect, useState } from "react";

export type ViewMode = "grid" | "list";

/** Grid or list, remembered per page in this browser (storage can be blocked: it then just doesn't remember). */
export function useViewMode(key: string, fallback: ViewMode = "grid"): [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(fallback);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`autoflow_view_${key}`);
      if (saved === "grid" || saved === "list") setMode(saved);
    } catch {
      /* storage unavailable */
    }
  }, [key]);
  const set = (m: ViewMode) => {
    setMode(m);
    try {
      window.localStorage.setItem(`autoflow_view_${key}`, m);
    } catch {
      /* storage unavailable */
    }
  };
  return [mode, set];
}

export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (m: ViewMode) => void }) {
  const btn = (m: ViewMode, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => onChange(m)}
      aria-pressed={value === m}
      aria-label={label}
      title={label}
      className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
        value === m ? "bg-signal/15 text-signal" : "text-text-muted hover:text-text-primary hover:bg-ink-raised"
      }`}
    >
      {icon}
    </button>
  );
  return (
    <div className="inline-flex rounded-md border border-ink-line bg-ink-panel p-0.5" role="group" aria-label="Layout">
      {btn(
        "grid",
        "Grid view",
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
        </svg>,
      )}
      {btn(
        "list",
        "List view",
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 6.5h16M4 12h16M4 17.5h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>,
      )}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder, wide }: { value: string; onChange: (v: string) => void; placeholder: string; wide?: boolean }) {
  return (
    <div className="relative">
      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.9" />
        <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`input !pl-8 ${wide ? "w-72" : "w-60"}`}
      />
    </div>
  );
}
