import { test, expect } from '@playwright/test';

test('index renders the Lab wordmark', async ({ page }) => {
  await page.goto('/lab/');
  await expect(page.locator('header .wordmark')).toHaveText('jacob.hogue / lab');
  await expect(page).toHaveTitle('The Lab');
});
