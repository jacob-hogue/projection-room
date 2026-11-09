import { test, expect } from '@playwright/test';

test('index renders the wordmark', async ({ page }) => {
  await page.goto('/projection-room/');
  await expect(page.locator('header .wordmark')).toHaveText('jacob.hogue / projection room');
  await expect(page).toHaveTitle('The Projection Room');
});
