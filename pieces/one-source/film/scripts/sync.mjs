// Copy the piece's data into the film's public folder before a render or the studio.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const data = join(here, '..', '..', 'data');
const pub = join(here, '..', 'public');
mkdirSync(pub, { recursive: true });
for (const name of ['towns.topojson', 'parcels.topojson', 'stats.json']) copyFileSync(join(data, name), join(pub, name));
console.log('film data synced');
