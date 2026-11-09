import { test } from '@playwright/test';

for (const size of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`dial-pulse stills at ${size.name}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const page = await ctx.newPage();
    await page.goto('/projection-room/dial-pulse/');
    await page.screenshot({ path: `tests/e2e/screenshots/${size.name}-01-top.png` });
    await page.screenshot({ path: `tests/e2e/screenshots/${size.name}-02-full.png`, fullPage: true });
    await ctx.close();
  });
}
