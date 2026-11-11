import { expect, test } from '@playwright/test';

const PAGE = '/projection-room/dial-pulse/';

test('the page is title, film, stack and one post', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('h1')).toHaveText('The dial-pulse map');
  await expect(page.locator('.film video')).toHaveCount(1);
  await expect(page.locator('.film video')).toHaveAttribute('controls', '');
  await expect(page.locator('.stack dt')).toHaveCount(7);
  await expect(page.locator('.post h2').first()).toHaveText('Before there were area codes');
  await expect(page.locator('.post section')).toHaveCount(8); // seven sections and the sources
  const words = (await page.locator('.post p').allTextContents()).join(' ').split(/\s+/).length;
  expect(words).toBeGreaterThan(1500);
  expect(words).toBeLessThan(2500);
  await expect(page.locator('#explore')).toHaveCount(0);
});

test('the page reads without JavaScript', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(PAGE);
  await expect(page.locator('.post h2')).toHaveCount(8);
  await ctx.close();
});
