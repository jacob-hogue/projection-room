// Build the site and stage it in the public repository clone next to this one.
//   node scripts/publish.mjs "<commit subject>"
// The public clone (../projection-room) holds the built site only: index.html, the piece folders,
// _astro/, favicons, README.md, .nojekyll and the Pages workflow. Everything else there is replaced
// by this build. The commit is left for you to push; the push is the deploy.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const subject = process.argv[2];
if (!subject) {
  console.error('usage: node scripts/publish.mjs "<commit subject>"');
  process.exit(2);
}
const src = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const pub = resolve(src, '..', 'projection-room');
if (!existsSync(join(pub, '.git'))) {
  console.error(`no public clone at ${pub}`);
  process.exit(1);
}
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, cwd });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run('npm', ['run', 'build'], src);

const keep = new Set(['.git', '.github', 'README.md', '.nojekyll']);
for (const name of readdirSync(pub)) if (!keep.has(name)) rmSync(join(pub, name), { recursive: true, force: true });
cpSync(join(src, 'dist'), pub, { recursive: true });
mkdirSync(join(pub, '.github', 'workflows'), { recursive: true });
cpSync(join(src, 'publish', 'deploy.yml'), join(pub, '.github', 'workflows', 'deploy.yml'));
cpSync(join(src, 'publish', 'README.md'), join(pub, 'README.md'));
cpSync(join(src, 'publish', '.nojekyll'), join(pub, '.nojekyll'));

run('git', ['add', '-A'], pub);
run('git', ['commit', '-q', '-m', `"${subject}"`], pub);
console.log(`staged in ${pub}; push main to deploy`);
