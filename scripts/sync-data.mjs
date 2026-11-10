// Copy each piece's published data files into public/<piece>/ so the site serves them.
// Runs before `astro dev` and `astro build`; the copies are not committed.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const pieces = join(root, 'pieces');
const served = ['areas.topojson', 'states.topojson', 'lineage.json', 'population_1950.csv', 'towns.topojson', 'parcels.topojson', 'stats.json'];

for (const piece of readdirSync(pieces)) {
  const data = join(pieces, piece, 'data');
  if (!existsSync(data)) continue;
  const out = join(root, 'public', piece);
  mkdirSync(out, { recursive: true });
  for (const name of served) {
    const from = join(data, name);
    if (existsSync(from)) copyFileSync(from, join(out, name));
  }
  console.log(`synced ${piece}`);
}
