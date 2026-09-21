import { ActionLog, ActionResult } from '@/lib/types';

const RESULT_COLOR: Record<ActionResult, string> = {
  [ActionResult.OK]: 'text-ok',
  [ActionResult.FALLBACK_USED]: 'text-signal',
  [ActionResult.ERROR]: 'text-danger',
  [ActionResult.MANUAL_INPUT]: 'text-warn',
  [ActionResult.MANUAL_FIX]: 'text-warn',
  [ActionResult.MANUAL_SKIP]: 'text-text-muted',
};

export function LogConsole({ logs }: { logs: ActionLog[] }) {
  if (logs.length === 0) {
    return <p className="text-text-dim font-mono text-xs px-4 py-3">no log entries yet</p>;
  }

  return (
    <div className="font-mono text-xs divide-y divide-ink-line">
      {logs.map((log) => (
        <div key={log._id} className="px-4 py-2.5 flex items-start gap-3">
          <span className="text-text-dim shrink-0 w-16">
            {new Date(log.timestamp).toLocaleTimeString()}
          </span>
          <span className="text-text-dim shrink-0">#{log.stepOrder}</span>
          <span className={`shrink-0 uppercase ${RESULT_COLOR[log.result]}`}>{log.result}</span>
          <span className="text-text-muted truncate">
            {log.selectorUsed && <span className="text-text-primary">{log.selectorUsed}</span>}
            {log.errorMessage && <span className="ml-2 text-danger">{log.errorMessage}</span>}
            {log.extractedValue && <span className="ml-2 text-ok">→ {log.extractedValue}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
