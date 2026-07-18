const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ignore = require('ignore');

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
      scripts: {},
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

/** Top-level directory listing, .gitignore-aware, one level deep. */
function scanTopLevel(cwd) {
  const gitignore = tryRead(path.join(cwd, '.gitignore'));
  const ig = ignore();
  // Exclude skillfile's own output so a repo's fingerprint never depends on
  // whether skillfile has already run — otherwise `check` right after
  // `init` would report "stale" purely because AGENTS.md now exists.
  ig.add(['.git', 'node_modules', '.DS_Store', 'AGENTS.md', 'SKILLFILE.md', '.claude']);
  if (gitignore) ig.add(gitignore);

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
  const manifest = readManifest(cwd);
  const readmeSummary = readReadmeSummary(cwd);
  const topLevel = scanTopLevel(cwd);
  const tooling = detectTooling(cwd, topLevel);
  const git = getGitInfo(cwd);

  const repoName = manifest.name || path.basename(cwd);
  const description = manifest.description || readmeSummary || null;

  return {
    repoName,
    description,
    language: manifest.language,
    packageManager: manifest.packageManager,
    scripts: manifest.scripts,
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
