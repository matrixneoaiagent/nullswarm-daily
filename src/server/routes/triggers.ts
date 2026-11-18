import { Hono } from 'hono';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';
import { createDailyPost, currentDate } from '../core/daily';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const input = await c.req.json<OnAppInstallRequest>();
    const postId = await createDailyPost(currentDate());
    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `Daily post ${postId ?? 'skipped'} (${input.type})`,
      },
      200
    );
  } catch (error) {
    console.error('on-app-install failed', error);
    return c.json<TriggerResponse>(
      { status: 'error', message: 'Failed to create the daily post' },
      400
    );
  }
});
