import './index.css';

import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { showToast } from '@devvit/web/client';
import type { Move } from '../shared/engine';
import {
  SIZE,
  colOf,
  rowOf,
  shareText,
} from '../shared/engine';
import { Board } from './components/Board';
import { useDaily } from './hooks/useDaily';

const moveForKey = (key: string): Move | null => {
  switch (key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      return 0;
    case 'ArrowRight':
    case 'd':
    case 'D':
      return 1;
    case 'ArrowDown':
    case 's':
    case 'S':
      return 2;
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return 3;
    case ' ':
    case 'Spacebar':
      return 4;
    default:
      return null;
  }
};

const moveTowards = (player: number, cell: number): Move | null => {
  if (cell === player - SIZE) return 0;
  if (cell === player + SIZE) return 2;
  if (cell === player - 1) return 3;
  if (cell === player + 1) return 1;
  return null;
};

const countdown = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
};

export const App = () => {
  const { state, push, finish, done } = useDaily();
  const { init, outcome, result, moves, loading, submitting, error } = state;
  const [remaining, setRemaining] = useState<number | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!init) return;
    const target = Date.now() + init.resetsInMs;
    const timer = window.setInterval(() => {
      setRemaining(Math.max(0, target - Date.now()));
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [init]);

  useEffect(() => {
    if (done && !state.result && !init?.played && !submitting) finish();
  }, [done, state.result, init?.played, submitting, finish]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!init || done) return;
      const move = moveForKey(event.key);
      if (move === null) return;
      event.preventDefault();
      push(move);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [init, done, push]);

  const level = init?.level;
  const player = outcome ? (outcome.trail[outcome.trail.length - 1] ?? 0) : 0;
  const turn = outcome?.turns ?? 0;
  const planted = outcome?.plantedAt !== null && outcome?.plantedAt !== undefined;
  const streak = result?.streak ?? init?.streak ?? 0;

  const shareString = useMemo(() => {
    if (!level || !outcome) return '';
    return shareText(level, outcome, streak);
  }, [level, outcome, streak]);

  const copyShare = async () => {
    if (!shareString) return;
    try {
      await navigator.clipboard.writeText(shareString);
      setCopied(true);
      showToast({ text: 'Result copied — paste it anywhere', appearance: 'success' });
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast({ text: 'Clipboard blocked by the browser', appearance: 'neutral' });
    }
  };

  const postComment = async () => {
    setCommenting(true);
    try {
      const response = await fetch('/api/comment', { method: 'POST' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      showToast({ text: 'Posted to today’s thread', appearance: 'success' });
    } catch (err) {
      console.error(err);
      showToast({ text: 'Reddit would not accept the comment', appearance: 'neutral' });
    } finally {
      setCommenting(false);
    }
  };

  if (loading) {
    return (
      <div className="ns-shell">
        <p className="ns-mono text-slate-400">linking to the swarm…</p>
      </div>
    );
  }

  if (!init || !level) {
    return (
      <div className="ns-shell">
        <p className="ns-mono text-rose-300">{error ?? 'No breach available.'}</p>
      </div>
    );
  }

  const board = (
    <Board
      level={level}
      turn={turn}
      trail={outcome?.trail ?? [0]}
      player={player}
      planted={planted}
      interactive={!done}
      onStep={(cell) => {
        const move = moveTowards(player, cell);
        if (move !== null) push(move);
      }}
    />
  );

  const status = outcome?.status;
  const headline =
    status === 'breached'
      ? 'BREACH COMPLETE'
      : status === 'caught'
        ? 'CAUGHT BY THE SWARM'
        : 'OUT OF TURNS';

  return (
    <div className="ns-shell">
      <header className="w-full max-w-[22rem] flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-[0.2em] text-cyan-300">
            NULLSWARM
          </h1>
          <p className="ns-mono text-[0.65rem] text-slate-400">
            daily breach #{level.puzzle} · {level.date}
          </p>
        </div>
        <div className="text-right">
          <p className="ns-mono text-[0.65rem] text-slate-400">streak</p>
          <p className="text-base font-semibold text-amber-300">
            {streak > 0 ? `🔥 ${streak}` : '—'}
          </p>
        </div>
      </header>

      <div className="w-full max-w-[22rem] flex items-center justify-between ns-mono text-[0.65rem] text-slate-400">
        <span>
          turns left <span className="text-slate-100">{level.turns - turn}</span>/
          {level.turns}
        </span>
        <span className={planted ? 'text-cyan-300' : 'text-slate-500'}>
          {planted ? '◆ EMP ARMED' : '◇ EMP stowed'}
        </span>
        <span>par {level.par}</span>
      </div>

      {board}

      {done ? (
        <section className="ns-card w-full max-w-[22rem]">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-[0.15em] text-cyan-200">
              {headline}
            </h2>
            <span className="text-xl font-semibold text-slate-100">
              {outcome?.score ?? 0}
              <span className="ns-mono text-[0.6rem] text-slate-400"> pts</span>
            </span>
          </div>
          <p className="ns-mono text-[0.65rem] text-slate-400">
            {outcome?.turns ?? 0} turns · par {level.par}
            {outcome?.silent ? ' · silent run +150' : ''}
            {' · '}
            {result?.breachedToday ?? init.breachedToday} breaches today
          </p>

          <div className="flex flex-wrap gap-2 mt-1">
            <button type="button" className="ns-btn" onClick={copyShare}>
              {copied ? 'Copied ✓' : 'Copy result'}
            </button>
            <button
              type="button"
              className="ns-btn ns-btn-ghost"
              onClick={postComment}
              disabled={commenting}
            >
              {commenting ? 'Posting…' : 'Comment my run'}
            </button>
          </div>

          {(result?.leaderboard ?? init.leaderboard).length > 0 ? (
            <ol className="mt-2 space-y-0.5">
              {(result?.leaderboard ?? init.leaderboard).slice(0, 5).map((row) => (
                <li
                  key={row.username}
                  className="ns-mono flex justify-between text-[0.7rem] text-slate-300"
                >
                  <span>
                    {row.rank}. u/{row.username}
                  </span>
                  <span className="text-slate-400">{row.score}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ns-mono text-[0.65rem] text-slate-500">
              No breaches logged yet today — set the mark.
            </p>
          )}

          <p className="ns-mono text-[0.6rem] text-slate-500 mt-1">
            next breach in {countdown(remaining ?? init.resetsInMs)} · one run per operator
          </p>
        </section>
      ) : (
        <section className="w-full max-w-[22rem] flex flex-col items-center gap-2">
          <div className="grid grid-cols-3 gap-1.5">
            <span />
            <button type="button" className="ns-pad" onClick={() => push(0)}>
              ↑
            </button>
            <span />
            <button type="button" className="ns-pad" onClick={() => push(3)}>
              ←
            </button>
            <button type="button" className="ns-pad ns-pad-wait" onClick={() => push(4)}>
              •
            </button>
            <button type="button" className="ns-pad" onClick={() => push(1)}>
              →
            </button>
            <span />
            <button type="button" className="ns-pad" onClick={() => push(2)}>
              ↓
            </button>
            <span />
          </div>
          <p className="ns-mono text-[0.6rem] text-slate-500 text-center">
            reach ◇ SITE to arm, then EXIT · avoid the red ring · hold • to wait a
            turn
          </p>
          {error ? (
            <p className="ns-mono text-[0.65rem] text-rose-300">{error}</p>
          ) : null}
        </section>
      )}

      <footer className="ns-mono text-[0.6rem] text-slate-600 text-center">
        {SIZE}×{SIZE} grid · r{rowOf(player) + 1}c{colOf(player) + 1} · seeded by the
        UTC date · moves {moves.length}
      </footer>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
