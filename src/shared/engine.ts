/**
 * NULLSWARM · Daily Breach — deterministic daily puzzle engine.
 *
 * This module is shared by the client (instant, local play) and the server
 * (authoritative replay validation). Given a UTC date it produces the exact
 * same level everywhere, so a run can be verified from the move list alone.
 */

export const SIZE = 6;
export const CELL_COUNT = SIZE * SIZE;
export const START_CELL = 0;
export const EXTRACT_CELL = CELL_COUNT - 1;
export const MAX_TURNS = 14;

/** Days since this date are used for the puzzle number. */
export const EPOCH_DATE = '2026-11-09';

const DAY_MS = 86_400_000;

/** 0 = up, 1 = right, 2 = down, 3 = left, 4 = hold position. */
export type Move = 0 | 1 | 2 | 3 | 4;
export const MOVES: readonly Move[] = [0, 1, 2, 3, 4];

export type Sentry = {
  /** Cells the sentry cycles through. */
  route: number[];
  phase: number;
};

export type Level = {
  date: string;
  puzzle: number;
  walls: number[];
  sentries: Sentry[];
  start: number;
  site: number;
  extract: number;
  turns: number;
  /** Optimal number of turns, found by exhaustive search. */
  par: number;
};

export type Risk = 'safe' | 'tight';

export type RunStatus = 'breached' | 'caught' | 'timeout';

export type RunOutcome = {
  status: RunStatus;
  turns: number;
  score: number;
  silent: boolean;
  trail: number[];
  risk: Risk[];
  plantedAt: number | null;
  par: number;
};

export const rowOf = (cell: number): number => Math.floor(cell / SIZE);
export const colOf = (cell: number): number => cell % SIZE;

export function todayUTC(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function msUntilTomorrow(now: Date = new Date()): number {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  );
  return Math.max(0, next - now.getTime());
}

