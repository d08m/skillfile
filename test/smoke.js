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

if (process.exitCode) {
  console.error('\nsmoke tests FAILED');
} else {
  console.log('\nall smoke tests passed');
}
