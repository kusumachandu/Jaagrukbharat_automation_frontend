"use client";

/** 1 … 4 5 [6] 7 8 … 20 — always the first and last page, a window around the current one, gaps as ellipses. */
function pagesToShow(page: number, pages: number): Array<number | "gap"> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: Array<number | "gap"> = [1];
  const lo = Math.max(2, page - 1);
  const hi = Math.min(pages - 1, page + 1);
  if (lo > 2) out.push("gap");
  for (let p = lo; p <= hi; p++) out.push(p);
  if (hi < pages - 1) out.push("gap");
  out.push(pages);
  return out;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  sizes = [12, 24, 48],
  noun = "runs",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize?: (n: number) => void;
  sizes?: number[];
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = "min-w-8 h-8 px-2 rounded-md text-xs font-mono transition-colors disabled:opacity-35 disabled:pointer-events-none";

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
      <p className="text-xs text-text-muted tabular-nums">
        <span className="text-text-primary">{from.toLocaleString("en-IN")}–{to.toLocaleString("en-IN")}</span> of {total.toLocaleString("en-IN")} {noun}
      </p>
      <div className="flex items-center gap-1">
        <button className={`${btn} text-text-muted hover:text-text-primary hover:bg-ink-raised border border-ink-line`} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          ‹ Prev
        </button>
        {pagesToShow(page, pages).map((p, i) =>
          p === "gap" ? (
            <span key={`g${i}`} className="px-1 text-text-dim select-none" aria-hidden>…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              aria-current={p === page ? "page" : undefined}
              aria-label={`Page ${p}`}
              className={`${btn} ${p === page ? "bg-signal text-ink font-semibold" : "text-text-muted hover:text-text-primary hover:bg-ink-raised"}`}
            >
              {p}
            </button>
          ),
        )}
        <button className={`${btn} text-text-muted hover:text-text-primary hover:bg-ink-raised border border-ink-line`} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          Next ›
        </button>
      </div>
      {onPageSize ? (
        <label className="flex items-center gap-2 text-xs text-text-muted">
          Per page
          <select className="input !py-1 !text-xs" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
            {sizes.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      ) : (
        <span />
      )}
    </nav>
  );
}
