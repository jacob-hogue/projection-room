import { test, expect } from '@playwright/test';

test('index renders the wordmark', async ({ page }) => {
  await page.goto('/projection-room/');
  await expect(page.locator('header .wordmark')).toHaveText('jacob.hogue / projection room');
  await expect(page).toHaveTitle('The Projection Room');
});

test('the One Source page has its film or poster', async ({ page }) => {
  const res = await page.goto('/projection-room/one-source/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveText('One Source');
  await expect(page.locator('video, .film-poster').first()).toBeVisible();
});
