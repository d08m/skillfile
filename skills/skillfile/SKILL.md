---
name: skillfile
description: Generate and refresh cross-agent context files (AGENTS.md, Claude SKILL.md) from a deterministic scan of a repository, and check them for drift in CI. Use when a repo has no agent context file, when an existing one names commands or directories that no longer exist, or when asked to keep AGENTS.md/CLAUDE.md fresh automatically. No API key required.
---

# skillfile

Generates agent context files from what a repository actually contains, and detects when they go stale.

Install nothing: every command runs through `npx`.

## Commands

| Command | Effect |
|---|---|
| `npx skillfile init` | Scan the repo, write `AGENTS.md`, `.claude/skills/<name>/SKILL.md` and `SKILLFILE.md` |
| `npx skillfile update` | Re-scan and rewrite the same targets |
| `npx skillfile check` | Exit 0 when fresh, exit 1 when the repo has drifted |

Add other targets with `--tools`: `claude-md`, `gemini-cli`, `cursor`, `windsurf`, alongside the defaults `agents-md` and `claude-skill`. The selection is stored in `SKILLFILE.md` frontmatter, so later bare `update` and `check` runs keep honouring it.

## What it reads

The manifest (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`), Makefile targets, the README's first paragraph, top-level directories and files, tooling markers such as a CI directory or a test directory, and the git branch and recent commit subjects. Everything is gitignore-aware.

There is no model in the loop. The same repository always produces the same bytes.

## How drift is decided

`SKILLFILE.md` stores a `source-hash` covering repo content: name, description, language, package manager, scripts, dependency counts, structure and tooling.

The branch and commit log are rendered into the output but excluded from the hash. This is deliberate — if committing the generated files changed the hash, `check` would fail immediately after every commit and the CI gate would be worthless.

So `check` fails when commands, structure, dependencies or tooling move. It does not fail because someone committed, switched branch, or ran the tool twice.

## Using it well

- Run `init` once, commit the result, then add `npx skillfile check` to CI.
- When `check` fails, run `npx skillfile update` and commit — do not edit the generated files by hand.
- `init` refuses to overwrite a hand-written `AGENTS.md` or `CLAUDE.md` without `--force`. Treat that refusal as correct: keep architecture rationale and conventions in the hand-written file, and let skillfile own the mechanical floor.
- A repo that declares no scripts anywhere will render "no scripts declared". That is accurate, not a failure — do not invent a command to fill the gap.

## Reference

- Package: https://www.npmjs.com/package/skillfile
- Source: https://github.com/d08m/skillfile
- Machine-readable summary: https://skillfile.pro/llms.txt
