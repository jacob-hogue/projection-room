import { test } from '@playwright/test';

/** Review stills for the local check: desktop and phone, opening, a chapter, explore. */
const sizes = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];

for (const size of sizes) {
  test(`dial-pulse stills at ${size.name}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const page = await ctx.newPage();
    await page.goto('/lab/dial-pulse/');
    await page.locator('#stage path.area').first().waitFor({ state: 'attached' });
    await page.screenshot({ path: `tests/e2e/screenshots/${size.name}-opening.png` });
    await page.locator('.chapter').nth(1).scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `tests/e2e/screenshots/${size.name}-chapter-2.png` });
    await page.locator('.chapter').nth(2).scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `tests/e2e/screenshots/${size.name}-chapter-3.png` });
    await page.locator('.chapter').nth(4).scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await page.locator('#year').fill('2025');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `tests/e2e/screenshots/${size.name}-explore.png`, fullPage: size.name === 'phone' });
    await ctx.close();
  });
}
