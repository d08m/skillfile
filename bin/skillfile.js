#!/usr/bin/env node

const { Command } = require('commander');
const { init, update, check, knownTargetIds } = require('../src/commands');

const TOOLS_HELP = `extra tools to generate for, comma-separated (${knownTargetIds().join(', ')})`;
const list = (value) => value.split(',').map((s) => s.trim()).filter(Boolean);

const program = new Command();

program
  .name('skillfile')
  .description('Generate and keep fresh cross-agent context files (AGENTS.md, SKILL.md) from your repo.')
  .version('0.1.0');

program
  .command('init')
  .description('scan the repo and generate AGENTS.md, SKILL.md, and SKILLFILE.md')
  .option('-f, --force', 'overwrite existing hand-written context files')
  .option('-t, --tools <list>', TOOLS_HELP, list)
  .action((opts) => {
    init(process.cwd(), opts);
  });

program
  .command('update')
  .description('re-scan and rewrite the generated files (no LLM call, free)')
  .option('-t, --tools <list>', `${TOOLS_HELP} — added to the set already in SKILLFILE.md`, list)
  .option('-f, --force', 'overwrite existing hand-written context files')
  .action((opts) => {
    update(process.cwd(), opts);
  });

program
  .command('check')
  .description('exit non-zero if the generated files are stale vs. the repo — wire into CI')
  .action(() => {
    check(process.cwd());
  });

program.parse(process.argv);
