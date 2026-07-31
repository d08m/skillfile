const fs = require('fs');
const path = require('path');
const { RENDERERS } = require('./render');

const CATALOG_PATH = path.join(__dirname, '..', 'tools.json');

function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

/** Contract checks shared by the CLI and by `npm run check-tools` in CI, so a
 * malformed catalog fails the same way in both places. */
function validateCatalog(catalog) {
  const errors = [];
  const { formats, targets } = catalog;

  if (!formats || !targets) return ['tools.json must define both "formats" and "targets"'];

  for (const [name, renderer] of Object.entries(formats)) {
    if (!RENDERERS[name]) {
      errors.push(`format "${name}" is declared in tools.json but missing from RENDERERS in src/render.js`);
    } else if (RENDERERS[name].name !== renderer) {
      errors.push(`format "${name}" points at "${renderer}" but RENDERERS resolves to "${RENDERERS[name].name}"`);
    }
  }

  for (const name of Object.keys(RENDERERS)) {
    if (!formats[name]) errors.push(`renderer "${name}" exists in src/render.js but is not declared in tools.json`);
  }

  const seenDest = new Map();
  for (const [id, target] of Object.entries(targets)) {
    for (const field of ['label', 'format', 'dest', 'owns', 'order']) {
      if (target[field] === undefined) errors.push(`target "${id}" is missing required field "${field}"`);
    }
    if (target.format && !formats[target.format]) {
      errors.push(`target "${id}" uses format "${target.format}", which tools.json does not declare`);
    }
    if (target.dest) {
      if (path.isAbsolute(target.dest) || target.dest.includes('..')) {
        errors.push(`target "${id}" dest must be a repo-relative path without "..": got "${target.dest}"`);
      }
      if (seenDest.has(target.dest)) {
        errors.push(`target "${id}" and "${seenDest.get(target.dest)}" both write to "${target.dest}"`);
      }
      seenDest.set(target.dest, id);

      // `owns` is what the scanner excludes from the fingerprint. If it isn't
      // the first segment of dest, enabling the target would mutate the scan
      // and `check` would report stale immediately after `update`.
      const firstSegment = target.dest.split('/')[0];
      if (target.owns && target.owns !== firstSegment) {
        errors.push(`target "${id}" owns "${target.owns}" but writes under "${firstSegment}" — the fingerprint would drift`);
      }
    }
  }

  const defaults = Object.values(targets).filter((t) => t.default);
  if (defaults.length === 0) errors.push('tools.json declares no default targets — a bare `init` would write nothing');

  return errors;
}

function assertValid(catalog) {
  const errors = validateCatalog(catalog);
  if (errors.length) {
    throw new Error(`tools.json is inconsistent with src/render.js:\n  - ${errors.join('\n  - ')}`);
  }
}

/** Every `owns` value, enabled or not. The scanner excludes all of them
 * unconditionally so a repo's fingerprint never depends on which tools it
 * opted into — only on the repo's own content. */
function ownedSegments(catalog = loadCatalog()) {
  return [...new Set(Object.values(catalog.targets).map((t) => t.owns).filter(Boolean))];
}

function defaultTargetIds(catalog = loadCatalog()) {
  return Object.entries(catalog.targets)
    .filter(([, t]) => t.default)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([id]) => id);
}

function knownTargetIds(catalog = loadCatalog()) {
  return Object.keys(catalog.targets);
}

/** Resolve target ids into concrete writes. Default targets are always
 * included: they are the artifact the whole loop depends on, so `--tools`
 * adds to them rather than replacing them. */
function resolveTargets(ids, scan, catalog = loadCatalog()) {
  assertValid(catalog);

  const requested = new Set([...defaultTargetIds(catalog), ...(ids || [])]);
  const unknown = [...requested].filter((id) => !catalog.targets[id]);
  if (unknown.length) {
    throw new Error(
      `unknown tool(s): ${unknown.join(', ')}\nAvailable: ${knownTargetIds(catalog).join(', ')}`
    );
  }

  return [...requested]
    .map((id) => ({ id, ...catalog.targets[id] }))
    .sort((a, b) => a.order - b.order)
    .map((t) => ({
      id: t.id,
      label: t.label,
      format: t.format,
      dest: t.dest.replace('{repo}', scan.repoName),
      render: () => RENDERERS[t.format](scan),
    }));
}

/** Read back the tools a repo enabled, from SKILLFILE.md frontmatter, so a
 * bare `update`/`check` in CI keeps honouring them. */
function readEnabledTools(manifestContent) {
  const match = manifestContent.match(/^tools:\s*\[([^\]]*)\]/m);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = {
  loadCatalog,
  validateCatalog,
  assertValid,
  ownedSegments,
  defaultTargetIds,
  knownTargetIds,
  resolveTargets,
  readEnabledTools,
  CATALOG_PATH,
};
