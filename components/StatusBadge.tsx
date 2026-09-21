import { RunStatus } from '@/lib/types';

const STYLES: Record<RunStatus, { dot: string; text: string; label: string; pulse?: boolean }> = {
  [RunStatus.QUEUED]: { dot: 'bg-text-dim', text: 'text-text-muted', label: 'Queued' },
  [RunStatus.RUNNING]: { dot: 'bg-signal', text: 'text-signal', label: 'Running', pulse: true },
  [RunStatus.PAUSED]: { dot: 'bg-warn', text: 'text-warn', label: 'Waiting on you', pulse: true },
  [RunStatus.SUCCESS]: { dot: 'bg-ok', text: 'text-ok', label: 'Success' },
  [RunStatus.FAILED]: { dot: 'bg-danger', text: 'text-danger', label: 'Failed' },
  [RunStatus.CANCELLED]: { dot: 'bg-text-dim', text: 'text-text-muted', label: 'Cancelled' },
};

export function StatusBadge({ status }: { status: RunStatus }) {
  const s = STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide ${s.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${s.pulse ? 'pulse-soft' : ''}`} />
      {s.label}
    </span>
  );
}
