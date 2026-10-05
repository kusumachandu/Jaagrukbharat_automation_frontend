import { ResultTable } from "@/lib/types";

// Tables a run read off a results page (e.g. a vehicle's challans).
// "cards": one card per row — the end-user window, which is phone-sized.
// "table": a scrollable table — the operator dashboard.
export function ResultTables({ tables, variant }: { tables: ResultTable[]; variant: "cards" | "table" }) {
  if (tables.length === 0) return null;
  return (
    <div data-testid="result-tables" className={variant === "cards" ? "rtables" : "flex flex-col gap-4"}>
      {tables.map((t, ti) =>
        variant === "cards" ? <CardsTable key={ti} table={t} /> : <WideTable key={ti} table={t} />,
      )}
    </div>
  );
}

function heading(t: ResultTable) {
  const count = `${t.rows.length} ${t.rows.length === 1 ? "row" : "rows"}`;
  // The page's own heading often already says how many ("STATE : AP  2 Challans").
  return { title: t.caption ?? t.label, count: t.caption && /\d/.test(t.caption) ? null : count };
}

function CardsTable({ table }: { table: ResultTable }) {
  const { title, count } = heading(table);
  return (
    <section className="rtable">
      <div className="rhead">
        <b>{title}</b>
        {count && <span>{count}</span>}
      </div>
      {table.rows.length === 0 ? (
        <p className="rnone">Nothing listed.</p>
      ) : (
        table.rows.map((row, ri) => (
          <div key={ri} className="rcard" data-testid="result-row">
            {table.columns.map((col, ci) =>
              row[ci] ? (
                <div key={ci} className="rcell">
                  <span>{col}</span>
                  <b>{row[ci]}</b>
                </div>
              ) : null,
            )}
          </div>
        ))
      )}
    </section>
  );
}

function WideTable({ table }: { table: ResultTable }) {
  const { title, count } = heading(table);
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-mono uppercase tracking-wider text-text-dim mb-1.5">
        {title}
        {count && <span className="ml-2 normal-case">{count}</span>}
      </div>
      <div className="overflow-x-auto rounded-md border border-ink-line">
        <table className="w-full text-xs">
          <thead className="bg-ink-raised">
            <tr>
              {table.columns.map((c, i) => (
                <th key={i} className="text-left font-mono font-medium text-text-muted px-2.5 py-2 whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => (
              <tr key={ri} className="border-t border-ink-line" data-testid="result-row">
                {table.columns.map((_, ci) => (
                  <td key={ci} className="px-2.5 py-2 text-text-primary align-top">
                    {row[ci]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
