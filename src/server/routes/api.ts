import { Hono } from 'hono';
import { context, reddit, redis } from '@devvit/web/server';
import type {
  CommentResponse,
  ErrorResponse,
  InitResponse,
  LeaderboardRow,
  SubmitRequest,
  SubmitResponse,
} from '../../shared/api';
import type { RunOutcome } from '../../shared/engine';
import {
  decodeMoves,
  nextStreak,
  shareText,
  simulate,
} from '../../shared/engine';
import {
  breachedCount,
  bumpBreached,
  currentDate,
  keys,
  levelFor,
  rankOf,
  readRun,
  readStreak,
  resetWindowMs,
  saveRun,
  saveStreak,
  shareUrl,
  topBoard,
} from '../core/daily';

export const api = new Hono();

const fallbackName = 'operator';

async function currentUsername(): Promise<string> {
  const name = await reddit.getCurrentUsername();
  return name ?? fallbackName;
}

api.get('/init', async (c) => {
  const date = currentDate();
  try {
    const username = await currentUsername();
    const level = levelFor(date);
    const [run, streak, board, breached, rank] = await Promise.all([
      readRun(date, username),
      readStreak(username),
      topBoard(date),
      breachedCount(date),
      rankOf(date, username),
    ]);

    const payload: InitResponse = {
      type: 'init',
      username,
      date,
      level,
      streak: streak?.count ?? 0,
      played: run !== null,
      outcome: run?.outcome ?? null,
      breachedToday: breached,
      leaderboard: board,
      rank,
      resetsInMs: resetWindowMs(),
    };
    return c.json<InitResponse>(payload);
  } catch (error) {
    console.error('init failed', error);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Could not load today\u2019s breach' },
      500
    );
  }
});

api.post('/submit', async (c) => {
  const date = currentDate();
  const level = levelFor(date);
  const username = await currentUsername();
  const postId = context.postId ?? '';

  const body = await c.req.json<SubmitRequest>().catch(() => null);
  const moves = decodeMoves(body?.moves, level.turns);
  if (!moves) {
    return c.json<ErrorResponse>({ status: 'error', message: 'Invalid run' }, 400);
  }

  if (!postId) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Run must be played from a daily post' },
      400
    );
  }

  const existing = await readRun(date, username);
  if (existing) {
    const board = await topBoard(date);
    const payload: SubmitResponse = {
      type: 'submit',
      outcome: existing.outcome,
      streak: (await readStreak(username))?.count ?? 1,
      leaderboard: board,
      rank: await rankOf(date, username),
      breachedToday: await breachedCount(date),
      firstSubmit: false,
    };
    return c.json<SubmitResponse>(payload);
  }

  const outcome: RunOutcome = simulate(level, moves);

  const streak = nextStreak(await readStreak(username), date);
  await saveStreak(username, streak, date);

  await saveRun(date, username, {
    score: outcome.score,
    status: outcome.status,
    turns: outcome.turns,
    silent: outcome.silent,
    moves,
    outcome,
  });

  let breached = await breachedCount(date);
  if (outcome.status === 'breached') {
    await redis.zAdd(keys.board(date), { member: username, score: outcome.score });
    breached = await bumpBreached(date);
    await awardFlair(username, streak);
  }

  const board = await topBoard(date);
  const payload: SubmitResponse = {
    type: 'submit',
    outcome,
    streak,
    leaderboard: board,
    rank: await rankOf(date, username),
    breachedToday: breached,
    firstSubmit: true,
  };
  return c.json<SubmitResponse>(payload);
});

/** Streak flair is a native Reddit touch; failures must never block a run. */
async function awardFlair(username: string, streak: number): Promise<void> {
  const subredditName = context.subredditName;
  if (!subredditName || streak < 3) return;
  try {
    await reddit.setUserFlair({
      subredditName,
      username,
      text: `🧬 breach ${streak}d streak`,
    });
  } catch (error) {
    console.log('flair skipped', error);
  }
}

api.post('/comment', async (c) => {
  const date = currentDate();
  const username = await currentUsername();
  const postId = context.postId;
  if (!postId) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'No post in context' },
      400
    );
  }

  const run = await readRun(date, username);
  if (!run) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Play today\u2019s breach first' },
      400
    );
  }

  const level = levelFor(date);
  const streak = (await readStreak(username))?.count ?? 1;
  const text = shareText(level, run.outcome, streak);

  try {
    const comment = await reddit.submitComment({
      id: postId.startsWith('t3_') ? postId : `t3_${postId}`,
      text,
      runAs: 'USER',
    });
    const payload: CommentResponse = {
      type: 'comment',
      permalink: comment.permalink,
    };
    return c.json<CommentResponse>(payload);
  } catch (error) {
    console.error('comment failed', error);
    return c.json<ErrorResponse>(
      { status: 'error', message: 'Reddit rejected the comment' },
      400
    );
  }
});

api.get('/leaderboard', async (c) => {
  const date = currentDate();
  const board: LeaderboardRow[] = await topBoard(date, 10);
  return c.json({ type: 'leaderboard', leaderboard: board });
});

export const leaderboardUrl = (postId: string): string => shareUrl(postId);
