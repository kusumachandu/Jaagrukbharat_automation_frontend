'use client';

import { useState } from 'react';
import { Step, ActionResult } from '@/lib/types';
import { StepNode, NODE_WIDTH, NODE_HEIGHT, NODE_GAP } from './StepNode';

const PER_ROW = 4;
const ROW_GAP = 56;
const COL_PITCH = NODE_WIDTH + NODE_GAP;
const ROW_PITCH = NODE_HEIGHT + ROW_GAP;
const PAD = 32;

type Pos = { x: number; y: number; row: number; col: number };

function positionFor(index: number): Pos {
  const row = Math.floor(index / PER_ROW);
  const colInRow = index % PER_ROW;
  const col = row % 2 === 0 ? colInRow : PER_ROW - 1 - colInRow;
  return { x: PAD + col * COL_PITCH, y: PAD + row * ROW_PITCH, row, col };
}

// The line between two consecutive nodes, and the point halfway along it —
// where the "insert a step here" button sits.
function connectorGeometry(from: Pos, to: Pos) {
  if (from.row === to.row) {
    const goingRight = to.x > from.x;
    const fromX = from.x + (goingRight ? NODE_WIDTH : 0);
    const fromY = from.y + NODE_HEIGHT / 2;
    const toX = to.x + (goingRight ? 0 : NODE_WIDTH);
    const toY = to.y + NODE_HEIGHT / 2;
    return { d: `M ${fromX} ${fromY} L ${toX} ${toY}`, via: { x: (fromX + toX) / 2, y: fromY } };
  }
  const x = from.x + NODE_WIDTH / 2;
  const fromY = from.y + NODE_HEIGHT;
  const toY = to.y;
  return { d: `M ${x} ${fromY} L ${x} ${toY}`, via: { x, y: (fromY + toY) / 2 } };
}

interface WorkflowCanvasProps {
  steps: Step[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onDelete: (index: number) => void;
  onAdd: () => void;
  // Insert a new step right after `afterIndex`.
  onInsert?: (afterIndex: number) => void;
  // Move the step at `from` so it ends up at index `to`.
  onMove?: (from: number, to: number) => void;
  onToggle?: (index: number) => void;
  liveByOrder?: Record<number, ActionResult | 'active'>;
  readOnly?: boolean;
}

export function WorkflowCanvas({
  steps,
  selectedIndex,
  onSelect,
  onDelete,
  onAdd,
  onInsert,
  onMove,
  onToggle,
  liveByOrder,
  readOnly,
}: WorkflowCanvasProps) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const dragging = dragFrom !== null;

  const total = steps.length + (readOnly ? 0 : 1); // +1 slot for the "add" node
  const rows = Math.ceil(total / PER_ROW) || 1;
  const width = PAD * 2 + PER_ROW * COL_PITCH - NODE_GAP;
  const height = PAD * 2 + rows * ROW_PITCH - ROW_GAP;

  const positions = steps.map((_, i) => positionFor(i));
  const addPos = positionFor(steps.length);
  const editable = !readOnly;

  // Dropping a step on the connector after `k` puts it between k and k+1 as
  // they'll be *once it has been lifted out* — hence the shift when it came
  // from before that point.
  function dropOnConnector(k: number) {
    if (dragFrom === null || !onMove) return;
    const to = dragFrom <= k ? k : k + 1;
    if (to !== dragFrom) onMove(dragFrom, to);
    setDragFrom(null);
  }

