import { expect, test } from '@playwright/test';

const PAGE = '/projection-room/dial-pulse/';

test('the story is a stepper: every step lands on a complete state', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('h1')).toHaveText('The dial-pulse map');
  const steps = page.locator('.chapter');
  await expect(steps).toHaveCount(11);
  await expect(page.locator('#stage path.area').first()).toBeAttached();
  await expect(steps.nth(0)).toHaveClass(/is-active/);
  await expect(page.locator('#stage')).toHaveAttribute('data-blank', 'true');
  await expect(steps.nth(0).locator('svg.dial')).toBeVisible();
  await expect(steps.nth(0).locator('.dial-clicks .click')).toHaveCount(5, { timeout: 8000 });

  // Next: the camera goes to New York and a callout names 212.
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(steps.nth(1)).toHaveClass(/is-active/);
  await expect(page.locator('#stage')).not.toHaveAttribute('data-zoom', '1.00');
  await expect(page.locator('.callout', { hasText: '212' })).toBeVisible({ timeout: 6000 });

  // Jumping straight to step 6 (middle digit) lands on its complete state even mid-beat.
  await steps.nth(5).locator('button, h2').first().click();
  await expect(steps.nth(5)).toHaveClass(/is-active/);
  await expect(page.locator('#stage')).toHaveAttribute('data-mode', 'middle');
  await expect(page.locator('#stage')).toHaveAttribute('data-blank', 'false');
  await expect(page.locator('#stage')).toHaveAttribute('data-zoom', '1.00');

  // Keyboard: the right arrow advances.
  await page.keyboard.press('ArrowRight');
  await expect(steps.nth(6)).toHaveClass(/is-active/);

  // Last step hands over the controls and the year input writes the hash.
  await steps.nth(10).locator('button, h2').first().click();
  await expect(page.locator('#stage')).toHaveAttribute('data-explore', 'true');
  await page.locator('#year').fill('1999');
  await expect(page).toHaveURL(/year=1999/);
  await expect(page.locator('#stage')).toHaveAttribute('data-year', '1999');
});

test('play the story advances by itself and can be paused', async ({ page }) => {
  await page.goto(PAGE);
  await page.locator('#stage path.area').first().waitFor({ state: 'attached' });
  const play = page.getByRole('button', { name: 'Play the story' });
  await play.click();
  await expect(page.getByRole('button', { name: 'Pause the story' })).toBeVisible();
  await expect(page.locator('.chapter').nth(1)).toHaveClass(/is-active/, { timeout: 15000 });
  await page.getByRole('button', { name: 'Pause the story' }).click();
  await expect(play).toBeVisible();
});

test('bad hash does not break the page', async ({ page }) => {
  await page.goto(`${PAGE}#year=1900&palette=nope`);
  await expect(page.locator('#stage path.area').first()).toBeAttached();
  await expect(page.locator('#stage')).toHaveAttribute('data-year', '1947');
});

test('reduced motion lands each step at once', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(PAGE);
  await page.locator('#stage path.area').first().waitFor({ state: 'attached' });
  await page.locator('.chapter').nth(3).locator('button, h2').first().click();
  await expect(page.locator('#stage')).toHaveAttribute('data-blank', 'false', { timeout: 3000 });
  await expect(page.locator('.opening video')).toHaveCount(0);
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
