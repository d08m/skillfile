#!/usr/bin/env node
/**
 * CI gate: fails the build when tools.json and src/render.js disagree.
 *
 * The catalog is only a source of truth if something enforces it — otherwise
 * a target quietly points at a renderer that no longer exists and the failure
 * surfaces in a stranger's repo instead of here.
 */

const { loadCatalog, validateCatalog } = require('../src/targets');
const { RENDERERS } = require('../src/render');

const catalog = loadCatalog();
const errors = validateCatalog(catalog);

// The byte-identical contract: targets sharing a `format` must produce the
// same bytes. Verified against a fixture scan rather than assumed.
const fixtureScan = {
  repoName: 'fixture',
  description: 'fixture repo',
  language: 'JavaScript/TypeScript',
  packageManager: 'npm',
  scripts: { test: 'node test/smoke.js' },
  dependencyCount: 2,
  devDependencyCount: 0,
  topLevelDirs: ['src', 'test'],
  topLevelFiles: ['package.json'],
  tooling: { hasCI: true, hasTests: true, hasTypeScript: false, hasLinter: false, hasDocker: false },
  git: { remote: null, branch: 'main', recentCommits: ['init'], lastCommitDate: '2026-07-31' },
  scannedAt: '2026-07-31T00:00:00.000Z',
};

const byFormat = new Map();
for (const [id, target] of Object.entries(catalog.targets)) {
  if (!RENDERERS[target.format]) continue;
  const output = RENDERERS[target.format](fixtureScan);
  if (byFormat.has(target.format)) {
    const [otherId, otherOutput] = byFormat.get(target.format);
    if (output !== otherOutput) {
      errors.push(
        `targets "${id}" and "${otherId}" share format "${target.format}" but render different bytes`
      );
    }
  } else {
    byFormat.set(target.format, [id, output]);
  }
}

if (errors.length) {
  console.error('check-tools: tools.json is inconsistent with src/render.js\n');
  for (const error of errors) console.error(`  - ${error}`);
  console.error('\nFix tools.json or src/render.js so they agree, then re-run `npm run check-tools`.');
  process.exit(1);
}

const targetCount = Object.keys(catalog.targets).length;
const formatCount = Object.keys(catalog.formats).length;
console.log(`check-tools: ok — ${targetCount} targets across ${formatCount} formats, all renderers resolved.`);
