#!/usr/bin/env node

const { Command } = require('commander');
const { init, update, check } = require('../src/commands');

const program = new Command();

program
  .name('skillfile')
  .description('Generate and keep fresh cross-agent context files (AGENTS.md, SKILL.md) from your repo.')
  .version('0.1.0');

program
  .command('init')
  .description('scan the repo and generate AGENTS.md, SKILL.md, and SKILLFILE.md')
  .option('-f, --force', 'overwrite an existing hand-written AGENTS.md')
  .action((opts) => {
    init(process.cwd(), opts);
  });

program
  .command('update')
  .description('re-scan and rewrite the generated files (no LLM call, free)')
  .action(() => {
    update(process.cwd());
  });

program
  .command('check')
  .description('exit non-zero if the generated files are stale vs. the repo — wire into CI')
  .action(() => {
    check(process.cwd());
  });

program.parse(process.argv);
