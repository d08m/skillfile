# skillfile

Generate `AGENTS.md` and Claude-format `SKILL.md` from your repo, deterministically — no LLM calls, no API key, no config.

```
npx skillfile init     # scan repo, write AGENTS.md + .claude/skills/<name>/SKILL.md + SKILLFILE.md
npx skillfile update   # re-scan, rewrite (free)
npx skillfile check    # exit non-zero if the files are stale — wire into CI
```

Commit the generated files. `check` in CI catches drift the same way a stale lockfile check does.

[skillfile.pro](https://skillfile.pro) · [npm](https://www.npmjs.com/package/skillfile) · MIT · Node 18+

## Why

Every coding agent (Claude Code, Cursor, Codex, Copilot, Gemini CLI...) reads its own context-file convention, and those files rot the moment nobody remembers to update them by hand. skillfile scans your `package.json`/`pyproject.toml`/`Cargo.toml`, README, directory structure, and recent git activity, and regenerates both formats from one source — so they can't silently drift apart, and `check` means they can't silently go stale either.

## What decides staleness

`SKILLFILE.md` stores a `source-hash` of the scan: name, description, language, package manager, scripts, dependency counts, structure and tooling.

The git branch and commit log are rendered into the output but deliberately **excluded** from the hash. If committing the generated files changed the hash, `check` would fail immediately after every commit and the CI gate would be worthless. So drift means "the commands, structure or dependencies moved", never "someone committed".

## Other targets

`AGENTS.md` and the Claude skill are the defaults. Add more from the same scan:

```
npx skillfile init --tools claude-md,gemini-cli,cursor,windsurf
```

The selection persists in `SKILLFILE.md` frontmatter, so later bare `update` and `check` runs keep honouring it. Targets are declared as data in `tools.json`; `npm run check-tools` fails the build if the catalog and the renderers disagree.

## Install as a Claude Code plugin

The repo is also a plugin marketplace, so Claude can learn to drive the tool:

```
/plugin marketplace add d08m/skillfile
/plugin install skillfile@skillfile
```

That installs a skill teaching Claude when to generate context files, how drift is decided, and when *not* to touch a hand-written file.

## In CI

```yaml
- run: npm install
- run: npm test
# a stale AGENTS.md fails the build, same as a stale lockfile
- run: npx skillfile check
```

## For agents

Machine-readable, no rendering required: [llms.txt](https://skillfile.pro/llms.txt) · [skill.md](https://skillfile.pro/skill.md) · [AGENTS.md](https://skillfile.pro/AGENTS.md)

## Status

`skillfile@0.1.0` on npm. `init` / `update` / `check` work and are smoke-tested (`npm test`), and this repo dogfoods its own `check` in CI.
