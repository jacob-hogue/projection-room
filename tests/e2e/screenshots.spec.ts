import { test } from '@playwright/test';

/** Review stills for the local check: desktop and phone, top to bottom. */
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
    await shot('01-top');
    await page.locator('.essay').scrollIntoViewIfNeeded();
    await shot('02-story');
    await page.locator('#explore').scrollIntoViewIfNeeded();
    await page.locator('#stage path.area').first().waitFor({ state: 'attached', timeout: 15000 });
    await page.waitForTimeout(800);
    await shot('03-explore');
    await shot('04-full', true);
    await ctx.close();
  });
}
