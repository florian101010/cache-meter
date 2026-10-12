# Changelog

All notable changes to Cache Meter, a Claude Code mod. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] – 2026-10-12

### Changed
- The whole mod is in English: band (`empty`, `expired`, `context`, `auto-compact`, `rewrite`), the `/tokens` pane, toasts, command answers and descriptions, TTL sources, plan-limit names, and the keepwarm ping prompt.
- `/keepwarm` takes `off` (or `0`) to stop; the German `aus` is no longer accepted.
- README leads with keeping the cache warm: a `/keepwarm` section with the cost comparison from the official pricing page and the safety limits, a "Why" section and an FAQ; title "Cache Meter (Claude Code Mod)" in the docs.

### Added
- Directory listing fields in `plugin.json`: `documentationUrl`, `supportUrl`, `privacyPolicyUrl`.

## [0.2.1] – 2026-10-12

### Added
- Repository structure for publishing: English README, `docs/how-it-works.md`, `CONTRIBUTING.md`, `SECURITY.md`, MIT `LICENSE`, this changelog, issue and pull-request templates, CI (`claude plugin validate --strict` and `claude plugin test`).
- `.claude-plugin/marketplace.json`, so the repository installs with `/plugin install cache-meter --marketplace florian101010/cache-meter`.
- Manifest metadata: `displayName`, `homepage`, `repository`, `license`, `keywords`.

### Changed
- Instructions for Claude Code sessions moved from `CLAUDE.md` to `.claude/CLAUDE.md` (a `CLAUDE.md` at the plugin root is not loaded as mod context and makes `validate` warn).

## [0.2.0] – 2026-10-12

### Added
- Pane lists cold rewrites of the session (cache expired at the request's start, ≥ 10k written, more written than read) with their cause and idle time.
- Toast after a cold rewrite caused by a pause, suggesting `/keepwarm`; nothing is switched on automatically.
- `/keepwarm` stops when a ping writes 10 % or more of what it read (partial miss).
- `/keepwarm` refuses outside interactive sessions and never pings while a main request is running.

### Fixed
- Requests that ended during a keepwarm ping were dropped from history and totals.
- After an aborted turn the count of running requests could stay above zero and silently stop `/keepwarm`.
- A cold resume was labelled as a model switch; Claude Code's `prompt_cache_likely_expired` is now used.
- The cold-rewrite rule no longer relies on the clock alone.

## [0.1.1] – 2026-10-12

### Fixed
- The band replaced what other mods draw above the prompt; their content now stays below Cache Meter's row.
- The countdown started at the end of a response instead of the start of the request.
- The Compact button did not always reset the cache display.
- The band could wrap between 100 and 123 columns.
- Wrong values after `/clear`, `/resume`, `/branch`; "auto-compact unknown" and "off" were not told apart.
- A model switch during resume wiped the restored countdown.

### Changed
- TTL derivation follows Claude Code's documented controls (`FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `promptCacheTtl`, `ENABLE_PROMPT_CACHING_1H`).
- `/keepwarm`: at most 12 pings, not at a five-minute TTL, stops when a ping misses the cache.

## [0.1.0] – 2026-10-12

### Added
- Band above the prompt: cache countdown, hit rate, context fill, auto-compact point, Compact button.
- Pane `/tokens`: per-request token history, totals, plan limits, cost.
- `/keepwarm`.

[0.3.0]: https://github.com/florian101010/cache-meter/compare/e430ab2...HEAD
[0.2.1]: https://github.com/florian101010/cache-meter/compare/e430ab2...HEAD
[0.2.0]: https://github.com/florian101010/cache-meter/pull/1
[0.1.1]: https://github.com/florian101010/cache-meter/commit/3217bf4
[0.1.0]: https://github.com/florian101010/cache-meter/commit/b436f27
