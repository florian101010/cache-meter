# Changelog

All notable changes to Cache Meter, a Claude Code mod. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.12.2] – 2026-10-29

For the review of Anthropic's plugin directory: 0.12.1 passed the automatic checks and is held for a reviewer. No change in behaviour.

### Changed
- `MOD_ANSWERS_PERMISSION`: the `/keepwarm` hook calls `next(e)` itself and hands the answer to a helper (`answerOrFallback`), so its event visibly goes on unchanged; no helper declares parameters named like a hook's (`e`, `next`) any more, and no `next` is cast.

### Docs
- README *What leaves your machine, call by call*: what `$.ui.notify` sends (two fixed texts, through Claude Code's own notification channel), `$.model.fork` and **Count exactly**; that `$.settings.read()` is read for `promptCacheTtl` only and `$.session.turns()` is a count, neither sent anywhere; that the CI scripts in `.github/` only read the mod's files and run on GitHub, the credential prefixes in `lib.ts` only hide such strings in labels, and `tests/` holds the test kit's calls.

## [0.12.1] – 2026-10-29

For Anthropic's plugin directory, whose check failed 0.12.0. No change you would notice, except that a failed animation file now shows Claude Code's own dimmed error line in its place.

### Fixed
- `MOD_HOOKS_UNKNOWN_EVENT`: the `ui.fault` hook is gone – the directory's list of events doesn't hold it yet. A café or arrow file that fails shows Claude Code's dimmed error line in its place; the rest of the pane draws as before.
- `MOD_IMPORT_DYNAMIC_COMPUTED`: the café and the turning keepwarm arrow are written as `h('Client', { module: './cafe.tsx', … })` with the module as one fixed string, so the directory can read which file loads there; whether a surface draws them comes from `e.surface` (terminal, Desktop).
- `MOD_SOURCE_UNCERTAIN`: no module imports `types/index.d.ts` any more; `hooks/state.ts` derives the value types from its `PluginState`.
- `MOD_CONFIG_SET_UNREAD`: the test mod that changes the option `keepwarm` names each row as fixed text.

### Changed
- The `config.set` hook passes every change on unchanged (`return next(e)`) and applies the option `keepwarm` a second later from the value the row then holds (`$.config.list`) – a refused change keeps the old value.

### Docs
- README: what `config.set` does, and that the calls a scan finds in `tests/` (running commands and tools, submitting prompts, setting the option) are the test kit's, not the mod's.

## [0.12.0] – 2026-10-13

Every break, by itself.

### Added
- **`/keepwarm auto`** (also `/keepwarm-auto`, listed beside `/keepwarm` in the typeahead): once typed, every break of the session is covered. Each prompt and answer moves the window to *now + 2h* (`/keepwarm auto 4h`, 10m to 8h), so the ping goes out only once you have been away long enough – lunch, a call, a long read; your next prompt ends the break. Opt-in per session, nothing written to disk; stays on through `/clear`, `/resume` and `/branch`. At most 12 pings per break; a longer break lets the cache go and the next answer covers the next one; a miss, an unanswered or refused ping or a 5-minute TTL switches it off for good, and what happened while you were away is said again at your next prompt. It starts only on your own command (typed, or through Remote Control) – another mod's `$.command.run` is refused. `/keepwarm-auto off` stops it. The keepwarm card reads *Keepwarm auto · breaks up to 2h*.
- **Another plugin with `/keepwarm`:** mod commands share one name, and only the first mod in the hook chain answers; a name another plugin registered first is refused for this one (measured with 2.1.296). Cache Meter reads the command list at start, says once when another plugin has `/keepwarm`, passes `/keepwarm` words it doesn't know – and `off` – on to it, and shows its own usage if nobody answers there. `/keepwarm-auto off` always reaches Cache Meter.
- **Option `keepwarm`** (`on` by default): `off` removes `/keepwarm` and `/keepwarm-auto` and every keepwarm tip (band, dashboard, cold toast, expiry notice) – Cache Meter then sends no request of its own, and another plugin's `/keepwarm` gets the name. Switched in `/config` it applies at once: off stops a running keepwarm and hides both commands from the menu (a command cannot be unregistered mid-session; typed in full it says how to switch keepwarm on), on registers them again. New hooks `config.set` (its own row only, after the write) and `command.describe` (its own two commands only).
- **`[ Keep warm ]` in the band**, in place of the `· /keepwarm?` hint: in the last stretch of a warm cache, with keepwarm off, one press starts the same two-hour run as the pane's button. Only where `[ Compact ]` may show (not mid-answer, not with the pane open), at a one-hour TTL and with the option `keepwarm` on; dropped first in a narrow row; no hotkey, so typing never starts it.
- A Code of Conduct (Contributor Covenant 2.1), linked from README and CONTRIBUTING.
- The manifest names the plugin's icon for Anthropic's directory listing (field `icon`, the brand icon the plugin already carries); CI checks that the icon exists inside the plugin and is an image.

### Changed
- Each command is registered on its own: one that Claude Code refuses (a built-in's name, or a name another plugin registered first) fails only that one, with a debug-log line.
- `/keepwarm` shows `auto` in its argument hint; the cold-rewrite tip mentions `/keepwarm auto`; `/tokens report` names an auto run.
- The plugin's description (`plugin.json`, `marketplace.json`) is one line, as `/plugin` shows it: *Stop wasting tokens: keeps your prompt cache warm through breaks with /keepwarm, shows when it expires and what each answer costs.* The marketplace line reads *Cache Meter – a Claude Code Mod that stops wasted tokens.*; the author links to floriangrimmer.de.
- The `/config` help texts of the options are short enough to read under a toggle; `cacheTtl` names the model-switch value and what to pick on an API key.
- Labels: invisible characters (bidi, zero width) are removed too.

### Docs
- README: **Why you'll want it** at the top, under a new *WHY CACHE METER – Stop wasting tokens* banner ($1.20 re-write against a $0.03 ping) – each feature as the problem it solves, in the reader's words, what Cache Meter does and where; an independent-project line under the badges.
- *Sends nothing you have not switched on* – with `/keepwarm auto` on, its pings go out by themselves (README, PRIVACY, SECURITY, AGENTS). The README's `/keepwarm` range is 10m–8h, as the command takes it (it said 30m).
- A ping's cost is the cache read – 1/20 of a re-write or less (1/40 on Opus 5.5 and Sonnet 5.5) – plus its short answer, which may include thinking (a fork takes no output cap). Tip for API keys: `promptCacheTtl` `1h` makes `/keepwarm` usable there where the provider offers one-hour caching (one-hour writes 2× instead of 1.25×); with `auto` on an API key Cache Meter assumes an hour, so set `5m` or `1h`. A subscription's plan usage for cache reads is not documented (no "same ratio").
- `/tokens report` is described as *session stats* – never the conversation – instead of *the whole session*, which read as a copy of the chat (README, banner); subagent task descriptions are named as included.
- `docs/how-it-works.md` ordered by topic – overview, the cache, keeping it warm, the band, the pane, notices, quality – with a contents list; `/keepwarm auto` and *Where the pane sits* have headings of their own. The reorder changed no statement; corrections from the review came in with it: the last three cold re-writes (not five), the band's drop order, the subagent TTL controls, sources for stop reasons and the context colour.
- What stays over `/clear` in the mod's own variables is listed in full (README, PRIVACY, SECURITY), including the auto setting, its last notice and another plugin's name; reasons for failures go to Claude Code's debug log.

## [0.11.0] – 2026-10-12

Words when they matter – only measured figures, no guessed savings.

### Added
- **One tool result floods the context:** a toast when a single result in the main conversation is at least 10k tokens and 2 % of the window – with its short label and the estimated size; at most one such toast per 20 seconds.
- **Plan limits filling up:** a toast once per limit window when a limit is half used and, at the pace since the window started, full before it resets; with the new option `limitNotice` also a notification through your own channel.
- **/compact note** in the Context tab when the conversation's messages are 20k tokens or more and a quarter of the context – what is re-sent, and that `/compact` summarizes it as one large request; no saving is promised.
- **MCP servers:** each server's share of every request's context, beside its tools and calls.
- **After /clear:** what the ended conversation came to – cost, requests, share from the cache, cold re-writes – from the mod's own figures (after `/resume` counted from there; after a reload without the cost).
- **Quickstart** at the top of the README, and a tip where the pane opens above the prompt: the `/tokens` reply and a line on the Overview say that `/tui fullscreen` puts it beside the chat as a sidebar (from 110 columns; in fullscreen, a wider window) – in a terminal only.

### Changed
- **Labels:** a credential prefix inside a path part (`backup-ghp_…`), more prefixes (`tskey-`, `ya29.`, `dckr_pat_`, `hvs.` …) and long runs of letters and digits mixed (also base64 with `+ = .`) are masked as `…` in file paths too; a Bash program name like that gives just `Bash`.
- **Plan limits:** a reset time that moves by under a minute is the same window – the pace no longer starts over, and a `/clear` does not warn about the same window twice.

## [0.10.0] – 2026-10-12

A café that acts out the cache.

### Added
- **The café** (option `animations`, on by default): docked beside the chat, the room under the request chart shows a pixel barista (orange, with a brown cap and a white apron – a figure of its own) and a cup – stirring while Claude works, coffee dripping into the cup when a fresh cache is written, steam and a sip while it is warm, thin steam and a watched clock in the last stretch, a puff on a keepwarm ping, a grey cup and a nap once it is cold. A separate surface module (`hooks/cafe.tsx`, a `Client`) with its own frame clock at four frames a second, only while the Overview is on screen; it gets nothing but the cache's state word. With too little room, one line.
- **Minute flash:** the big countdown lights up once at each new minute, and a shine runs across its bar.
- **Short animations on the Overview:** a new request column grows in from below, cost and the cache saving count up to a new figure, and the keepwarm arrow turns while keepwarm runs (`hooks/spin.tsx`, a `Client` of its own). One redraw train for all of them, at most 10 redraws a second; none on the first draw, after a reload or a tab switch; all off with `animations: off`.
- `ui.fault`: if the café's or the arrow's file fails, the pane leaves that one out and writes the reason to the debug log.
- With too little room the café's one-line fallback stands still: its frame clock asks for no redraw, so terminal apps that repaint badly see no traffic there.

### Changed
- The Health tab's Session card names the report: `copy as Markdown: /tokens report` – the pane mentioned it nowhere before. README: the section is now *Copy the session as Markdown*, and says the report only goes to your own clipboard.
- The pane footer names the two other tabs (`/tokens overview | health` on the Context tab, …), not always `context | health` – it said `/tokens health` on the Health tab itself.
- **Narrow docks keep every tab:** below 50 columns the header shows only `◉` and tighter gaps, below 36 `Over` and `Ctx` – measured in tmux from 30 to 200 columns, every card frame intact; before, the title wrapped at 48, vanished at 40 and a tab was cut at 30.
- **Keyboard in the pane, in one step:** while the `/tokens` pane is open the band leaves out its Compact button (the pane has its own, `c`), so the first `Ctrl+X Tab` lands in the pane instead of on that button. The pane says when it has the keyboard: its bottom line turns orange and reads `keys here · 1–3 switch tabs · ↓ pgdn end scroll · tab + enter · esc back to the prompt` (with `· w keep warm` or `· s stop` before the last part when they apply). `Ctrl+X Tab` moves the focus through the band, then each open pane, then back to the prompt (keybindings › `abovePrompt:focus`), so the old hint `ctrl+x tab, then 1–3` sent digits into the chat when the band or another pane had the focus. Without the keyboard the hint reads `ctrl+x, then tab: keys here (again if another pane lights up)`. In a narrow sidebar (an iPad) the footer reads `ctrl+x tab: keys`. The header repeats the hint (`ctrl+x, tab: keys here`, orange `keys here · ↓ scroll · esc` with the keys), because a tab taller than the pane cuts the footer off; the footer names the scroll keys.
- README: the usage table has rows for the keyboard (incl. scrolling a tall tab) and the mouse (fullscreen only: click, wheel, hover); *Where it shows* and the FAQ say both.

### Docs
- README: new screenshots of the 0.9 state (`assets/screenshots/v0.9/`; the café and the new hints are not in them yet) – the full terminal with the docked dashboard, crops of Overview, Context and Health, the band; a section on the café; FAQ on turning animations off. PRIVACY, SECURITY, AGENTS, CONTRIBUTING, llms.txt and how-it-works describe the animation file.

## [0.9.0] – 2026-10-12

Alive: the band moves when it matters, and a budget keeps a session in check.

### Added
- **Last stretch:** in the last 17 % of the TTL the band redraws every second – the dot pulses, the last minute counts in seconds. The one-second timer runs only then.
- **Keepwarm heartbeat:** after each ping the band shows `· ping ok · <tokens> read` and a bold `↻` for five seconds.
- **Request details on hover** (fullscreen renderer): point at a column of the request chart for its time, tokens, hit rate, writes and output.
- **Live during a turn:** context, cost and plan limits refresh after every main request (the plain `$.session.usage()`, which costs nothing), not only when the turn ends – no more `–` or `$0.00` during a long first answer, and the session budget warns while an expensive turn still runs. The auto-compact forecast still counts prompts.
- **Session budget** (option `sessionBudget`, dollars, off by default): the band shows `of $X`, yellow from 80 %, red from 100 %, with a toast at each; the Health tab shows the share.
- **After a relaunch:** `/tui` and `claude --resume` restart Claude Code with the conversation but not Cache Meter's in-memory history. The pane now says `No request since <time>` and counts `N requests since <time>` instead of a bare `No request measured yet` beside the session's cost.
- **Keeping up with Claude Code:** a weekly workflow runs the tests on the newest Claude Code and compares the official pages the mod relies on with stored content hashes (`.github/scripts/upstream-docs.sh`, `docs/upstream-docs.txt`); a change opens an issue. CONTRIBUTING lists every official page and what it settles here.

### Changed
- The line under an answer and the budget toasts appear only in interactive sessions – none under `-p` or the SDK, where nothing is drawn.
- Health: after a resume or relaunch without Claude Code's verdict on the cache, Cache check says `Resumed <time> – Claude Code gave no verdict …` instead of `No model switch or resume yet`.
- Health: with no request measured, Warm miss reads `no request measured yet` (dim) instead of a green `none`.

### Docs
- README: "Three tabs … and a report to take along" – the table's fourth row is `/tokens report`, not a tab.
- README FAQ: why the chart starts empty after `/tui` or a resume, and what to do when a click on a tab selects text instead (fullscreen, touch or trackpad).
- README: how to update (`claude plugin update cache-meter@cache-meter`, or auto-update for the marketplace).

## [0.8.0] – 2026-10-12

Context under control: what fills the conversation, when it compacts, and a report to share.

### Added
- **What the conversation holds** (Context tab): the main conversation's tool results since the start or the last compact, by tool and the five largest – labelled with the file path or a Bash command's program name, sized as an estimate (characters ÷ 4) beside Claude Code's own total for all messages.
- **Auto-compact forecast** (Overview): how many prompts until auto-compact at the pace since the last compaction.
- **`/tokens report`**: the session as Markdown on the clipboard – cost, cache, warm misses with their cause, context, heaviest files, servers and tool results, subagents, plan limits.

### Changed
- Privacy: Cache Meter now reads the name, a short label and the result length of each tool call (not the result's text, not a command's arguments). README, PRIVACY.md and SECURITY.md say so.
- Privacy hardening of the labels: a Bash command shows only a word that looks like a program name (a pattern check, credential-like names excluded), split at shell whitespace; file labels only for the file tools (Read, Write, Edit, MultiEdit, NotebookEdit), never a URL, with query and fragment cut; token-like path parts appear as `…`; labels are one line of at most 80 characters.
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

[0.12.2]: https://github.com/florian101010/cache-meter/compare/cache-meter--v0.12.1...cache-meter--v0.12.2
[0.12.1]: https://github.com/florian101010/cache-meter/compare/cache-meter--v0.12.0...cache-meter--v0.12.1
[0.12.0]: https://github.com/florian101010/cache-meter/compare/c369531...cache-meter--v0.12.0
[0.11.0]: https://github.com/florian101010/cache-meter/compare/5c80825...ddd6407
[0.10.0]: https://github.com/florian101010/cache-meter/compare/edf5849...c88d13f
[0.9.0]: https://github.com/florian101010/cache-meter/compare/e830ded...edf5849
[0.8.0]: https://github.com/florian101010/cache-meter/compare/899ec58...e830ded
[0.7.0]: https://github.com/florian101010/cache-meter/compare/b0b9980...899ec58
[0.6.0]: https://github.com/florian101010/cache-meter/compare/92aef39...b0b9980
[0.5.4]: https://github.com/florian101010/cache-meter/compare/9175da5...92aef39
[0.5.3]: https://github.com/florian101010/cache-meter/compare/bc581d0...9175da5
[0.5.2]: https://github.com/florian101010/cache-meter/compare/cache-meter--v0.5.1...bc581d0
[0.5.1]: https://github.com/florian101010/cache-meter/compare/cache-meter--v0.5.0...cache-meter--v0.5.1
[0.5.0]: https://github.com/florian101010/cache-meter/compare/a520960...cache-meter--v0.5.0
[0.4.0]: https://github.com/florian101010/cache-meter/compare/18e9711...a520960
[0.3.0]: https://github.com/florian101010/cache-meter/compare/e430ab2...18e9711
[0.2.1]: https://github.com/florian101010/cache-meter/pull/3
[0.2.0]: https://github.com/florian101010/cache-meter/pull/1
[0.1.1]: https://github.com/florian101010/cache-meter/commit/3217bf4
[0.1.0]: https://github.com/florian101010/cache-meter/commit/b436f27
