import { expect, test } from '@playwright/test';

test('chapters drive the map and explore hands over controls', async ({ page }) => {
  await page.goto('/lab/dial-pulse/');
  await expect(page.locator('h1')).toHaveText('The dial-pulse map');
  await expect(page.locator('.chapter')).toHaveCount(5);
  await expect(page.locator('#stage path.area').first()).toBeAttached();
  await page.locator('.chapter').nth(1).scrollIntoViewIfNeeded();
  await expect(page.locator('#stage')).toHaveAttribute('data-year', '1947');
  await expect(page.locator('#stage')).toHaveAttribute('data-labels', 'true');
  await page.locator('.chapter').nth(2).scrollIntoViewIfNeeded();
  await expect(page.locator('#stage')).toHaveAttribute('data-mode', 'middle');
  await page.locator('.chapter').nth(4).scrollIntoViewIfNeeded();
  await expect(page.locator('#stage')).toHaveAttribute('data-explore', 'true');
  await page.locator('#year').fill('1999');
  await expect(page).toHaveURL(/year=1999/);
  await expect(page.locator('#stage')).toHaveAttribute('data-year', '1999');
});

test('bad hash does not break the page', async ({ page }) => {
  await page.goto('/lab/dial-pulse/#year=1900&palette=nope');
  await expect(page.locator('#stage path.area').first()).toBeAttached();
  await expect(page.locator('#stage')).toHaveAttribute('data-year', '1947');
});

test('reduced motion shows the poster', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/lab/dial-pulse/');
  await expect(page.locator('.opening img.poster')).toBeVisible();
  await expect(page.locator('.opening video')).toHaveCount(0);
  await ctx.close();
});

test('chapter text renders without JavaScript', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/lab/dial-pulse/');
  await expect(page.locator('.chapter')).toHaveCount(5);
  await expect(page.locator('.chapter').nth(1).locator('h2')).toHaveText('1947: five clicks to New York');
  await ctx.close();
});
