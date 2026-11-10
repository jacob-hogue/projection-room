// Render the piece's poster and gallery card from one frame of the film:
//   node poster.mjs            (frame 3744, 16 s into the map chapter)
//   node poster.mjs <frame>
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const film = join(here, '..', 'film');
const pub = join(here, '..', '..', '..', 'public', 'one-source');
const shrink = join(here, '..', '..', 'dial-pulse', 'pipeline', 'shrink_png.py');
const frame = process.argv[2] ?? '3744';
const poster = join(pub, 'poster.png');
const card = join(pub, 'card.png');

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, cwd });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run('node', ['scripts/sync.mjs'], film);
run('npx', ['remotion', 'still', 'src/index.ts', 'OneSource', `"${poster}"`, `--frame=${frame}`, '--log=error'], film);
run('python', [`"${shrink}"`, `"${poster}"`], here);
run('python', [`"${shrink}"`, `"${poster}"`, `"${card}"`], here);
console.log(`poster and card from frame ${frame}`);
