import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, reddit } from '@devvit/web/server';
import { createDailyPost, currentDate, levelFor } from '../core/daily';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const date = currentDate();
    const postId = await createDailyPost(date);
    if (!postId) {
      return c.json<UiResponse>({ showToast: 'No subreddit in context' }, 400);
    }
    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${postId.replace(/^t3_/, '')}`,
      },
      200
    );
  } catch (error) {
    console.error('menu post-create failed', error);
    return c.json<UiResponse>({ showToast: 'Failed to create post' }, 400);
  }
});

menu.post('/hint', async (c) => {
  const level = levelFor(currentDate());
  const user = await reddit.getCurrentUsername();
  return c.json<UiResponse>(
    {
      showToast: `${user ?? 'operator'}: par is ${level.par} turns, site at r${Math.floor(level.site / 6) + 1}c${(level.site % 6) + 1}`,
    },
    200
  );
});