  return (
    <div className="overflow-auto h-full bg-ink/60">
      <div className="relative" style={{ width, height, minWidth: '100%' }}>
        <svg
          width={width}
          height={height}
          className="absolute inset-0 pointer-events-none"
        >
          {positions.slice(0, -1).map((p, i) => {
            const next = positions[i + 1];
            const isLive = !!liveByOrder && liveByOrder[i + 1] !== undefined;
            const skipped = steps[i].enabled === false || steps[i + 1].enabled === false;
            return (
              <Connector key={i} from={p} to={next} live={isLive} dashed={skipped} />
            );
          })}
          {editable && steps.length > 0 && (
            <Connector from={positions[positions.length - 1]} to={addPos} dashed live={false} />
          )}
        </svg>

        {editable && onInsert &&
          positions.slice(0, -1).map((p, k) => {
            const { via } = connectorGeometry(p, positions[k + 1]);
            return (
              <button
                key={`insert-${k}`}
                type="button"
                data-testid={`insert-after-${k}`}
                aria-label={`Insert a step after step ${k}`}
                title="Insert a step here"
                onClick={() => onInsert(k)}
                onDragOver={(e) => {
                  if (dragging) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOnConnector(k);
                }}
                style={{ left: via.x - 11, top: via.y - 11 }}
                className={`absolute w-[22px] h-[22px] rounded-full border text-sm leading-none flex items-center justify-center transition-all z-10
                  ${
                    dragging
                      ? 'bg-signal/20 border-signal text-signal scale-125'
                      : 'bg-ink-panel border-ink-line text-text-dim hover:text-signal hover:border-signal/60 hover:scale-110'
                  }`}
              >
                +
              </button>
            );
          })}

        {steps.map((step, i) => {
          const p = positions[i];
          const result = liveByOrder?.[step.order];
          return (
            <div
              key={i}
              className="absolute"
              style={{ left: p.x, top: p.y, width: NODE_WIDTH }}
              draggable={editable && !!onMove}
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(i));
              }}
              onDragEnd={() => setDragFrom(null)}
              onDragOver={(e) => {
                if (dragging && dragFrom !== i) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null && dragFrom !== i && onMove) onMove(dragFrom, i);
                setDragFrom(null);
              }}
            >
              <StepNode
                step={step}
                index={i}
                selected={selectedIndex === i}
                onSelect={() => onSelect(i)}
                onDelete={() => onDelete(i)}
                onToggle={onToggle ? () => onToggle(i) : undefined}
                liveResult={result}
                readOnly={readOnly}
                dragging={dragFrom === i}
              />
            </div>
          );
        })}

        {editable && (
          <button
            onClick={onAdd}
            data-testid="add-step"
            onDragOver={(e) => {
              if (dragging) e.preventDefault();
            }}
            onDrop={(e) => {
              // Dropped on the "add step" slot: move to the very end.
              e.preventDefault();
              if (dragFrom !== null && onMove && dragFrom !== steps.length - 1) onMove(dragFrom, steps.length - 1);
              setDragFrom(null);
            }}
            style={{ left: addPos.x, top: addPos.y, width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
            className={`absolute border border-dashed rounded-lg flex flex-col items-center justify-center gap-1 transition-colors
              ${dragging ? 'border-signal/60 text-signal' : 'border-ink-line text-text-dim hover:text-signal hover:border-signal/50'}`}
          >
            <span className="text-xl leading-none">+</span>
            <span className="text-xs font-mono">{dragging ? 'drop to move to the end' : 'add step'}</span>
          </button>
        )}

        {steps.length === 0 && (
          <div
            className="absolute font-mono text-xs text-text-dim"
            style={{ left: PAD, top: PAD + NODE_HEIGHT + 12 }}
          >
            wire up the first step to get started
          </div>
        )}
      </div>
    </div>
  );
}

function Connector({
  from,
  to,
  live,
  dashed,
}: {
  from: Pos;
  to: Pos;
  live: boolean;
  dashed?: boolean;
}) {
  const stroke = live ? '#E8A33D' : '#3A4856';
  const { d, via } = connectorGeometry(from, to);

  return (
    <g>
      <path
        d={d}
        stroke={stroke}
        strokeWidth={2}
        fill="none"
        strokeDasharray={dashed ? '3 5' : undefined}
        className={live ? 'wire-live' : ''}
      />
      <circle cx={via.x} cy={via.y} r={3} fill={stroke} />
    </g>
  );
}
