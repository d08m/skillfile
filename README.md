# skillfile

Generate `AGENTS.md` and Claude-format `SKILL.md` from your repo, deterministically — no LLM calls, no API key, no config.

```
npx github:d08m/skillfile init     # scan repo, write AGENTS.md + .claude/skills/<name>/SKILL.md + SKILLFILE.md
npx github:d08m/skillfile update   # re-scan, rewrite (free)
npx github:d08m/skillfile check    # exit non-zero if the files are stale — wire into CI
```

Not on npm yet, so the commands run straight from this repo. Once it is published
they shorten to `npx skillfile <command>`.

Commit the generated files. `check` in CI catches drift the same way a stale lockfile check does.

## Why

Every coding agent (Claude Code, Cursor, Codex, Copilot, Gemini CLI...) reads its own context-file convention, and those files rot the moment nobody remembers to update them by hand. skillfile scans your `package.json`/`pyproject.toml`/`Cargo.toml`, README, directory structure, and recent git activity, and regenerates both formats from one source — so they can't silently drift apart, and `check` means they can't silently go stale either.

## Status

Early. `init` / `update` / `check` work and are smoke-tested (`npm test`). Not yet published to npm.
