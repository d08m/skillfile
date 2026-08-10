# skillfile — build plan

Open-source CLI. Repo → agent-executable skills (`SKILL.md`) + `SKILLFILE.md` manifest, committed to the repo. Full context/decisions: Obsidian `Notes/Ventures/Skillfile.md`.

Domain: skillfile.pro (registered 2026-08-10). Distribution = artifact-in-repo loop (the commit is the share). No paid tier — deferred until real demand appears. No marketing spend — search/discovery surfaces only, see vault note.

## Phase 0 — scope + scaffold
- [ ] Confirm domain registered
- [ ] `npx skillfile init` — three commands only, nothing else:
  - `init`: scan repo (package files, dir structure, README, git log) → generate `SKILLFILE.md` + one or more `SKILL.md` files. Cut down from graphify's analysis logic — no god-node/community-detection stuff, just enough to produce a useful skill.
  - `update`: re-scan, AST-only diff, no LLM call (free, matches graphify's `graphify update .` pattern)
  - `check`: exit non-zero if generated files are stale vs repo state — the CI gate, the actual differentiator
- [ ] Zero-config: running `init` with no flags must work and produce something useful in <2 min
- [ ] Output must be valid AGENTS.md-compatible + Anthropic SKILL.md format simultaneously (cross-agent from one source)

## Phase 1 — dogfood (no launch yet)
- [ ] Run on 2-3 of Dominic's own public/real repos (foundry, quant-ftmo, etc.)
- [ ] Verify: does a cold agent session (no prior context) actually perform better reading the generated skill vs not? This is the bar — not "does it run," but "does it help." If it doesn't clear this, iterate before touching Phase 2.

## Phase 2 — launch surfaces (after Phase 1 passes)

**Ordered by evidence, not by ease.** `obra/superpowers` reached 264k stars with first-party plugin marketplaces as its primary channel — no ads, no outreach, no audience play. That is the one distribution surface compatible with the banned-channel rules, so it goes first, not last.

- [ ] **First-party plugin marketplaces — the lead channel.** Anthropic's Claude Code marketplace and OpenAI's Codex marketplace (`github.com/openai/plugins`). Requires a plugin manifest per marketplace; `tools.json` already makes the per-target rendering a solved problem. Check each marketplace's submission rules before building the manifests.
- [ ] npm publish, GitHub topics (`agents-md`, `claude-code`, `mcp`, `ai-agents`)
- [ ] MCP registry listing + `npx skills add` compatibility
- [ ] One-time PRs: awesome-agent-skills, awesome-mcp-servers
- [x] **Own plugin marketplace (2026-08-10)** — `/plugin marketplace add d08m/skillfile` then `/plugin install skillfile@skillfile`. `claude plugin validate` passes; install verified end to end. No gatekeeper on this path.
- [x] **claude-community submission — SUBMITTED 2026-08-10**, status "Submitted and pending review". Expect a long wait: the crazyseo submission from 2026-08-04 was still pending 6 days on. Check inclusion by grepping `anthropics/claude-plugins-community/.claude-plugin/marketplace.json` for the name. Details below.
- [x] ~~claude-community submission~~ — Console form `platform.claude.com/plugins/submit` (the claude.ai form needs a Team/Enterprise org). Its consent checkbox accepts Anthropic's Software Directory Terms, so Dominic submits. Approved plugins are pinned to a commit SHA; catalog syncs nightly. `claude-plugins-official` is curated at Anthropic's discretion and has no application process.
- [x] ⛔ **OpenAI Codex marketplace — REMOVED as a channel (2026-08-10).** `openai/plugins` has issues disabled, zero merged PRs and no contribution templates; OpenAI pushes entries directly, and the 180 listings are overwhelmingly enterprise partners. `obra/superpowers` appears there, but was vendored in after 264k stars — inclusion is a consequence of traction, not a way to get it. The 2026-07-31 reorder was wrong to list this beside Anthropic's marketplace.
- [ ] skillfile.pro docs pages written to directly answer real dev search queries (geo-citation approach)
- [ ] ONE Show HN post + ONE relevant subreddit post, at this point only — not before, not repeated

> Note the reframe: "platform first-party" is listed elsewhere in this plan as the biggest *threat* (Claude Code `/init` generates CLAUDE.md natively). It is both — the same platforms whose built-in generators compete with us are also the distribution surface that carries independent tools to six figures of reach. Ship to them; don't try to out-generate them.

## Phase 3 — measure, kill gate
- [ ] Weekly: GitHub code search for `SKILLFILE.md` in repos not owned by Dominic — this is the only real metric, not stars
- [ ] Kill gate: 4 weeks post-launch, zero stranger adoption → stop, reassess
- [ ] Paid tier stays OFF unless real companies ask unprompted for hosted ingestion (Slack/Notion/tickets) — see vault note "Monetization — UNPROVEN"

## Explicit non-goals
- No content calendar, no dev-rel outreach, no following-building, no paid promotion
- No hosted/paid tier until Phase 3 evidence demands it
- No competing on raw generation quality alone — AGENTS.md hand-writers and Claude Code `/init` already do that; the wedge is freshness (`check`) + cross-agent output + eventually non-repo sources
