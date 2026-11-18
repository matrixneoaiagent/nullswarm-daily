import type { Level, RunOutcome } from './engine';

export type LeaderboardRow = {
  username: string;
  score: number;
  rank: number;
};

export type InitResponse = {
  type: 'init';
  username: string;
  date: string;
  level: Level;
  streak: number;
  played: boolean;
  outcome: RunOutcome | null;
  breachedToday: number;
  leaderboard: LeaderboardRow[];
  rank: number | null;
  resetsInMs: number;
};

export type SubmitResponse = {
  type: 'submit';
  outcome: RunOutcome;
  streak: number;
  leaderboard: LeaderboardRow[];
  rank: number | null;
  breachedToday: number;
  firstSubmit: boolean;
};

export type CommentResponse = {
  type: 'comment';
  permalink: string;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};

export type SubmitRequest = {
  moves: number[];
};
