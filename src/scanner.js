const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ignore = require('ignore');
const { ownedSegments } = require('./targets');

function tryRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function tryExec(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

/** Minimal TOML table reader — enough for the `key = "value"` tables we care
 * about, without taking a TOML dependency for two sections. */
function tomlTable(content, header) {
  const out = {};
  let inTable = false;
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      inTable = section[1] === header;
      continue;
    }
    if (!inTable || !line || line.startsWith('#')) continue;
    const entry = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*"([^"]*)"/);
    if (entry) out[entry[1]] = entry[2];
  }
  return out;
}

/** Makefile targets are the command surface for most non-npm repos — without
 * these, "Commands" renders empty for anything that isn't Node. */
function readMakefileTargets(cwd) {
  const content = tryRead(path.join(cwd, 'Makefile')) || tryRead(path.join(cwd, 'makefile'));
  if (!content) return {};

  const targets = {};
  for (const line of content.split('\n')) {
    // `name:` or `name: deps` — but not `VAR := value` and not `.PHONY`.
    const match = line.match(/^([A-Za-z0-9][A-Za-z0-9_.-]*)\s*:(?!=)/);
    if (!match) continue;
    const name = match[1];
    if (Object.keys(targets).length >= 15) break;
    targets[name] = `make ${name}`;
  }
  return targets;
}

/** Dominant source extension, used only when no package manifest identified
 * the language — otherwise content and polyglot repos report "unknown". */
const EXTENSION_LANGUAGES = {
  '.ts': 'JavaScript/TypeScript', '.tsx': 'JavaScript/TypeScript',
  '.js': 'JavaScript/TypeScript', '.jsx': 'JavaScript/TypeScript',
  '.mjs': 'JavaScript/TypeScript', '.cjs': 'JavaScript/TypeScript',
  '.py': 'Python', '.rs': 'Rust', '.go': 'Go', '.rb': 'Ruby', '.php': 'PHP',
  '.java': 'Java', '.cs': 'C#', '.swift': 'Swift', '.kt': 'Kotlin',
  '.sh': 'Shell', '.lua': 'Lua', '.sql': 'SQL',
  '.md': 'Markdown', '.html': 'HTML/CSS', '.css': 'HTML/CSS',
};

function inferLanguage(cwd, ig) {
  const counts = {};
  let seen = 0;

  const walk = (dir, relative, depth) => {
    if (depth > 3 || seen > 2000) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (ig.ignores(rel)) continue;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), rel, depth + 1);
      } else {
        seen += 1;
        const language = EXTENSION_LANGUAGES[path.extname(entry.name).toLowerCase()];
        if (language) counts[language] = (counts[language] || 0) + 1;
      }
    }
  };
  walk(cwd, '', 0);

  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return ranked.length ? ranked[0][0] : 'unknown';
}

/** package.json / pyproject.toml / Cargo.toml / go.mod — first match wins. */
function readManifest(cwd) {
  const pkgJson = tryRead(path.join(cwd, 'package.json'));
  if (pkgJson) {
    const pkg = JSON.parse(pkgJson);
    return {
      language: 'JavaScript/TypeScript',
      packageManager: fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))
        ? 'pnpm'
        : fs.existsSync(path.join(cwd, 'yarn.lock'))
        ? 'yarn'
        : 'npm',
      name: pkg.name || null,
      description: pkg.description || null,
      scripts: pkg.scripts || {},
      dependencies: Object.keys(pkg.dependencies || {}),
      devDependencies: Object.keys(pkg.devDependencies || {}),
    };
  }

  const pyproject = tryRead(path.join(cwd, 'pyproject.toml'));
  if (pyproject) {
    const nameMatch = pyproject.match(/name\s*=\s*"([^"]+)"/);
    const descMatch = pyproject.match(/description\s*=\s*"([^"]+)"/);
    return {
      language: 'Python',
      packageManager: fs.existsSync(path.join(cwd, 'poetry.lock')) ? 'poetry' : 'pip',
      name: nameMatch ? nameMatch[1] : null,
      description: descMatch ? descMatch[1] : null,
      scripts: {
        ...tomlTable(pyproject, 'project.scripts'),
        ...tomlTable(pyproject, 'tool.poetry.scripts'),
      },
      dependencies: [],
      devDependencies: [],
    };
  }

  if (fs.existsSync(path.join(cwd, 'requirements.txt'))) {
    return {
      language: 'Python',
      packageManager: 'pip',
      name: null,
      description: null,
      scripts: {},
      dependencies: tryRead(path.join(cwd, 'requirements.txt'))
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      devDependencies: [],
    };
  }

  const cargoToml = tryRead(path.join(cwd, 'Cargo.toml'));
  if (cargoToml) {
    const nameMatch = cargoToml.match(/name\s*=\s*"([^"]+)"/);
    const descMatch = cargoToml.match(/description\s*=\s*"([^"]+)"/);
    return {
      language: 'Rust',
      packageManager: 'cargo',
      name: nameMatch ? nameMatch[1] : null,
      description: descMatch ? descMatch[1] : null,
      scripts: {},
      dependencies: [],
      devDependencies: [],
    };
  }

  if (fs.existsSync(path.join(cwd, 'go.mod'))) {
    const goMod = tryRead(path.join(cwd, 'go.mod'));
    const moduleMatch = goMod.match(/module\s+(\S+)/);
    return {
      language: 'Go',
      packageManager: 'go modules',
      name: moduleMatch ? moduleMatch[1] : null,
      description: null,
      scripts: {},
      dependencies: [],
      devDependencies: [],
    };
  }

  return {
    language: 'unknown',
    packageManager: null,
    name: null,
    description: null,
    scripts: {},
    dependencies: [],
    devDependencies: [],
  };
}

