// Render one still per beat for review: node scripts/frames.mjs [outDir]
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? join(process.env.TEMP ?? '.', 'film-frames');
mkdirSync(out, { recursive: true });
// Seconds into the film worth looking at: dial, New York, fastest four, reveal, slow end,
// middle digit, mid run, late run, today, end card.
const seconds = [2, 7, 13.5, 18, 25, 30, 38, 44, 49, 54];
for (const s of seconds) {
  const frame = Math.round(s * 30);
  const file = join(out, `t${String(s).replace('.', '_')}.png`);
  const r = spawnSync('npx', ['remotion', 'still', 'src/index.ts', 'DialPulse', file, `--frame=${frame}`, '--log=error'], { stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log(`t=${s}s -> ${file}`);
}
