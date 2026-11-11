import { test, expect } from '@playwright/test';

test('index renders the wordmark', async ({ page }) => {
  await page.goto('/projection-room/');
  await expect(page.locator('header .wordmark')).toHaveText('jacob.hogue / projection room');
  await expect(page).toHaveTitle('The Projection Room');
});

test('The Parcel Problem page has its film or poster', async ({ page }) => {
  const res = await page.goto('/projection-room/parcel-problem/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveText('The Parcel Problem');
  await expect(page.locator('video, .film-poster').first()).toBeVisible();
});

test('gallery cards carry a category tag and a demonstrates line', async ({ page }) => {
  await page.goto('/projection-room/');
  const first = page.locator('.piece-card').first();
  await expect(first.locator('.piece-tag')).toHaveText('Solution architecture');
  await expect(first.locator('.piece-demo')).toContainText('Demonstrates');
});
