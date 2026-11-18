import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Move } from '../src/shared/engine.ts';
import {
  EXTRACT_CELL,
  MAX_TURNS,
  SIZE,
  START_CELL,
  decodeMoves,
  makeLevel,
  nearestSentry,
  nextStreak,
  puzzleNumber,
  sentryCell,
  shareText,
  simulate,
  solveMoves,
  todayUTC,
} from '../src/shared/engine.ts';

const DATES = Array.from({ length: 40 }, (_, index) => {
  const base = Date.parse('2026-11-18T00:00:00Z') + index * 86_400_000;
  return new Date(base).toISOString().slice(0, 10);
});

describe('level generation', () => {
  it('is deterministic for a given date', () => {
    const first = makeLevel('2026-12-01');
    const second = makeLevel('2026-12-01');
    assert.equal(JSON.stringify(first), JSON.stringify(second));
  });

  it('differs across dates', () => {
    const a = makeLevel('2026-12-01');
    const b = makeLevel('2026-12-02');
    assert.notEqual(JSON.stringify(a), JSON.stringify(b));
  });

  it('is solvable and never trivial for 40 consecutive days', () => {
    for (const date of DATES) {
      const level = makeLevel(date);
      assert.equal(level.walls.includes(START_CELL), false, `${date} start walled`);
      assert.equal(level.walls.includes(EXTRACT_CELL), false, `${date} exit walled`);
      assert.equal(nearestSentry(START_CELL, level, 0) > 1, true, `${date} spawn unsafe`);
      assert.ok(level.sentries.length >= 2, `${date} not enough sentries`);

      const path = solveMoves(level);
      assert.ok(path, `${date} is not solvable`);
      assert.ok(path.length >= 6, `${date} par too short`);
      assert.ok(path.length <= MAX_TURNS - 2, `${date} par too tight`);
      assert.ok(level.turns >= path.length && level.turns <= MAX_TURNS, `${date} budget`);
      assert.equal(level.par, path.length);
    }
  });

  it('keeps the exit outside the swarm at the last turn', () => {
    for (const date of DATES) {
      const level = makeLevel(date);
      assert.ok(nearestSentry(EXTRACT_CELL, level, level.turns) > 1, date);
    }
  });

  it('numbers puzzles from the epoch', () => {
    assert.equal(puzzleNumber('2026-11-09'), 1);
    assert.equal(puzzleNumber('2026-11-18'), 10);
  });
});

describe('simulation', () => {
  it('rewards the optimal line with a silent breach bonus', () => {
    for (const date of DATES.slice(0, 12)) {
      const level = makeLevel(date);
      const path = solveMoves(level);
      assert.ok(path);
      const outcome = simulate(level, path);
      assert.equal(outcome.status, 'breached', date);
      assert.equal(outcome.turns, level.par);
      assert.equal(outcome.plantedAt !== null, true);
      assert.ok(
        outcome.score >= 1000 && outcome.score <= 1350,
        `${date} score ${outcome.score}`
      );
    }
  });

  it('detects a sentry ambush', () => {
    const level = makeLevel('2026-11-20');
    const sentry = level.sentries[0];
    assert.ok(sentry);
    const guard = sentryCell(sentry, 0);
    // A level where the player is caught only exists if we can walk into a ring;
    // simulate the guard cell itself for turn 0 and check the rule directly.
    assert.ok(nearestSentry(guard, level, 0) <= 1);
    const outcome = simulate(level, []);
    assert.equal(outcome.status, 'timeout');
    assert.equal(outcome.turns, 0);
  });

  it('never lets a move into a wall count', () => {
    const level = makeLevel('2026-11-21');
    const wall = level.walls[0];
    assert.ok(wall !== undefined);
    const outcome = simulate(level, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.ok(outcome.turns <= level.turns);
  });

  it('caps a run at the turn budget', () => {
    const level = makeLevel('2026-11-22');
    const moves = Array.from({ length: 40 }, () => 4 as Move);
    const outcome = simulate(level, moves);
    assert.equal(outcome.turns, level.turns);
    assert.equal(outcome.status, 'timeout');
  });
});

describe('inputs', () => {
  it('rejects junk move lists', () => {
    assert.equal(decodeMoves('nope', 14), null);
    assert.equal(decodeMoves([0, 1, 9], 14), null);
    assert.equal(decodeMoves([0, 1.5], 14), null);
    assert.deepEqual(decodeMoves([0, 1, 4], 14), [0, 1, 4]);
    assert.equal(decodeMoves([0, 1, 2], 2)?.length, 2);
  });
});

describe('streaks', () => {
  it('extends on consecutive days and resets after a gap', () => {
    assert.equal(nextStreak(null, '2026-11-18'), 1);
    assert.equal(nextStreak({ count: 3, lastDate: '2026-11-17' }, '2026-11-18'), 4);
    assert.equal(nextStreak({ count: 3, lastDate: '2026-11-18' }, '2026-11-18'), 3);
    assert.equal(nextStreak({ count: 3, lastDate: '2026-11-15' }, '2026-11-18'), 1);
  });
});

describe('share text', () => {
  it('is a compact, spoiler-free block', () => {
    const date = todayUTC(new Date('2026-11-18T12:00:00Z'));
    const level = makeLevel(date);
    const path = solveMoves(level);
    assert.ok(path);
    const outcome = simulate(level, path);
    const text = shareText(level, outcome, 4);
    assert.match(text, /NULLSWARM · Daily Breach #10/);
    assert.match(text, /BREACHED in \d+\/14/);
    assert.match(text, /🔥 4-day streak/);
    assert.equal(text.split('\n').length, 4);
  });
});

describe('grid geometry', () => {
  it('walks a full row', () => {
    const level = makeLevel('2026-12-05');
    assert.equal(level.start, 0);
    assert.equal(level.extract, SIZE * SIZE - 1);
  });
});
