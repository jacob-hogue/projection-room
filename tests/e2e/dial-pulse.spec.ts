import { expect, test } from '@playwright/test';

const PAGE = '/projection-room/dial-pulse/';

test('the page is film, context, story, then the explore map', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('h1')).toHaveText('The dial-pulse map');
  await expect(page.locator('.film video, .film img.film-poster')).toHaveCount(1);
  await expect(page.locator('.intro-prose h2')).toHaveText('Before there were area codes');
  await expect(page.locator('.essay .part')).toHaveCount(8);
  // The explore map is built only when the reader reaches it.
  await expect(page.locator('#stage path.area')).toHaveCount(0);
  await page.locator('#explore').scrollIntoViewIfNeeded();
  await expect(page.locator('#stage path.area').first()).toBeAttached({ timeout: 15000 });
  await expect(page.locator('#stage')).toHaveAttribute('data-year', '1947');
  await page.locator('#year').fill('1999');
  await expect(page).toHaveURL(/year=1999/);
  await expect(page.locator('#stage')).toHaveAttribute('data-year', '1999');
  await page.getByLabel('middle digit').check();
  await expect(page.locator('#stage')).toHaveAttribute('data-mode', 'middle');
});

test('a link with a hash opens on the explore map in that view', async ({ page }) => {
  await page.goto(`${PAGE}#year=1999&mode=year&palette=cool`);
  await expect(page.locator('#stage path.area').first()).toBeAttached({ timeout: 15000 });
  await expect(page.locator('#stage')).toHaveAttribute('data-year', '1999');
  await expect(page.locator('#stage')).toHaveAttribute('data-mode', 'year');
  await expect(page.locator('#stage')).toHaveAttribute('data-palette', 'cool');
});

test('bad hash falls back to the defaults', async ({ page }) => {
  await page.goto(`${PAGE}#year=1900&palette=nope`);
  await expect(page.locator('#stage path.area').first()).toBeAttached({ timeout: 15000 });
  await expect(page.locator('#stage')).toHaveAttribute('data-year', '1947');
});

test('the story renders without JavaScript', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(PAGE);
  await expect(page.locator('.essay .part')).toHaveCount(8);
  await expect(page.locator('.essay .part').first().locator('h2')).toHaveText('Five clicks to New York');
  await ctx.close();
});
