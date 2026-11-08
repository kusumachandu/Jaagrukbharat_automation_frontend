"use client";

import { useMemo, useState } from "react";
import { NicHit, nicByCode, searchNic } from "@/lib/nicSearch";

interface NicSearchProps {
  inputId: string;
  // The 5-digit code now on the form ("" = none yet).
  code: string;
  error?: string;
  // Called when a result is picked (or cleared): the form stores the 5-digit code and the activity wording.
  onPick: (hit: NicHit | null) => void;
}

// "What does your business do?" — the customer types it in plain words, picks the closest line from the official NIC
// list, and the 2-digit, 4-digit and 5-digit codes the portal asks for are filled in for them.
export function NicSearch({ inputId, code, error, onPick }: NicSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(true);
  const chosen = useMemo(() => (/^\d{5}$/.test(code) ? nicByCode(code) : null), [code]);
  const hits = useMemo(() => (open ? searchNic(query) : []), [query, open]);

  if (chosen) {
    return (
      <div data-testid="nic-chosen" className="nic-chosen">
        <div className="nic-codes" aria-label="Chosen activity codes">
          <span className="nic-chip"><b>{chosen.division}</b><i>Division</i></span>
          <span className="nic-chip"><b>{chosen.classCode}</b><i>Class</i></span>
          <span className="nic-chip main"><b>{chosen.code}</b><i>Activity</i></span>
        </div>
        <div className="nic-name">{chosen.name}</div>
        <button type="button" className="nic-change" data-testid="nic-change" onClick={() => { onPick(null); setQuery(""); setOpen(true); }}>
          Not right? Search again
        </button>
      </div>
    );
  }

  return (
    <div className="nic-search">
      <input
        id={inputId}
        className={`rv-input${query.trim() ? "" : " nic-blink"}`}
        type="text"
        autoComplete="off"
        data-testid="nic-query"
        aria-invalid={!!error}
        placeholder="Type what your business does, e.g. grocery shop, tailoring, mobile repair"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
      />
      {query.trim().length >= 3 && hits.length === 0 && (
        <div className="nic-none" data-testid="nic-none">
          Nothing found. Try a simpler word, for example the main thing you sell or make.
        </div>
      )}
      {hits.length > 0 && (
        <ul className="nic-list" role="listbox" data-testid="nic-results">
          {hits.map((h) => (
            <li key={h.code}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="nic-hit"
                data-testid={`nic-hit-${h.code}`}
                onClick={() => { setOpen(false); onPick(h); }}
              >
                <span className="nic-hit-name">{h.name}</span>
                <span className="nic-hit-sub">{h.className}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="nic-help">Pick the line that is closest to your work. The codes are filled in for you.</div>
    </div>
  );
}
