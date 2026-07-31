const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const CLI = path.join(__dirname, '..', 'bin', 'skillfile.js');

function run(cwd, args) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status, stdout: err.stdout ? err.stdout.toString() : '' };
  }
}

function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillfile-smoke-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'smoke-fixture', description: 'fixture', scripts: { test: 'echo ok' } })
  );
  return dir;
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err.message);
    process.exitCode = 1;
  }
}

test('init generates all three files', () => {
  const dir = makeTempRepo();
  const result = run(dir, ['init']);
  assert.strictEqual(result.code, 0, `init should exit 0, got ${result.code}`);
  assert.ok(fs.existsSync(path.join(dir, 'AGENTS.md')));
  assert.ok(fs.existsSync(path.join(dir, 'SKILLFILE.md')));
  assert.ok(fs.existsSync(path.join(dir, '.claude', 'skills', 'smoke-fixture', 'SKILL.md')));
});

test('check passes immediately after init (no self-contamination)', () => {
  const dir = makeTempRepo();
  run(dir, ['init']);
  const result = run(dir, ['check']);
  assert.strictEqual(result.code, 0, `check should be clean right after init, got exit ${result.code}`);
});

test('check fails after the repo changes, passes again after update', () => {
  const dir = makeTempRepo();
  run(dir, ['init']);

  const pkgPath = path.join(dir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.scripts.build = 'echo building';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg));

  const stale = run(dir, ['check']);
  assert.strictEqual(stale.code, 1, `check should detect drift, got exit ${stale.code}`);

  run(dir, ['update']);
  const fresh = run(dir, ['check']);
  assert.strictEqual(fresh.code, 0, `check should pass after update, got exit ${fresh.code}`);
});

test('check on an uninitialized repo exits 2', () => {
  const dir = makeTempRepo();
  const result = run(dir, ['check']);
  assert.strictEqual(result.code, 2, `expected exit 2 for uninitialized repo, got ${result.code}`);
});

test('init refuses to clobber a hand-written AGENTS.md without --force', () => {
  const dir = makeTempRepo();
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# hand written, do not touch');
  const result = run(dir, ['init']);
  assert.strictEqual(result.code, 1);
  assert.ok(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8').includes('hand written'));
});

test('init a second time (no --force) on its own previous output succeeds', () => {
  const dir = makeTempRepo();
  const first = run(dir, ['init']);
  assert.strictEqual(first.code, 0);
  const second = run(dir, ['init']);
  assert.strictEqual(second.code, 0, `re-running init on skillfile's own output should not be refused, got exit ${second.code}`);
});

test('init --force overwrites a hand-written AGENTS.md', () => {
  const dir = makeTempRepo();
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# hand written, do not touch');
  const result = run(dir, ['init', '--force']);
  assert.strictEqual(result.code, 0);
  assert.ok(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8').includes('<!-- skillfile:generated -->'));
});

test('init --tools writes the opt-in targets as well as the defaults', () => {
  const dir = makeTempRepo();
  const result = run(dir, ['init', '--tools', 'claude-md,cursor']);
  assert.strictEqual(result.code, 0, `init --tools should exit 0, got ${result.code}`);
  assert.ok(fs.existsSync(path.join(dir, 'AGENTS.md')), 'defaults still written');
  assert.ok(fs.existsSync(path.join(dir, '.claude', 'skills', 'smoke-fixture', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.md')), 'claude-md target written');
  assert.ok(fs.existsSync(path.join(dir, '.cursor', 'rules', 'smoke-fixture.mdc')), 'cursor target written');
});

test('targets sharing a format render byte-identical output', () => {
  const dir = makeTempRepo();
  run(dir, ['init', '--tools', 'claude-md,gemini-cli,windsurf']);
  const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  for (const dest of ['CLAUDE.md', 'GEMINI.md', '.windsurfrules']) {
    assert.strictEqual(
      fs.readFileSync(path.join(dir, dest), 'utf8'),
      agents,
      `${dest} shares the agents-md format and must be byte-identical to AGENTS.md`
    );
  }
});

test('opt-in tools persist, so a bare update/check keeps honouring them', () => {
  const dir = makeTempRepo();
  run(dir, ['init', '--tools', 'gemini-cli']);
  assert.ok(fs.readFileSync(path.join(dir, 'SKILLFILE.md'), 'utf8').includes('gemini-cli'));

  fs.rmSync(path.join(dir, 'GEMINI.md'));
  const missing = run(dir, ['check']);
  assert.strictEqual(missing.code, 1, 'a deleted declared target is drift');

  run(dir, ['update']);
  assert.ok(fs.existsSync(path.join(dir, 'GEMINI.md')), 'bare update re-wrote the persisted target');
  assert.strictEqual(run(dir, ['check']).code, 0);
});

test('the fingerprint does not depend on which tools are enabled', () => {
  const bare = makeTempRepo();
  run(bare, ['init']);
  const withExtras = makeTempRepo();
  run(withExtras, ['init', '--tools', 'claude-md,gemini-cli,cursor,windsurf']);

  const hashOf = (dir) =>
    fs.readFileSync(path.join(dir, 'SKILLFILE.md'), 'utf8').match(/source-hash:\s*([a-f0-9]+)/)[1];
  assert.strictEqual(hashOf(bare), hashOf(withExtras), 'enabling targets must not move the hash');
});

test('init refuses to clobber a hand-written CLAUDE.md', () => {
  const dir = makeTempRepo();
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# hand written project memory');
  const result = run(dir, ['init', '--tools', 'claude-md']);
  assert.strictEqual(result.code, 1);
  assert.ok(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8').includes('hand written'));
});

test('update --tools refuses to clobber a hand-written file too', () => {
  const dir = makeTempRepo();
  run(dir, ['init']);
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# hand written project memory');

  const result = run(dir, ['update', '--tools', 'claude-md']);
  assert.strictEqual(result.code, 1, `update should refuse, got exit ${result.code}`);
  assert.ok(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8').includes('hand written'));

  const forced = run(dir, ['update', '--tools', 'claude-md', '--force']);
  assert.strictEqual(forced.code, 0);
  assert.ok(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8').includes('<!-- skillfile:generated -->'));
});

test('Makefile targets become commands when there are no manifest scripts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillfile-make-'));
  fs.writeFileSync(
    path.join(dir, 'Makefile'),
    'CC := gcc\n.PHONY: build\nbuild: deps\n\techo building\ntest:\n\techo testing\n'
  );
  run(dir, ['init']);
  const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.ok(agents.includes('`build`: `make build`'), 'build target should be listed');
  assert.ok(agents.includes('`test`: `make test`'), 'test target should be listed');
  assert.ok(!agents.includes('CC'), 'variable assignments must not be read as targets');
});

test('pyproject scripts become commands', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillfile-py-'));
  fs.writeFileSync(
    path.join(dir, 'pyproject.toml'),
    '[project]\nname = "pyfixture"\ndescription = "a python fixture"\n\n[project.scripts]\nserve = "pyfixture.cli:main"\n'
  );
  run(dir, ['init']);
  const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.ok(agents.includes('Language: Python'));
  assert.ok(agents.includes('`serve`: `pyfixture.cli:main`'), 'pyproject script should be listed');
});

test('language is inferred from files when no manifest declares one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillfile-content-'));
  fs.mkdirSync(path.join(dir, 'catalog'));
  for (const name of ['a.md', 'b.md', 'c.md']) fs.writeFileSync(path.join(dir, 'catalog', name), '# doc');
  fs.writeFileSync(path.join(dir, 'one.css'), 'body{}');
  run(dir, ['init']);
  const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.ok(agents.includes('Language: Markdown'), `expected inferred Markdown, got:\n${agents}`);
  assert.ok(!agents.includes('Language: unknown'));
});

/** Committing and switching branches must not count as drift — otherwise the
 * CI gate fails on every push and gets deleted. */
function makeGitRepo() {
  const dir = makeTempRepo();
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: dir,
      stdio: 'ignore',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 't@e.st',
        GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 't@e.st',
      },
    });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-qm', 'initial');
  return { dir, git };
}

