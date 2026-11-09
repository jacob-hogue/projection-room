import { expect, test } from '@playwright/test';

const PAGE = '/projection-room/dial-pulse/';

test('the story runs in beats: dial, camera, callouts, reveal, hand-over', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('h1')).toHaveText('The dial-pulse map');
  const chapters = page.locator('.chapter');
  await expect(chapters).toHaveCount(11);
  await expect(page.locator('#stage path.area').first()).toBeAttached();

  // 1. The dial dials 212 and the clicks appear.
  await chapters.nth(0).scrollIntoViewIfNeeded();
  await expect(chapters.nth(0).locator('svg.dial')).toBeVisible();
  await expect(chapters.nth(0).locator('.dial-clicks .click')).toHaveCount(5, { timeout: 8000 });
  await expect(page.locator('#stage')).toHaveAttribute('data-blank', 'true');

  // 2. The camera goes to New York and a callout names 212.
  await chapters.nth(1).scrollIntoViewIfNeeded();
  await expect(page.locator('#stage')).not.toHaveAttribute('data-zoom', '1.00');
  await expect(page.locator('.callout', { hasText: '212' })).toBeVisible({ timeout: 6000 });

  // 4. All seventy-seven fill in and the stage is no longer blank.
  await chapters.nth(3).scrollIntoViewIfNeeded();
  await expect(page.locator('#stage')).toHaveAttribute('data-blank', 'false', { timeout: 10000 });
  await expect(page.locator('#stage')).toHaveAttribute('data-zoom', '1.00');

  // 6. The middle-digit view.
  await chapters.nth(5).scrollIntoViewIfNeeded();
  await expect(page.locator('#stage')).toHaveAttribute('data-mode', 'middle');

  // 11. Explore hands over the controls and the year input writes the hash.
  await chapters.nth(10).scrollIntoViewIfNeeded();
  await expect(page.locator('#stage')).toHaveAttribute('data-explore', 'true');
  await page.locator('#year').fill('1999');
  await expect(page).toHaveURL(/year=1999/);
  await expect(page.locator('#stage')).toHaveAttribute('data-year', '1999');
});

test('bad hash does not break the page', async ({ page }) => {
  await page.goto(`${PAGE}#year=1900&palette=nope`);
  await expect(page.locator('#stage path.area').first()).toBeAttached();
  await expect(page.locator('#stage')).toHaveAttribute('data-year', '1947');
});

test('reduced motion shows the poster and skips the beats', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(PAGE);
  await expect(page.locator('.opening img.poster')).toBeVisible();
  await expect(page.locator('.opening video')).toHaveCount(0);
  await page.locator('.chapter').nth(3).scrollIntoViewIfNeeded();
  await expect(page.locator('#stage')).toHaveAttribute('data-blank', 'false', { timeout: 3000 });
  await ctx.close();
});

test('chapter text renders without JavaScript', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(PAGE);
  await expect(page.locator('.chapter')).toHaveCount(11);
  await expect(page.locator('.chapter').nth(1).locator('h2')).toHaveText('Five clicks to New York');
  await ctx.close();
});
