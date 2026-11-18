import type { Level } from '../../shared/engine';
import {
  SIZE,
  START_CELL,
  colOf,
  nearestSentry,
  rowOf,
  sentryCell,
} from '../../shared/engine';

type BoardProps = {
  level: Level;
  turn: number;
  trail: number[];
  player: number;
  planted: boolean;
  interactive: boolean;
  onStep?: (cell: number) => void;
};

const cellName = (cell: number): string =>
  `r${rowOf(cell) + 1}c${colOf(cell) + 1}`;

const neighboursOf = (cell: number): number[] => {
  const row = rowOf(cell);
  const col = colOf(cell);
  const out: number[] = [];
  if (row > 0) out.push(cell - SIZE);
  if (row < SIZE - 1) out.push(cell + SIZE);
  if (col > 0) out.push(cell - 1);
  if (col < SIZE - 1) out.push(cell + 1);
  return out;
};

export const Board = ({
  level,
  turn,
  trail,
  player,
  planted,
  interactive,
  onStep,
}: BoardProps) => {
  const sentries = level.sentries.map((sentry) => sentryCell(sentry, turn));
  const sentriesNext = level.sentries.map((sentry) => sentryCell(sentry, turn + 1));
  const reachable = new Set(interactive ? neighboursOf(player) : []);

  const cells = [];
  for (let cell = 0; cell < SIZE * SIZE; cell++) {
    const wall = level.walls.includes(cell);
    const sentryHere = sentries.includes(cell);
    const sentrySoon = sentriesNext.includes(cell);
    const dangerNow = !wall && nearestSentry(cell, level, turn) <= 1;
    const dangerNext = !wall && nearestSentry(cell, level, turn + 1) <= 1;
    const visited = trail.includes(cell);
    const isPlayer = player === cell;
    const isSite = level.site === cell;
    const isExtract = level.extract === cell;
    const canStep = reachable.has(cell) && !wall;

    const base =
      'relative aspect-square rounded-md border flex items-center justify-center transition-colors duration-150 select-none';
    const tone = wall
      ? 'bg-slate-900/90 border-slate-800/80 ns-wall'
      : dangerNow
        ? 'bg-rose-500/15 border-rose-500/40'
        : 'bg-slate-800/40 border-slate-700/60';

    cells.push(
      <button
        key={cell}
        type="button"
        aria-label={cellName(cell)}
        onClick={() => {
          if (canStep && onStep) onStep(cell);
        }}
        className={`${base} ${tone} ${canStep ? 'cursor-pointer hover:bg-cyan-500/15 hover:border-cyan-400/50' : 'cursor-default'}`}
      >
        {dangerNext && !dangerNow && !wall ? (
          <span className="absolute inset-0 rounded-md border border-amber-400/25" />
        ) : null}

        {isExtract ? (
          <span className="absolute text-[0.6rem] tracking-widest text-emerald-300/80">
            EXIT
          </span>
        ) : null}
        {isSite ? (
          <span
            className={`absolute text-[0.6rem] tracking-widest ${planted ? 'text-cyan-200' : 'text-cyan-400/70'}`}
          >
            {planted ? 'ARMED' : 'SITE'}
          </span>
        ) : null}
        {cell === START_CELL && !isPlayer ? (
          <span className="absolute left-1 top-1 h-1 w-1 rounded-full bg-slate-500" />
        ) : null}

        {visited && !isPlayer ? (
          <span className="absolute h-1 w-1 rounded-full bg-cyan-300/40" />
        ) : null}

        {sentryHere ? (
          <span className="absolute h-3 w-3 rounded-full bg-rose-500 shadow-[0_0_12px_2px_rgba(244,63,94,0.75)] ns-pulse" />
        ) : sentrySoon ? (
          <span className="absolute h-2 w-2 rounded-sm rotate-45 border border-rose-500/50" />
        ) : null}

        {isPlayer ? (
          <span
            className={`relative h-4 w-4 rounded-full ${planted ? 'bg-cyan-300' : 'bg-cyan-400'} shadow-[0_0_16px_3px_rgba(34,211,238,0.7)]`}
          />
        ) : null}
      </button>
    );
  }

  return (
    <div className="grid grid-cols-6 gap-1.5 w-full max-w-[22rem] mx-auto">
      {cells}
    </div>
  );
};
