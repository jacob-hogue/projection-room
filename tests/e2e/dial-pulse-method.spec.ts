import { expect, test } from '@playwright/test';

test('method section lists sources, gaps and the credit, with the diagram and the chart', async ({ page }) => {
  await page.goto('/projection-room/dial-pulse/');
  const m = page.locator('#method');
  await m.scrollIntoViewIfNeeded();
  await expect(m.getByText('UCLA Geoportal', { exact: false }).first()).toBeVisible();
  await expect(m.getByRole('heading', { name: 'Known gaps' })).toBeVisible();
  await expect(m.getByText('Voronoi Highways', { exact: false })).toBeVisible();
  await expect(m.locator('svg.diagram')).toHaveCount(1);
  await expect(m.locator('svg.chart circle')).toHaveCount(77, { timeout: 15000 });
  await expect(m.getByText('150.7 million', { exact: false })).toBeVisible();
});
