/**
 * Local preview server — NOT part of the Devvit app.
 *
 * Serves the built client bundle with a tiny fake of the Devvit endpoints so
 * the game can be played in a normal browser before it is uploaded.
 *
 *   npm run build && node tools/preview.mjs
 *   open http://localhost:4173/game.html
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate, todayUTC, makeLevel, msUntilTomorrow } from '../src/shared/engine.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = path.join(root, 'dist', 'client');
const port = Number(process.env.PORT ?? 4173);

const date = todayUTC();
const level = makeLevel(date);
const runs = new Map();
const board = [
  { username: 'quietpilot', score: 1150 },
  { username: 'neonrover', score: 1080 },
];
const ranked = () =>
  [...board]
    .sort((a, b) => b.score - a.score)
    .map((row, index) => ({ ...row, rank: index + 1 }));

const json = (res, status, body, type = 'application/json') => {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8` });
  res.end(payload);
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  console.log(req.method, url.pathname);

  if (url.pathname === '/api/init') {
    const run = runs.get('preview');
    return json(res, 200, {
      type: 'init',
      username: 'preview',
      date,
      level,
      streak: 2,
      played: Boolean(run),
      outcome: run?.outcome ?? null,
      breachedToday: 7,
      leaderboard: ranked(),
      rank: run ? 3 : null,
      resetsInMs: msUntilTomorrow(),
    });
  }

  if (url.pathname === '/api/submit' && req.method === 'POST') {
    const body = await readBody(req);
    const moves = Array.isArray(body.moves) ? body.moves : [];
    const existing = runs.get('preview');
    if (existing) {
      return json(res, 200, {
        type: 'submit',
        outcome: existing.outcome,
        streak: 2,
        leaderboard: ranked(),
        rank: 3,
        breachedToday: 7,
        firstSubmit: false,
      });
    }
    const outcome = simulate(level, moves);
    runs.set('preview', { outcome });
    if (outcome.status === 'breached') board.unshift({ username: 'preview', score: outcome.score });
    return json(res, 200, {
      type: 'submit',
      outcome,
      streak: 3,
      leaderboard: ranked(),
      rank: 1,
      breachedToday: 8,
      firstSubmit: true,
    });
  }

  if (url.pathname === '/api/comment' && req.method === 'POST') {
    const run = runs.get('preview');
    if (!run) return json(res, 400, { status: 'error', message: 'play first' });
    return json(res, 200, { type: 'comment', permalink: '/r/preview/comments/fake' });
  }

  const relative = url.pathname === '/' ? '/splash.html' : url.pathname;
  const file = path.join(clientDir, path.normalize(relative).replace(/^(\.\.[/\\])+/, ''));
  try {
    const data = await readFile(file);
    const ext = path.extname(file);
    const type =
      ext === '.html'
        ? 'text/html'
        : ext === '.js'
          ? 'text/javascript'
          : ext === '.css'
            ? 'text/css'
            : ext === '.map'
              ? 'application/json'
              : 'application/octet-stream';
    res.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
    res.end(data);
  } catch {
    json(res, 404, { status: 'error', message: `not found: ${relative}` });
  }
});

server.listen(port, () => {
  console.log(`preview on http://localhost:${port}/game.html (date ${date})`);
});
