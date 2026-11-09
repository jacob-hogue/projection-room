// Render the poster from the built site: public/dial-pulse/poster.svg (the map alone) and
// poster.png (the map with its caption band, 1600 by 1000 at 2x). Needs `npm run build`
// to have run; starts its own preview server on a spare port.
//
//   node render_poster.mjs
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const root = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const out = join(root, 'public', 'dial-pulse');
const port = 4399;
const url = `http://127.0.0.1:${port}/lab/dial-pulse/poster/`;

// Astro writes pages under dist/ without the site base.
if (!existsSync(join(root, 'dist', 'dial-pulse', 'poster', 'index.html'))) {
  console.error('dist/ has no poster page; run `npm run build` first');
  process.exit(1);
}

const server = spawn('npx', ['astro', 'preview', '--port', String(port), '--host', '127.0.0.1'], {
  cwd: root,
  shell: true,
  stdio: 'ignore',
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`preview server did not answer at ${url}`);
}

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  await page.goto(url);
  await page.waitForFunction(() => window.__stageReady === true, null, { timeout: 60_000 });
  const svg = await page.evaluate(() => window.__stage.toSVG());
  writeFileSync(join(out, 'poster.svg'), svg, 'utf8');
  await page.locator('#poster').screenshot({ path: join(out, 'poster.png'), type: 'png' });
  await browser.close();
  console.log(`poster.svg (${svg.length.toLocaleString()} chars) and poster.png written to ${out}`);
} finally {
  server.kill();
  // The shell wrapper leaves the preview process alive on Windows; make sure it goes.
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
}