test('check survives a new commit (the CI gate must not fail on every push)', () => {
  const { dir, git } = makeGitRepo();
  run(dir, ['init']);
  git('add', '-A');
  git('commit', '-qm', 'add generated agent context');

  const result = run(dir, ['check']);
  assert.strictEqual(result.code, 0, `a commit is not drift, got exit ${result.code}`);
});

test('check survives a branch checkout', () => {
  const { dir, git } = makeGitRepo();
  run(dir, ['init']);
  git('add', '-A');
  git('commit', '-qm', 'context');
  git('checkout', '-qb', 'some-feature');

  assert.strictEqual(run(dir, ['check']).code, 0, 'switching branches is not drift');
});

test('real drift is still caught once git is out of the fingerprint', () => {
  const { dir, git } = makeGitRepo();
  run(dir, ['init']);
  git('add', '-A');
  git('commit', '-qm', 'context');

  const pkgPath = path.join(dir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.scripts.build = 'echo building';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg));

  assert.strictEqual(run(dir, ['check']).code, 1, 'a changed command is still drift');
});

test('an unknown tool name fails loudly instead of silently doing nothing', () => {
  const dir = makeTempRepo();
  const result = run(dir, ['init', '--tools', 'not-a-real-tool']);
  assert.strictEqual(result.code, 1, `expected exit 1 for an unknown tool, got ${result.code}`);
  assert.ok(!fs.existsSync(path.join(dir, 'SKILLFILE.md')), 'nothing should be written on a bad target');
});

// The cross-agent contract: one generated body has to read correctly on Claude
// Code, Codex, Cursor, Gemini CLI and the rest, so it can never name a tool that
// only exists in one of them. Locked down as a test because the failure is
// invisible — output naming `Bash` still looks fine until it runs on Codex.
test('generated bodies never name a harness-specific tool', () => {
  const dir = makeTempRepo();
  run(dir, ['init', '--tools', 'agents-md,claude-skill,cursor,gemini-cli,windsurf,claude-md']);
  const manifest = fs.readFileSync(path.join(dir, 'SKILLFILE.md'), 'utf8');
  // Only the target list — everything below "Keeping this fresh" is bulleted
  // `npx skillfile ...` commands, which are not paths.
  const generated = manifest
    .split('## Keeping this fresh')[0]
    .split('\n')
    .filter((l) => l.startsWith('- `'))
    .map((l) => l.split('`')[1]);
  assert.ok(generated.length > 1, 'expected several targets written');

  // Tool names proper, not the English words: `Read`/`Task`/`Edit` are ordinary
  // prose, so match the call shapes an agent instruction would actually use.
  const harnessTools =
    /\b(?:Bash|Grep|Glob|WebFetch|WebSearch|NotebookEdit|TodoWrite)\b|\b(?:call|invoke|use)\s+(?:the\s+)?`?(?:Read|Edit|Write|Task)\b/i;

  for (const rel of generated) {
    const body = fs.readFileSync(path.join(dir, rel), 'utf8');
    const hit = body.match(harnessTools);
    assert.ok(!hit, `${rel} names harness-specific tool "${hit && hit[0]}" — describe the action instead`);
  }
});

if (process.exitCode) {
  console.error('\nsmoke tests FAILED');
} else {
  console.log('\nall smoke tests passed');
}
