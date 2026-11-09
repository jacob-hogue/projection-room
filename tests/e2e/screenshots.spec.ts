import { test } from '@playwright/test';

/** Review stills for the local check: desktop and phone, through the beats. */
const sizes = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];

for (const size of sizes) {
  test(`dial-pulse stills at ${size.name}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const page = await ctx.newPage();
    const shot = (name: string, fullPage = false) => page.screenshot({ path: `tests/e2e/screenshots/${size.name}-${name}.png`, fullPage });
    await page.goto('/projection-room/dial-pulse/');
    await page.locator('#stage path.area').first().waitFor({ state: 'attached' });
    await shot('01-opening');
    const chapters = page.locator('.chapter');
    const go = async (i: number, wait: number) => {
      await chapters.nth(i).scrollIntoViewIfNeeded();
      await page.waitForTimeout(wait);
    };
    await go(0, 4500);
    await shot('02-dial');
    await go(1, 3200);
    await shot('03-new-york');
    await go(2, 3200);
    await shot('04-fastest-four');
    await go(3, 5000);
    await shot('05-originals');
    await go(4, 2200);
    await shot('06-slow-end');
    await go(5, 2200);
    await shot('07-middle');
    await go(7, 6000);
    await shot('08-fracture-mid');
    await go(8, 2500);
    await shot('09-today');
    await go(9, 4000);
    await shot('09b-pattern');
    await go(10, 1500);
    await page.locator('#year').fill('2025');
    await page.waitForTimeout(600);
    await shot('10-explore', size.name === 'phone');
    await ctx.close();
  });
}
