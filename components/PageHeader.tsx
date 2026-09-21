export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-8 pt-8 pb-6 border-b border-ink-line">
      <div>
        {eyebrow && (
          <div className="font-mono text-xs uppercase tracking-widest text-signal mb-1">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-2xl font-semibold text-text-primary">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
