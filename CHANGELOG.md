# Changelog

All notable changes to Cache Meter, a Claude Code mod. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] – 2026-10-12

### Added
- `/tokens` has three tabs (hotkeys `1`–`3`, or click them in fullscreen):
  - **Context** – where the context goes: categories, the heaviest memory files (CLAUDE.md and rules), MCP servers with their tool count (deferred tools apart), skills listed of total, agents. From Claude Code's free local estimate after each turn; **Count exactly** (`x`) asks the API once per tool and memory file, as `/context` does.
  - **Health** – session age, prompts, cost at API prices per hour and per prompt, tokens per prompt; requests that ended unusually (output limit, context full, compaction, refusal); API errors (overloaded, rate limit, …, main conversation and subagents apart); server-side tool calls such as the advisor, with durations; and **Claude Code's own verdict on the cache** at model switches and resumes, checked against Cache Meter's clock.
- The overview points at health issues (`2 API errors – see 3: Health`), and the Health tab is marked `!`.
- Band: the session's cost, Claude Code's own figure as `/cost` shows it – **`API value $X`** on a subscription (a comparison, not a charge), **`spent $X`** on an API key or a cloud provider (told apart by whether plan limits are reported); hidden at $0, dropped first when narrow.
- `/tokens overview | context | health` opens on a tab or switches an open pane to it; typing `/tok` lists the three in the typeahead with one line each.
- Option **`autoSidebar`** (`auto` default, `off`): in the fullscreen renderer the dashboard opens by itself as a sidebar at session start, and stays closed once you close it; never above the prompt.

### Changed
- The request chart draws the first write of a cache (session start, after `/compact`) in blue: it is not a loss.
- Cost in the pane reads “≈ $X API value (API-key price)” on a subscription and “$X spent” otherwise, instead of “list price”.
- The pane's footer offers clicking only in the fullscreen renderer (the classic one leaves the mouse to the terminal) and names `/tokens context | health`.
- README and AGENTS.md no longer state a test count.
- A docked pane (fullscreen sidebar) no longer closes on Esc – Esc only hands the keys back; above the prompt Esc still closes it.
- Keepwarm buttons show one short toast; home directories show as `~`.

### Fixed
- The cache check no longer counts a difference right after `/resume`, when Cache Meter had not seen a request yet.

## [0.4.0] – 2026-10-12

### Changed
- `/tokens` redesigned as a dashboard that fits its space: two columns above the prompt from 110 body columns, one column as a sidebar, a compact version in a narrow sidebar; every line truncates instead of wrapping. The pane asks for 26 rows (36 on narrower terminals) instead of a third of the screen.
- Cache card: tall countdown digits, expiry time, a `┃` where keepwarm would ping, what expiry would cost. Meters fill to an eighth of a cell, drawn with `Raster` in the terminal and as text in the Desktop app.
- New **what caching saved** figure (share of the input cost, from the pricing page's multipliers; Mythos 5.1 included).
- Requests as a **column chart**: height = share not read from the cache, color = hit rate; a cold re-write stands out as a tall red column.
- Keepwarm card with **Keep warm 2h** / **Stop** (hotkeys `w` / `s`, `c` for Compact) and a key-hint line.
- `/tokens` toggles the pane; Esc at an empty prompt closes it too. Above the prompt (classic renderer) the pane closes when you send your next prompt, so it doesn't take rows from the conversation; docked beside the transcript (fullscreen, `/tui fullscreen`, from 110 columns) it stays open as a sidebar.
- Band: the hit rate is colored (green from 80 %, yellow from 50 %, red below); shortly before the cache expires the band suggests `/keepwarm?`.

## [0.3.0] – 2026-10-12

### Changed
- The whole mod is in English: band (`empty`, `expired`, `context`, `auto-compact`, `rewrite`), the `/tokens` pane, toasts, command answers and descriptions, TTL sources, plan-limit names, and the keepwarm ping prompt.
- `/keepwarm` takes `off` (or `0`) to stop; the German `aus` is no longer accepted.
- README leads with keeping the cache warm: a `/keepwarm` section with the cost comparison from the official pricing page and the safety limits, a "Why" section and an FAQ; title "Cache Meter (Claude Code Mod)" in the docs.
- README trimmed to what a new user needs; the TTL derivation, how it works and assumptions and limitations moved to `docs/how-it-works.md`, the repository map to `CONTRIBUTING.md`.
- Installation from GitHub tested end to end in an isolated config directory (`claude plugin install cache-meter --marketplace florian101010/cache-meter`): installs, loads, registers both commands, every hook settles.

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

[0.5.0]: https://github.com/florian101010/cache-meter/compare/a520960...HEAD
[0.4.0]: https://github.com/florian101010/cache-meter/compare/18e9711...a520960
[0.3.0]: https://github.com/florian101010/cache-meter/compare/e430ab2...18e9711
[0.2.1]: https://github.com/florian101010/cache-meter/compare/e430ab2...HEAD
[0.2.0]: https://github.com/florian101010/cache-meter/pull/1
[0.1.1]: https://github.com/florian101010/cache-meter/commit/3217bf4
[0.1.0]: https://github.com/florian101010/cache-meter/commit/b436f27
