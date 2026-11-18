import { Hono } from 'hono';
import type { TaskRequest, TaskResponse } from '@devvit/web/server';
import { createDailyPost, currentDate } from '../core/daily';

export const scheduler = new Hono();

/** Runs daily at 13:00 UTC: opens the next Daily Breach post. */
scheduler.post('/daily-post', async (c) => {
  const input = await c.req.json<TaskRequest>().catch(() => null);
  const trigger = input === null ? 'cron' : 'task';
  const date = currentDate();
  try {
    const postId = await createDailyPost(date);
    console.log(`daily-post ${date} -> ${postId ?? 'none'} (${trigger})`);
    return c.json<TaskResponse>({ status: 'ok' }, 200);
  } catch (error) {
    console.error('daily-post failed', error);
    return c.json<TaskResponse>({ status: 'error' }, 400);
  }
});