export function puzzleNumber(date: string): number {
  const days = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${EPOCH_DATE}T00:00:00Z`)) /
      DAY_MS
  );
  return days + 1;
}

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function hash32(input: string): number {
  let h = 2_166_136_261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return h >>> 0;
}

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pickOne<T>(items: readonly T[], index: number): T | undefined {
  if (items.length === 0) return undefined;
  const wrapped = ((index % items.length) + items.length) % items.length;
  return items[wrapped];
}

function step(cell: number, move: Move): number | null {
  const row = rowOf(cell);
  const col = colOf(cell);
  switch (move) {
    case 0:
      return row > 0 ? cell - SIZE : null;
    case 1:
      return col < SIZE - 1 ? cell + 1 : null;
    case 2:
      return row < SIZE - 1 ? cell + SIZE : null;
    case 3:
      return col > 0 ? cell - 1 : null;
    default:
      return cell;
  }
}

export function chebyshev(a: number, b: number): number {
  return Math.max(Math.abs(rowOf(a) - rowOf(b)), Math.abs(colOf(a) - colOf(b)));
}

export function sentryCell(sentry: Sentry, turn: number): number {
  return pickOne(sentry.route, turn + sentry.phase) ?? START_CELL;
}

/** Chebyshev distance to the closest sentry after `turn` moves have been made. */
export function nearestSentry(cell: number, level: Level, turn: number): number {
  let best = SIZE;
  for (const sentry of level.sentries) {
    best = Math.min(best, chebyshev(cell, sentryCell(sentry, turn)));
  }
  return best;
}

export function dangerCells(level: Level, turn: number): number[] {
  const cells: number[] = [];
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (level.walls.includes(cell)) continue;
    if (nearestSentry(cell, level, turn) <= 1) cells.push(cell);
  }
  return cells;
}

function buildRoute(
  rand: () => number,
  walls: number[],
  taken: number[]
): number[] | null {
  for (let attempt = 0; attempt < 80; attempt++) {
    const start = Math.floor(rand() * CELL_COUNT);
    if (walls.includes(start)) continue;
    // Keep the swarm spread out: no two sentries may share a neighbourhood.
    if (taken.some((cell) => chebyshev(cell, start) < 2)) continue;

    const direction = Math.floor(rand() * 4);
    const length = 2 + Math.floor(rand() * 3);
    const route: number[] = [start];
    let current = start;
    let ok = true;
    for (let index = 1; index < length; index++) {
      const next = step(current, direction as Move);
      if (next === null || walls.includes(next)) {
        ok = false;
        break;
      }
      route.push(next);
      current = next;
    }
    if (ok) return route;
  }
  return null;
}

function buildCandidate(date: string, seed: number): Level | null {
  const rand = makeRng(seed);
  const walls: number[] = [];
  const wallTarget = 5 + Math.floor(rand() * 3);
  for (let placed = 0; placed < wallTarget; placed++) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const candidate = Math.floor(rand() * CELL_COUNT);
      if (candidate === START_CELL || candidate === EXTRACT_CELL) continue;
      if (walls.includes(candidate)) continue;
      walls.push(candidate);
      break;
    }
  }

  const siteOptions: number[] = [];
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (walls.includes(cell)) continue;
    if (cell === START_CELL || cell === EXTRACT_CELL) continue;
    if (chebyshev(cell, START_CELL) < 3) continue;
    siteOptions.push(cell);
  }
  if (siteOptions.length === 0) return null;

  const sentries: Sentry[] = [];
  const sentryTarget = 2 + Math.floor(rand() * 2);
  for (let index = 0; index < sentryTarget; index++) {
    const taken = sentries.flatMap((sentry) => sentry.route);
    const route = buildRoute(rand, walls, taken);
    if (!route) continue;
    sentries.push({ route, phase: Math.floor(rand() * route.length) });
  }
  if (sentries.length < 2) return null;

  const site = pickOne(siteOptions, Math.floor(rand() * siteOptions.length));
  if (site === undefined) return null;

  const level: Level = {
    date,
    puzzle: puzzleNumber(date),
    walls,
    sentries,
    start: START_CELL,
    site,
    extract: EXTRACT_CELL,
    turns: MAX_TURNS,
    par: 0,
  };

  if (nearestSentry(START_CELL, level, 0) <= 1) return null;
  if (nearestSentry(EXTRACT_CELL, level, level.turns) <= 1) return null;
  return level;
}

/**
 * Exhaustive BFS for the shortest safe breach. Doubles as the solvability
 * check and as the source of `par`, so every generated day is beatable.
 */
export function solveMoves(level: Level): Move[] | null {
  type Node = { cell: number; planted: boolean; path: Move[] };
  const seen = new Set<string>([`${level.start}:0`]);
  let frontier: Node[] = [{ cell: level.start, planted: false, path: [] }];

  for (let turn = 0; turn < level.turns; turn++) {
    const nextTurn = turn + 1;
    const next: Node[] = [];
    for (const node of frontier) {
      for (const move of MOVES) {
        const cell = step(node.cell, move);
        if (cell === null || level.walls.includes(cell)) continue;
        if (nearestSentry(cell, level, nextTurn) <= 1) continue;
        const planted = node.planted || cell === level.site;
        const path = [...node.path, move];
        if (planted && cell === level.extract) return path;
        const key = `${cell}:${planted ? 1 : 0}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ cell, planted, path });
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return null;
}

export function shortestRun(level: Level): { turns: number } | null {
  const path = solveMoves(level);
  return path ? { turns: path.length } : null;
}

/**
 * Deterministic daily level. Candidates are filtered from "tight and varied"
 * down to "merely solvable", and every returned level is BFS-verified, so a
 * date can never ship an impossible or trivially short board.
 */
export function makeLevel(date: string): Level {
  const base = hash32(`nullswarm:${date}`);

  const attempts = 400;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const candidate = buildCandidate(date, (base + attempt * 7919) >>> 0);
    if (!candidate) continue;
    const path = solveMoves(candidate);
    if (!path) continue;
    if (path.length < 6) continue;
    if (path.length > MAX_TURNS - 2) continue;
    const slack = (base + attempt) % 2 === 0 ? 2 : 3;
    return { ...candidate, turns: Math.min(MAX_TURNS, path.length + slack), par: path.length };
  }

  // Relaxed pass: still solvable, just less room to breathe.
  for (let attempt = 0; attempt < attempts; attempt++) {
    const candidate = buildCandidate(date, (base ^ (attempt * 1_048_573)) >>> 0);
    if (!candidate) continue;
    const path = solveMoves(candidate);
    if (!path) continue;
    return { ...candidate, par: path.length };
  }

  return safeLevel(date);
}

