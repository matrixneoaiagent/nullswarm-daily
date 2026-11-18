import { context, reddit, redis } from '@devvit/web/server';
import type { Level, RunOutcome, RunStatus, StreakRecord } from '../../shared/engine';
import { makeLevel, msUntilTomorrow, todayUTC } from '../../shared/engine';
import type { LeaderboardRow } from '../../shared/api';

export const keys = {
  run: (date: string, user: string) => `ns:run:${date}:${user}`,
  streak: (user: string) => `ns:streak:${user}`,
  board: (date: string) => `ns:board:${date}`,
  breached: (date: string) => `ns:breached:${date}`,
  post: (date: string) => `ns:post:${date}`,
} as const;

export type StoredRun = {
  score: number;
  status: RunStatus;
  turns: number;
  silent: boolean;
  moves: number[];
  outcome: RunOutcome;
};

const levelCache = new Map<string, { level: Level; at: number }>();

export function levelFor(date: string): Level {
  const cached = levelCache.get(date);
  if (cached && Date.now() - cached.at < 3_600_000) return cached.level;
  const level = makeLevel(date);
  levelCache.set(date, { level, at: Date.now() });
  return level;
}

export function currentDate(): string {
  return todayUTC();
}

export function resetWindowMs(): number {
  return msUntilTomorrow();
}

export async function readRun(
  date: string,
  username: string
): Promise<StoredRun | null> {
  const raw = await redis.get(keys.run(date, username));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredRun;
  } catch {
    return null;
  }
}

export async function readStreak(username: string): Promise<StreakRecord | null> {
  const raw = await redis.get(keys.streak(username));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StreakRecord;
  } catch {
    return null;
  }
}

export async function saveStreak(
  username: string,
  count: number,
  date: string
): Promise<void> {
  const record: StreakRecord = { count, lastDate: date };
  await redis.set(keys.streak(username), JSON.stringify(record));
}

export async function saveRun(
  date: string,
  username: string,
  run: StoredRun
): Promise<void> {
  await redis.set(keys.run(date, username), JSON.stringify(run));
}

export async function breachedCount(date: string): Promise<number> {
  const raw = await redis.get(keys.breached(date));
  const value = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(value) ? value : 0;
}

export async function bumpBreached(date: string): Promise<number> {
  return await redis.incrBy(keys.breached(date), 1);
}

export async function topBoard(date: string, limit = 5): Promise<LeaderboardRow[]> {
  const total = await redis.zCard(keys.board(date));
  if (total === 0) return [];
  const from = Math.max(0, total - 50);
  const rows = await redis.zRange(keys.board(date), from, total - 1, {
    by: 'rank',
  });
  const parsed = rows
    .map((row) => ({ username: row.member, score: row.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return parsed.map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function rankOf(date: string, username: string): Promise<number | null> {
  const total = await redis.zCard(keys.board(date));
  if (total === 0) return null;
  const rank = await redis.zRank(keys.board(date), username);
  if (rank === null || rank === undefined) return null;
  return total - rank;
}

export function shareUrl(postId: string): string {
  return `https://www.reddit.com/comments/${postId.replace(/^t3_/, '')}`;
}

export async function createDailyPost(date: string): Promise<string | null> {
  const subredditName = context.subredditName;
  if (!subredditName) return null;

  const existing = await redis.get(keys.post(date));
  if (existing) return existing;

  const level = levelFor(date);
  const post = await reddit.submitCustomPost({
    subredditName,
    title: `🧬 NULLSWARM · Daily Breach #${level.puzzle} — ${date}`,
    entry: 'default',
    userGeneratedContent: {
      text: `Daily Breach #${level.puzzle}: plant the EMP at the site, reach extraction, dodge the null sentries. One run per operator per day.`,
    },
  });

  await redis.set(keys.post(date), post.id);
  return post.id;
}
