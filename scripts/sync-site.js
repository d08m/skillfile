#!/usr/bin/env node
/* The site serves this repo's own AGENTS.md as a worked example, so the copy in
 * site/ has to track the source. A hand-maintained copy that quietly drifts is
 * the exact failure this tool exists to prevent — on its own website.
 *
 *   node scripts/sync-site.js          copy AGENTS.md -> site/AGENTS.md
 *   node scripts/sync-site.js --check  exit 1 if they differ (CI)
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = path.join(root, 'AGENTS.md');
const copy = path.join(root, 'site', 'AGENTS.md');
const check = process.argv.includes('--check');

const want = fs.readFileSync(source, 'utf8');
const have = fs.existsSync(copy) ? fs.readFileSync(copy, 'utf8') : null;

if (want === have) {
  console.log('sync-site: ok — site/AGENTS.md matches AGENTS.md');
  process.exit(0);
}

if (check) {
  console.error('sync-site: site/AGENTS.md is stale.');
  console.error('Run `npm run sync-site` and commit the result.');
  process.exit(1);
}

fs.writeFileSync(copy, want);
console.log('sync-site: wrote site/AGENTS.md');
