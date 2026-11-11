import { expect, test } from '@playwright/test';

const PAGE = '/projection-room/spatial-join/';

test('the page is title, film, stack and one post', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('h1')).toHaveText('The spatial join');
  await expect(page.locator('.film video')).toHaveCount(1);
  await expect(page.locator('.film video')).toHaveAttribute('controls', '');
  await expect(page.locator('.stack dt')).toHaveCount(6);
  await expect(page.locator('.post h2').first()).toHaveText('A question about where');
  await expect(page.locator('.post section')).toHaveCount(14); // thirteen sections and the sources
  const words = (await page.locator('.post p').allTextContents()).join(' ').split(/\s+/).length;
  expect(words).toBeGreaterThan(1500);
  expect(words).toBeLessThan(2500);
});

test('the index links to the piece', async ({ page }) => {
  await page.goto('/projection-room/');
  await expect(page.locator('a.piece-card[href$="/spatial-join/"]')).toHaveCount(1);
  await expect(page.locator('a.piece-card[href$="/spatial-join/"] .piece-category')).toHaveText('Solution architecture');
  await expect(page.locator('.piece-card .piece-category')).toHaveCount(2);
});
