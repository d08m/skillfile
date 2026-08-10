#!/usr/bin/env node
/* The site republishes files that live elsewhere in the repo: its own AGENTS.md
 * as a worked example, and the plugin's SKILL.md so an agent can install the
 * skill without cloning. A hand-maintained copy that quietly drifts is the exact
 * failure this tool exists to prevent — on its own website.
 *
 *   node scripts/sync-site.js          copy the sources into site/
 *   node scripts/sync-site.js --check  exit 1 if any copy is stale (CI)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pairs = [
  { source: 'AGENTS.md', copy: 'site/AGENTS.md' },
  { source: 'skills/skillfile/SKILL.md', copy: 'site/skill.md' },
];

const check = process.argv.includes('--check');
let stale = 0;

for (const { source, copy } of pairs) {
  const want = fs.readFileSync(path.join(root, source), 'utf8');
  const target = path.join(root, copy);
  const have = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;

  if (want === have) continue;

  if (check) {
    console.error(`sync-site: ${copy} is stale (source: ${source}).`);
    stale++;
    continue;
  }

  fs.writeFileSync(target, want);
  console.log(`sync-site: wrote ${copy}`);
}

if (stale) {
  console.error('Run `npm run sync-site` and commit the result.');
  process.exit(1);
}

console.log(`sync-site: ok — ${pairs.length} copies match their sources`);