/** First real paragraph of the README, used as a description fallback. */
function readReadmeSummary(cwd) {
  const candidates = ['README.md', 'Readme.md', 'README.rst', 'README', 'README.txt'];
  for (const name of candidates) {
    const content = tryRead(path.join(cwd, name));
    if (!content) continue;
    const lines = content.split('\n').map((l) => l.trim());
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith('#')) continue;
      if (line.startsWith('[![') || line.startsWith('![')) continue;
      return line.length > 240 ? line.slice(0, 237) + '...' : line;
    }
  }
  return null;
}

function buildIgnore(cwd) {
  const gitignore = tryRead(path.join(cwd, '.gitignore'));
  const ig = ignore();
  // Exclude skillfile's own output so a repo's fingerprint never depends on
  // whether skillfile has already run — otherwise `check` right after
  // `init` would report "stale" purely because AGENTS.md now exists.
  // The generated paths come from tools.json (`owns`), and ALL of them are
  // excluded whether or not the repo enabled that target, so the fingerprint
  // tracks repo content only — never which tools were opted into.
  ig.add(['.git', 'node_modules', '.DS_Store', 'SKILLFILE.md', ...ownedSegments()]);
  if (gitignore) ig.add(gitignore);
  return ig;
}

/** Top-level directory listing, .gitignore-aware, one level deep. */
function scanTopLevel(cwd, ig) {
  const entries = fs.readdirSync(cwd, { withFileTypes: true });
  const dirs = [];
  const files = [];
  for (const entry of entries) {
    if (ig.ignores(entry.name)) continue;
    if (entry.isDirectory()) dirs.push(entry.name);
    else files.push(entry.name);
  }
  return { dirs: dirs.sort(), files: files.sort() };
}

function detectTooling(cwd, topLevel) {
  const has = (name) => topLevel.files.includes(name) || topLevel.dirs.includes(name);
  return {
    hasCI: fs.existsSync(path.join(cwd, '.github', 'workflows')),
    hasTests:
      topLevel.dirs.includes('test') ||
      topLevel.dirs.includes('tests') ||
      topLevel.dirs.includes('__tests__'),
    hasDocker: has('Dockerfile') || has('docker-compose.yml'),
    hasTypeScript: has('tsconfig.json'),
    hasLinter: has('.eslintrc') || has('.eslintrc.json') || has('.eslintrc.js') || has('biome.json'),
  };
}

function getGitInfo(cwd) {
  const isRepo = tryExec('git rev-parse --is-inside-work-tree', cwd);
  if (!isRepo) return null;

  const remote = tryExec('git config --get remote.origin.url', cwd);
  const branch = tryExec('git rev-parse --abbrev-ref HEAD', cwd);
  const log = tryExec('git log -5 --pretty=format:%s', cwd);
  const lastCommitDate = tryExec('git log -1 --pretty=format:%ad --date=short', cwd);

  return {
    remote,
    branch,
    recentCommits: log ? log.split('\n') : [],
    lastCommitDate,
  };
}

/** Orchestrates a full deterministic repo scan. No network, no LLM calls. */
function scanRepo(cwd) {
  const ig = buildIgnore(cwd);
  const manifest = readManifest(cwd);
  const readmeSummary = readReadmeSummary(cwd);
  const topLevel = scanTopLevel(cwd, ig);
  const tooling = detectTooling(cwd, topLevel);
  const git = getGitInfo(cwd);

  const repoName = manifest.name || path.basename(cwd);
  const description = manifest.description || readmeSummary || null;

  // Manifest scripts win on a name collision — they're the declared interface;
  // Makefile targets fill in the (usually empty) rest.
  const scripts = { ...readMakefileTargets(cwd), ...manifest.scripts };

  return {
    repoName,
    description,
    language: manifest.language === 'unknown' ? inferLanguage(cwd, ig) : manifest.language,
    packageManager: manifest.packageManager,
    scripts,
    dependencyCount: manifest.dependencies.length,
    devDependencyCount: manifest.devDependencies.length,
    topLevelDirs: topLevel.dirs,
    topLevelFiles: topLevel.files,
    tooling,
    git,
    scannedAt: new Date().toISOString(),
  };
}

module.exports = { scanRepo };
