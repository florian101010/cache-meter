# Changelog

All notable changes to Cache Meter, a Claude Code mod. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] – 2026-10-12

Alive: the band moves when it matters, and a budget keeps a session in check.

### Added
- **Last stretch:** in the last 17 % of the TTL the band redraws every second – the dot pulses, the last minute counts in seconds. The one-second timer runs only then.
- **Keepwarm heartbeat:** after each ping the band shows `· ping ok · <tokens> read` and a bold `↻` for five seconds.
- **Request details on hover** (fullscreen renderer): point at a column of the request chart for its time, tokens, hit rate, writes and output.
- **Session budget** (option `sessionBudget`, dollars, off by default): the band shows `of $X`, yellow from 80 %, red from 100 %, with a toast at each; the Health tab shows the share.
- **Keeping up with Claude Code:** a weekly workflow runs the tests on the newest Claude Code and compares the official pages the mod relies on with stored content hashes (`.github/scripts/upstream-docs.sh`, `docs/upstream-docs.txt`); a change opens an issue. CONTRIBUTING lists every official page and what it settles here.

### Docs
- README: how to update (`claude plugin update cache-meter@cache-meter`, or auto-update for the marketplace).

## [0.8.0] – 2026-10-12

Context under control: what fills the conversation, when it compacts, and a report to share.

### Added
- **What the conversation holds** (Context tab): the main conversation's tool results since the start or the last compact, by tool and the five largest – labelled with the file path or a Bash command's program name, sized as an estimate (characters ÷ 4) beside Claude Code's own total for all messages.
- **Auto-compact forecast** (Overview): how many prompts until auto-compact at the pace since the last compaction.
- **`/tokens report`**: the session as Markdown on the clipboard – cost, cache, warm misses with their cause, context, heaviest files, servers and tool results, subagents, plan limits.

### Changed
- Privacy: Cache Meter now reads the name, a short label and the result length of each tool call (not the result's text, not a command's arguments). README, PRIVACY.md and SECURITY.md say so.
- Plugin description names what each answer costs and what broke the cache.

## [0.7.0] – 2026-10-12

Why and when: what broke the cache, and a word before it happens.

