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

// "What does your business do?" — the customer types it in plain words and picks the closest line from the official NIC
// list; the 2-digit, 4-digit and 5-digit codes the portal asks for then fill in below the box. The box stays on screen
// (showing the picked line) so they can always type again; typing clears the codes until a new line is picked.
export function NicSearch({ inputId, code, error, onPick }: NicSearchProps) {
  // What the customer has typed since the last pick; null = show the picked line's own wording.
  const [typed, setTyped] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const chosen = useMemo(() => (/^\d{5}$/.test(code) ? nicByCode(code) : null), [code]);
  const text = typed ?? chosen?.name ?? "";
  const hits = useMemo(() => (open && typed !== null ? searchNic(typed) : []), [typed, open]);

  return (
    <div className="nic-search">
      <input
        id={inputId}
        className={`rv-input${text.trim() ? "" : " nic-blink"}`}
        type="text"
        autoComplete="off"
        data-testid="nic-query"
        aria-invalid={!!error}
        placeholder="Type what your business does, e.g. grocery shop, tailoring, mobile repair"
        value={text}
        onChange={(e) => {
          setTyped(e.target.value);
          setOpen(true);
          if (chosen) onPick(null); // the old codes no longer match the text
        }}
        onFocus={(e) => {
          // A picked line is a whole sentence: selecting it lets the customer just start typing something new.
          if (typed === null && chosen) e.target.select();
        }}
      />
      {typed !== null && typed.trim().length >= 3 && hits.length === 0 && (
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
                onClick={() => {
                  setOpen(false);
                  setTyped(null);
                  onPick(h);
                }}
              >
                <span className="nic-hit-name">{h.name}</span>
                <span className="nic-hit-sub">{h.className}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {chosen ? (
        <div data-testid="nic-chosen" className="nic-chosen">
          <div className="nic-codes" aria-label="Chosen activity codes">
            <span className="nic-chip"><b>{chosen.division}</b><i>NIC 2 digit</i></span>
            <span className="nic-chip"><b>{chosen.classCode}</b><i>NIC 4 digit</i></span>
            <span className="nic-chip main"><b>{chosen.code}</b><i>NIC 5 digit</i></span>
          </div>
        </div>
      ) : (
        <div className="nic-help">Type your work, then pick the line that is closest. The NIC codes fill in for you.</div>
      )}
    </div>
  );
}
