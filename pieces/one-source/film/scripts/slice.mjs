// Render a few seconds of the film for a quick look: node scripts/slice.mjs <from_s> <to_s> [out.mp4]
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const [from, to, outArg] = process.argv.slice(2);
if (!from || !to) {
  console.error('usage: node scripts/slice.mjs <from_s> <to_s> [out.mp4]');
  process.exit(2);
}
const fps = 24;
const a = Math.round(Number(from) * fps);
const b = Math.round(Number(to) * fps) - 1;
const out = outArg ?? join(process.env.TEMP ?? '.', `slice-${from}-${to}.mp4`);
const r = spawnSync('npx', ['remotion', 'render', 'src/index.ts', 'OneSource', out, `--frames=${a}-${b}`, '--codec=h264', '--crf=20', '--log=error'], { stdio: 'inherit', shell: true });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`${from}s to ${to}s -> ${out}`);
