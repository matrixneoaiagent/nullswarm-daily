import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InitResponse, SubmitResponse } from '../../shared/api';
import type { Move, RunOutcome } from '../../shared/engine';
import { simulate } from '../../shared/engine';

export type PlayState = {
  init: InitResponse | null;
  loading: boolean;
  moves: Move[];
  outcome: RunOutcome | null;
  result: SubmitResponse | null;
  submitting: boolean;
  error: string | null;
};

const emptyState: PlayState = {
  init: null,
  loading: true,
  moves: [],
  outcome: null,
  result: null,
  submitting: false,
  error: null,
};

export const useDaily = () => {
  const [state, setState] = useState<PlayState>(emptyState);
  const submitted = useRef(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch('/api/init');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as InitResponse;
        if (!alive) return;
        setState((prev) => ({
          ...prev,
          init: data,
          loading: false,
          outcome: data.outcome,
        }));
        if (data.played) submitted.current = true;
      } catch (error) {
        console.error('init failed', error);
        if (alive) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: 'Could not reach the swarm. Reload the post to retry.',
          }));
        }
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  const submit = useCallback(async (moves: Move[]) => {
    setState((prev) => ({ ...prev, submitting: true }));
    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ moves }),
      });
      const data = (await response.json()) as SubmitResponse | { message?: string };
      if (!response.ok) {
        throw new Error('message' in data ? (data.message ?? 'rejected') : 'rejected');
      }
      setState((prev) => ({ ...prev, submitting: false, result: data as SubmitResponse }));
    } catch (error) {
      console.error('submit failed', error);
      setState((prev) => ({
        ...prev,
        submitting: false,
        error: 'Run could not be recorded. Reload and try again.',
      }));
    }
  }, []);

  const push = useCallback((move: Move) => {
    setState((prev) => {
      if (!prev.init || prev.result || prev.init.played) return prev;
      const moves = [...prev.moves, move];
      if (moves.length > prev.init.level.turns) return prev;
      return { ...prev, moves, outcome: simulate(prev.init.level, moves) };
    });
  }, []);

  const finish = useCallback(() => {
    setState((prev) => {
      if (submitted.current || prev.result || !prev.outcome || !prev.init) return prev;
      submitted.current = true;
      void submit(prev.moves);
      return prev;
    });
  }, [submit]);

  const done = useMemo(() => {
    const { init, outcome, moves } = state;
    if (!init || !outcome) return false;
    if (init.played) return true;
    if (outcome.status === 'breached' || outcome.status === 'caught') return true;
    return moves.length >= init.level.turns;
  }, [state]);

  return { state, push, finish, done };
};