### Added
- **Note before a request that splits a warm cache:** a model for one turn (a skill or command with its own `model`, `opusplan`) or an effort change on a model where effort splits the cache – shown the moment the request goes out, with the tokens it re-writes. No note for effort changes on Opus 5.5, Sonnet 5.5, Haiku 5.5 and Fable 5.1, which keep the cache with an API key or a subscription; on Bedrock, Agent Platform or a gateway they do not, and the warm-miss cause names it afterwards. `/effort` and `/fast` fire no event a mod can catch earlier.
- **Cause of a warm miss** in the Health tab: model or effort change, a changed MCP tool set, a pause longer than the real TTL, or – when none of these – the causes a mod cannot observe (fast mode, a code-intelligence plugin's LSP tool, tool deny rule, removed images). A loaded tool counts only without tool search, which keeps the prefix.
- **Expiry notification** (option `expiryNotice`, off by default): once per cache window, about 10 minutes before a one-hour cache expires and while keepwarm is off, through your own terminal's notification channel. The Health tab shows how many were sent (a terminal does not confirm delivery), or why not.
- **Subagents** in the Health tab: tokens, requests, hit rate and cache saving per subagent, named by type and task.

## [0.6.0] – 2026-10-12

Saves money: each feature points at a cost before or while it happens.

### Added
- **Line under each answer:** what the session cost rose by during the answer (API value on a plan, spend on an API key; subagents it started count), its requests, the share read from the cache and what was written to it. A line another mod already put under the answer is kept. Option `turnLine` (`on`/`off`).
- **Model switch note:** while the cache is warm, a note with Claude Code's own re-write estimate and the minutes the cache has left. It never blocks or approves a switch (`ask` would refuse switches from `/config` and the SDK).
- **Limit forecast:** in the overview, when a plan limit is full at the pace since its first reading in this window, if before its known reset. The pace starts again after a reset.
- **CI:** rejects parameters named `h` (and nested ones named `on`) in `hooks/`, which the plugin directory blocks.
- **MCP calls per server** in the Context tab; a server with no call after three prompts – since the start, `/clear`, `/resume` or `/branch` – is marked *unused so far*.
- **Warm miss** in the Health tab: how often a warm cache was re-written anyway, with the pause before the last one – after seconds the model, effort, fast mode or the tool set changed (editing CLAUDE.md keeps the cache), after minutes the cache lives shorter than the TTL assumed.
- **Compact hint** in the band: when the cache has expired and the context is half full or more, `cold: good time to [ Compact ]`.

## [0.5.4] – 2026-10-12

### Changed
- The last policy hold of the directory (MCP_FORWARDS_CREDENTIAL_ENV) read `hooks/lib.ts` as reading the environment: a variable named `env` (the TTL from Claude Code's setting) and a `Map.set` call. Renamed, and the MCP server sums use a plain record. No change in behaviour.

## [0.5.3] – 2026-10-12

### Docs
- README lists every hook and what it does (and that each passes its event on unchanged), as the directory asks for hooks on `classic.SessionStart` and `session.compact`.
- No wording the directory's scan reads as an image reference or a credential: the changelog and contributing guide no longer name the icon file or the working-directory variable, and a test comment no longer holds a URL. No change in behaviour.

## [0.5.2] – 2026-10-12

Changes for Anthropic's plugin directory, whose validation blocked 0.5.1.

### Added
- Plugin icon for the directory listing: a coffee cup inside the countdown ring (1024×1024).
- Animated README header with the claim *Never lose your prompt cache to a coffee break again.*

### Removed
- The `/tokens` typeahead rows: the directory does not recognize the `prompt.autocomplete` event yet. After `/tokens ` the command's hint still lists the three tabs.

### Changed
- Every call on `$` written as `$.noun.method(…)`, and `$` passed only to top-level functions (pane `Raster` lookup, two test helpers), as the directory's checks expect.
- No parameter named `h` any more: in a `.tsx` file JSX compiles to calls of `h`, and the directory blocked the three `update` callbacks that used it.
- The `classic.SessionStart`, `classic.StopFailure` and `classic.PostModelSwitch` hooks do their own work first and end with `return next(e)`, the shape the directory reads as leaving the event unchanged.
- No URLs in code comments and no working-directory variable in the example commands of README, CONTRIBUTING and AGENTS: the directory read them together as an environment value that could be sent to a remote host.
- README images and brand sources moved to the `assets` branch, so the plugin on `main` holds no image files other than its icon.

## [0.5.1] – 2026-10-12

### Fixed
- The pane's footer hint ran into the Compact button in a sidebar of about 80 columns; the button now keeps its width and a gap, and the hint no longer repeats `c compact`.

### Docs
- README shows real screenshots of the band, the overview, and the Context and Health tabs; opens with three benefit columns, what a break costs, both ways to install (shell or by pasting the link into Claude Code) and three things to try; new section *See everything with `/tokens`*.
- **PRIVACY.md** – what the mod reads, keeps and sends; `privacyPolicyUrl` points to it. Manifest and marketplace descriptions name the dashboard.

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

[0.9.0]: https://github.com/florian101010/cache-meter/compare/feat/v0.8-context...HEAD
[0.8.0]: https://github.com/florian101010/cache-meter/compare/feat/v0.7-why-and-when...feat/v0.8-context
[0.7.0]: https://github.com/florian101010/cache-meter/compare/feat/v0.6-saves-money...feat/v0.7-why-and-when
[0.6.0]: https://github.com/florian101010/cache-meter/compare/92aef39...feat/v0.6-saves-money
[0.5.4]: https://github.com/florian101010/cache-meter/compare/9175da5...92aef39
[0.5.3]: https://github.com/florian101010/cache-meter/compare/bc581d0...9175da5
[0.5.2]: https://github.com/florian101010/cache-meter/compare/cache-meter--v0.5.1...bc581d0
[0.5.1]: https://github.com/florian101010/cache-meter/compare/cache-meter--v0.5.0...cache-meter--v0.5.1
[0.5.0]: https://github.com/florian101010/cache-meter/compare/a520960...cache-meter--v0.5.0
[0.4.0]: https://github.com/florian101010/cache-meter/compare/18e9711...a520960
[0.3.0]: https://github.com/florian101010/cache-meter/compare/e430ab2...18e9711
[0.2.1]: https://github.com/florian101010/cache-meter/compare/e430ab2...HEAD
[0.2.0]: https://github.com/florian101010/cache-meter/pull/1
[0.1.1]: https://github.com/florian101010/cache-meter/commit/3217bf4
[0.1.0]: https://github.com/florian101010/cache-meter/commit/b436f27