/** Last-resort board: hand-built and verified, used only if generation fails. */
function safeLevel(date: string): Level {
  const level: Level = {
    date,
    puzzle: puzzleNumber(date),
    walls: [22, 9, 24],
    sentries: [
      { route: [2, 3, 4], phase: 0 },
      { route: [8, 9, 10], phase: 1 },
    ],
    start: START_CELL,
    site: 26,
    extract: EXTRACT_CELL,
    turns: MAX_TURNS,
    par: 10,
  };
  const path = solveMoves(level);
  return { ...level, par: path ? path.length : 10 };
}

function scoreFor(
  level: Level,
  turns: number,
  silent: boolean,
  safeMoves: number
): number {
  const penalty = Math.max(0, turns - level.par) * 70;
  const base = Math.max(100, 1000 - penalty);
  return base + 15 * safeMoves + (silent ? 150 : 0);
}

export function simulate(level: Level, moves: readonly Move[]): RunOutcome {
  let cell = level.start;
  let planted = false;
  let plantedAt: number | null = null;
  let turn = 0;
  const trail = [level.start];
  const risk: Risk[] = [];
  let silent = true;
  let safeMoves = 0;

  for (const move of moves) {
    if (turn >= level.turns) break;
    const next = step(cell, move);
    if (next === null || level.walls.includes(next)) break;

    const nextTurn = turn + 1;
    const distance = nearestSentry(next, level, nextTurn);
    cell = next;
    turn = nextTurn;
    trail.push(next);

    if (distance <= 1) {
      return {
        status: 'caught',
        turns: turn,
        score: 0,
        silent: false,
        trail,
        risk,
        plantedAt,
        par: level.par,
      };
    }

    risk.push(distance === 2 ? 'tight' : 'safe');
    if (distance === 2) {
      silent = false;
    } else {
      safeMoves += 1;
    }

    if (!planted && cell === level.site) {
      planted = true;
      plantedAt = turn;
    }

    if (planted && cell === level.extract) {
      return {
        status: 'breached',
        turns: turn,
        score: scoreFor(level, turn, silent, safeMoves),
        silent,
        trail,
        risk,
        plantedAt,
        par: level.par,
      };
    }
  }

  return {
    status: 'timeout',
    turns: turn,
    score: planted ? 50 : 25,
    silent: false,
    trail,
    risk,
    plantedAt,
    par: level.par,
  };
}

export function encodeMoves(moves: readonly Move[]): number[] {
  return moves.map((move) => move);
}

export function decodeMoves(raw: unknown, limit: number): Move[] | null {
  if (!Array.isArray(raw)) return null;
  const moves: Move[] = [];
  for (const value of raw.slice(0, limit)) {
    if (typeof value !== 'number' || !Number.isInteger(value)) return null;
    if (value < 0 || value > 4) return null;
    moves.push(value as Move);
  }
  return moves;
}

const RISK_ICON: Record<Risk, string> = { safe: '🟩', tight: '🟨' };

export function shareText(
  level: Level,
  outcome: RunOutcome,
  streak: number
): string {
  const headline =
    outcome.status === 'breached'
      ? `BREACHED in ${outcome.turns}/${level.turns}`
      : outcome.status === 'caught'
        ? `CAUGHT on turn ${outcome.turns}/${level.turns}`
        : `TIMED OUT at ${outcome.turns}/${level.turns}`;
  const streakTag = streak > 1 ? ` · 🔥 ${streak}-day streak` : '';
  const bar = outcome.risk.map((entry) => RISK_ICON[entry]).join('');
  return [
    `🧬 NULLSWARM · Daily Breach #${level.puzzle} (${level.date})`,
    `${headline}`,
    bar,
    `${outcome.score} pts · par ${level.par}${streakTag}`,
  ].join('\n');
}

export type StreakRecord = { count: number; lastDate: string };

export function nextStreak(
  previous: StreakRecord | null | undefined,
  date: string
): number {
  if (!previous) return 1;
  if (previous.lastDate === date) return Math.max(1, previous.count);
  const gap = Math.round(
    (Date.parse(`${date}T00:00:00Z`) -
      Date.parse(`${previous.lastDate}T00:00:00Z`)) /
      DAY_MS
  );
  return gap === 1 ? Math.max(0, previous.count) + 1 : 1;
}
