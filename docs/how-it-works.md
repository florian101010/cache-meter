# How Cache Meter works

This page describes the design of the mod for people who want to change it or check what it does. Every statement about the Claude Code mods API refers to the official documentation – <https://code.claude.com/docs/en/plugins/mods/overview> and its pages – or to the type declarations Claude Code writes for the running version (`.claude-plugin/types/claude-code/index.d.ts`). References such as *interface › Pick where to draw* name a page and a section of that documentation. Where something is not documented, it says so.

## Contents

- [Overview](#overview): [Events and calls](#events-and-calls) · [State](#state)
- [The cache](#the-cache): [Countdown and TTL](#countdown-and-ttl) · [How the TTL is derived](#how-the-ttl-is-derived) · [Hit rate](#hit-rate) · [Cold rewrites](#cold-rewrites) · [Last stretch, heartbeat, hover](#last-stretch-heartbeat-hover) · [Live during a turn](#live-during-a-turn)
- [Keeping it warm](#keeping-it-warm): [`/keepwarm`](#keepwarm) · [`/keepwarm auto`](#keepwarm-auto)
- [The band](#the-band): [Band layout](#band-layout)
- [The pane](#the-pane): [Pane layout](#pane-layout) · [Where the pane sits](#where-the-pane-sits) · [What caching saved](#what-caching-saved) · [Context tab](#context-tab) · [What the conversation holds](#what-the-conversation-holds) · [MCP calls and idle servers](#mcp-calls-and-idle-servers) · [Auto-compact forecast](#auto-compact-forecast) · [Health tab](#health-tab) · [Limit forecast](#limit-forecast) · [`/tokens report`](#tokens-report) · [Animations: the café, the minute flash and the short ones](#animations-the-café-the-minute-flash-and-the-short-ones)
- [Notices](#notices): [Words when they matter](#words-when-they-matter) · [Session budget](#session-budget)
- [Quality](#quality): [Tests](#tests) · [Assumptions and limitations](#assumptions-and-limitations)

## Overview

### Events and calls

| Hook | Used for | Source |
|---|---|---|
| `session.start` | reads the TTL controls and a first measurement, starts the 15 s timer (interactive sessions only), registers `/tokens`, `/keepwarm` and `/keepwarm-auto` (each with an `argumentHint`: after `/keepwarm ` the prompt shows `[2h | 30m | auto | off]`; `/keepwarm-auto` is a row of its own in the typeahead); each registered on its own (written out, so `claude plugin validate` names `tokens` and `keepwarm-auto` as answering their own command – measured with 2.1.296, not documented; `keepwarm` shows as a gating hook since it can pass a run on), so one that Claude Code refuses – a built-in's name (api › Add a command), or a name another plugin registered first (measured: "refused: the plugin … registered it already") – fails only that one, with a debug-log line | *reference › Session*, *overview › Where mods run* |
| `classic.SessionStart` with `source` `clear`, `resume`, `fork` | `/clear`, `/resume` and `/branch` reset all `$.state` and do not fire `session.start` again, so the same set-up runs here; on resume/fork the countdown continues from `seconds_since_last_response` | *interface › Load a saved value again after /clear*; types: `SessionStartHookInput` |
| `turn.step` (async generator) | the four token counts of each model request; main conversation vs. subagent via `e.agentId`. Before a main request: `e.model` and `e.effort` against the last main request – a change that splits a warm cache (≥ 10k tokens) gets a toast. `/effort` and `/fast` fire no `config.set` and have no `/config` row (measured with 2.1.296: the rows are `model`, `thinking`, `switchModelsOnFlag`), so this is the earliest point; `/model` is caught at `PreModelSwitch`. Per subagent: summed under its id, named once from `$.agent.list()` (type and description) | *events › Follow a turn*; types: `TurnStepInput.model`/`effort`, `TurnStepResult.usage`, `AgentInfo`; prompt-caching › *Changing effort level* (5.5 models and Fable 5.1 keep the cache) |
| `turn.start` | the session cost (`$.session.usage().cost.usd`) when a turn starts, keyed by `turnId` | *events › Follow a turn*; types: `SessionCost` (sums every priced response, subagents included) |
| `turn.complete` | resets the count of running main requests, also after an abort (`isAborted`); for a main turn that sent a request and was not aborted, returns `{ text }` – the line under the answer: cost since `turn.start`, requests counted in `turn.step` by `turnId`, `e.usage` totals. Option `turnLine` | *reference › Turns* (“`{ text }` to show a line under the answer”); types: `TurnCompleteResult` |
| `tool.call` (every tool) | after `await next(e)`, unless denied: an MCP call (`mcp__…`) is counted by wire name; for the main conversation (no `agentId`) the result's size is estimated as characters ÷ 4 of core's `text` ("the result as the model reads it") and summed under the tool and a label from `toolLabel` (file path, `~`-shortened; Bash: first word that is not `VAR=value`, last path segment). No `text` (another mod's own answer): not counted. Returns the result unchanged; a single large result raises a toast (*One large tool result* below) | types: `ToolCallResult.text`, `AgentLoop.agentId`; *events › Guard or change a tool call* |
| `classic.PreModelSwitch` | while `prompt_cache_warm` and switching to another model with ≥ 10k context: a toast with `context_tokens`, `estimated_cache_write_usd` and the countdown; returns `next(e)`, never a decision – `ask` is a refusal on `/config` and `set_model`, and the event's `command` source includes the `/config` Model row | hooks › *PreModelSwitch decision control*; prompt-caching › *Switching models* (Claude Code confirms by itself while the cache is warm) |
| `session.measure` | context fill, plan limits, cost after each turn; then `checkLimits` (plan-limit warning) | *reference › Session*; types: `SessionMeasureInput` |
| `session.compact` | a real compaction (not `precompute`, not a subagent) empties the cache | types: `SessionCompactInput` |
| `classic.PostModelSwitch` | a real switch (not `source: 'resume'`, not to the same model) leaves the cache cold; carries `cache_ttl` and `estimated_cache_write_usd` | types: `PostModelSwitchHookInput` |
| `ui.render` `AbovePrompt` | the band; puts `await next(e)` below its own row so other mods' content stays | *interface › Pick where to draw › Band above the prompt* |
| `ui.render` `Pane` (`requestId: 'cache-meter'`) | the `/tokens` pane; sized by `e.props.bodyColumns` and `e.props.scroll.bodyRows` | *reference › Render sites* |
| `command.run` `tokens`, `keepwarm`, `keepwarm-auto` | the three commands (with `keepwarm` `off` not registered at start; then another plugin's `/keepwarm` goes straight on to it, `next(e)`, and this one's – still registered after a switch mid-session – answer how to switch keepwarm on); keepwarm starts only on the person's own command (`origin.kind` `composer` or `bridge`, types: `PromptOrigin`) – stopping is open to anyone. Mod commands share one name, and only the first mod in the hook chain answers (*events › The order mods run in*). A name another plugin registered first is refused for this one – measured with 2.1.296; the types' "registering a name again replaces it" holds within one plugin – so `$.command.list()` is read once, before the registration, and names that plugin (`CommandInfo.plugin`, cut at `@`). The person then gets one toast; `/keepwarm` words this one doesn't know and `off` go on to it (`next(e)`, the list read again first), and if nobody answers there – Claude Code's developer line, or a rejection – the usage instead; `/keepwarm-auto off` is the stop that always reaches this mod | *api › Add a command*; types: `CommandInfo` |
| `classic.StopFailure` | an API error ends a turn: counted for the Health tab (main conversation and subagents) | types: `StopFailureHookInput` |
| `prompt.submit` | notes that you sent a prompt (not its text) – the pane above the prompt closes then; with `/keepwarm auto` on, an own prompt (`composer`) ends the break and repeats what auto did meanwhile | *events › Rewrite or add to a prompt* |
| `ui.close` | notes that you closed the pane (it does not reopen by itself) and redraws the band, which takes its Compact button back | types: `UiCloseInput` |
| `config.set` | passes every change on unchanged (`return next(e)`, the form the directory reads as leaving the event alone). For its own option `keepwarm` it schedules `applyKeepwarmOption` one second later, which reads the row's value from `$.config.list()` – the types don't say when the writer runs relative to the hook's return, and a refused change keeps the old value: on registers `/keepwarm` and `/keepwarm-auto`, off stops a running keepwarm (a toast says so) and redraws; other rows pass untouched. The row's owner is `e.provider` (types: pinned; cut at `@`), else the key's `<plugin>.` part. Whether a `/config` change also reloads the module is not documented and not measured – with a reload, `register` and `session.start` run again with the new value and end in the same place | *reference › Commands and configuration*; types: `ConfigSetInput`, `ConfigSetResult` |
| `command.describe` | with `keepwarm` `off`: its own `keepwarm` and `keepwarm-auto` answer `isHidden: true` (provider = this plugin) – out of the typeahead and `/help`, still run when typed in full; another plugin's `/keepwarm` is left as it is. `$.ui.invalidate('command.describe')` at a switch; the cached answers go at the next turn (types: `$.ui.invalidate`). There is no way to unregister a command (types: `$.command` has `list`, `run`, `register`) | types: `CommandDescribeInput` |
| `session.end` with `reason: 'clear'` | puts together the ended conversation's figures for a toast in the next one (see *After /clear* below) | *reference › Session*; types: `SessionEndInput` |

Calls (as `claude plugin validate` lists them): `$.agent.list`, `$.clock.after`, `$.clock.every`, `$.clock.now`, `$.command.list` (whether another plugin has `/keepwarm`), `$.config.list` (the option `keepwarm` after a change), `$.command.register`, `$.env.get` (three literal names), `$.model.fork`, `$.ui.log` (reasons of failures – a failed animation, a notification not sent, the `/clear` summary – to the debug log), `$.session.surfaces` (whether a terminal draws: the `/tui fullscreen` tip), `$.session.compact`, `$.session.turns`, `$.session.usage`, `$.settings.read`, `$.state` (through `atom`/`read`/`update`), `$.ui.close`, `$.ui.copy`, `$.ui.invalidate`, `$.ui.notify`, `$.ui.open`, `$.ui.panes`, `$.ui.resolve`, `$.ui.toast`. No `$.fs`, `$.store`, `$.http` or `$.process`.

### State

All drawn values live in `$.state`, declared in `types/index.d.ts` (*interface › Keep a value in $.state*). No module imports that file: `hooks/state.ts` derives the value types from `PluginState`, because Anthropic's directory reads a file a module imports as code it could load, where `declare` is not allowed. They survive a reload of the module and are reset by `/clear`, `/resume` and `/branch`, and gone after a relaunch – `/tui` relaunches Claude Code with the conversation intact (*fullscreen › Enable fullscreen rendering*). When the transcript already holds prompts but no request is recorded (`$.session.turns()` > 0 at that point), the pane says `No request since <time>` and counts requests from there, so an empty chart is not mistaken for an idle session.

| Key | Holds |
|---|---|
| `cache` | `lastAt` (start of the last request that touched the main cache; `0` = known cold), hit rate, context tokens, Claude Code's re-write estimate, why it is cold (`model`/`resume`) and the reported idle time |
| `steps` | the last 80 main-conversation requests (start time, four token counts, model) |
| `totals` | sums for main conversation and subagents, number of cold rewrites and tokens re-written |
| `agents` | per subagent id: four token counts, requests, label (type and task), last model |
| `toolResults` | per tool: count and estimated tokens; the five largest single results (label, tokens, time); when the last compaction reset it |
| `coldWrites` | the last 20 cold rewrites (time, tokens, cause `pause`/`model`/`resume`, idle time) |
| `measure` | context fill and tokens, window, auto-compact point (and whether it is off), the last 12 context sizes, plan limits, cost, start time, prompts, and per plan limit the first reading of its window (`limitStart`) |
| `health` | unusual stops, API errors (main and subagents), server-side tool calls, MCP calls by tool (`toolCalls`), warm misses with pause and cause (`unexpected`), the expiry notice's count and last reason (`notice`), Claude Code's cache verdicts (`checks`) |
| `contextMap` | the heaviest context items for the Context tab: memory files (paths `~`-shortened), MCP servers with their tools, skills, agents |
| `reportedTtl` | `cache_ttl` from the last model switch |
| `ttlConfig` | the TTL controls read at start (three environment variables, the `promptCacheTtl` setting) |
| `keepWarm` | end of the window, pings and tokens read in this run, last ping; for `/keepwarm auto` the break length (`auto`) and the pings of the current break (`pausePings`) – state from before 0.12 lacks the two and is read as off |

Module variables hold what may be lost on a reload: the options, whether the session is interactive, whether a ping is in flight, how many main requests are running, the turns in flight (`openTurns`), the last main request's model and effort (`lastMain`), the cache window an expiry notice went out for (`notifiedFor`), the prompt count a session (re)started at (`promptBase`), the plan-limit windows already warned about (`warnedLimits`, by kind and reset time), the session-budget level reached (`budgetWarned`), the last large-tool-result toast (`lastHogAt`), the ended conversation's figures for the `/clear` summary (`convo`, `convoUsdBase`, `convoFrom`, `pendingSummary`), another plugin's `/keepwarm` (`otherKeepwarm`, `isOtherKeepwarmNoted`), whether `/keepwarm auto` is on (`autoMs`, its break length) and what it last said while you were away (`autoNote`). A reload runs `session.start` again (*reference › Session*), so losing them is harmless. Unlike `$.state`, they are not reset by `/clear`, `/resume` or `/branch` – on purpose: a warning is not repeated for the same window, and the summary still has its figures.

## The cache

### Countdown and TTL

The countdown is `lastAt + TTL − now`, redrawn every 15 seconds. `lastAt` is the start of the last main request: the documentation says the cache stays warm for one TTL "after Claude Code last sent a request … or Claude last responded" (*prompt caching › Switching models*); counting from the request's start is the conservative choice. Every hit resets the timer (*prompt caching › Cache lifetime*).

The TTL is derived (see [How the TTL is derived](#how-the-ttl-is-derived)), because no mod event carries it per request. The order after the mod's own option is Claude Code's own (*prompt caching › Choose the TTL yourself*); the plan-limit rule mirrors "Once you go over your plan's usage limit … Claude Code drops the main conversation to the five-minute TTL" (*prompt caching › Which TTL each request gets*).

#### How the TTL is derived

With the option `cacheTtl` set to `auto`, the TTL is derived in this order, following [prompt caching › choose the TTL yourself](https://code.claude.com/docs/en/prompt-caching#choose-the-ttl-yourself):

1. the mod's own option `60m` / `5m`
2. `FORCE_PROMPT_CACHING_5M=1` → 5m
3. `CLAUDE_CODE_PROMPT_CACHE_TTL` (`5m` / `1h`)
4. the `promptCacheTtl` setting (`5m` / `1h`)
5. `ENABLE_PROMPT_CACHING_1H=1` → 1h
6. a plan limit at 100 % or more → 5m – an assumption: Claude Code drops to 5m once it draws usage credits beyond the limit (*prompt caching › Which TTL each request gets*), which a mod cannot see; the limit stands in for it
7. the value Claude Code reported on the last model switch
8. otherwise 60m (subscription within plan usage)

### Hit rate

`read ÷ (input + read + write)` of a single request, from `TurnStepResult.usage`, as a whole percent. The session hit rate uses the same formula over the main-conversation totals.

### Cold rewrites

A main request counts as a cold rewrite when all of these hold:

1. at its start, the cache was expired by the clock (or known cold after a model switch or a resume that Claude Code reported as `prompt_cache_likely_expired`),
2. it wrote at least 10,000 tokens to the cache, and
3. it wrote more than it read – so a wrong TTL assumption cannot turn a warm request into a "cold" one.

The first request of a new session and the first after `/compact` or `/clear` find no cache at all and are not counted. The pane shows the last three with their cause; the totals cover the whole session. After a cold rewrite caused by a pause in this session, a toast suggests `/keepwarm` (10 s), unless keepwarm is already running or the session is not interactive.

### Last stretch, heartbeat, hover

**Redraws.** The 15-second tick redraws the band and pane. While the cache is in its last stretch (17 % of the TTL) or a keepwarm heartbeat shows, a second timer (`$.clock.every(1000)`) redraws once a second and cancels itself when neither holds – far below the terminal's limit of 30 redraws a second (*reference › Limits*). In that stretch the band's dot alternates between normal and dim each second; under a minute the label counts seconds.

**Heartbeat.** After a ping that read the cache, the band shows `· ping ok · <tokens> read` and a bold `↻` for five seconds.

**Hover.** The request chart is one `Raster` per request (two cells wide), each inside its own keyed `Box` in the flow with `hover: { scope }` – a keyed Box is a hover scope "while the pointer is anywhere over it" (types: `BoxProps.key`); an absolutely placed trigger would not work, because "the pointer on it is on its parent" (types: `BoxProps.position`). A hidden row per request (`display: "none"`, `hover: { scope, display: "flex" }`) lies over the time row and is revealed while the pointer is on its column. The surface does this itself – no hook runs. The terminal reports the pointer only in the fullscreen renderer, and the test kit cannot press a hover, so this one is checked by hand.

### Live during a turn

`session.measure` fires after each turn (*reference › Session*), so a long first turn used to show no context fill and no cost. After every main request `turn.step` now reads the plain `$.session.usage()` – "the plain call costs nothing" (types: `$.session.usage`) – and updates `measure`'s fill, tokens, cost, plan limits and their window starts, then checks the session budget. An empty limit list ("empty when none has a reading", types) keeps the last limits and window starts instead of wiping them. The context history, the prompt count and the auto-compact point stay per turn, from `session.measure`, so the auto-compact forecast keeps counting prompts. Whether Claude Code has already added the newest response's cost at that moment is not documented; at the latest the next request or the end of the turn brings it.

## Keeping it warm

### `/keepwarm`

Every 15 seconds (interactive sessions only) the timer checks, in this order:

1. no window, a ping in flight, or a main request running → nothing to do;
2. window over or 12 pings reached (with auto: in this break) → stop with a toast; auto stays on and waits for the next answer;
3. TTL below one hour → stop (a ping every few minutes is not worth it) – auto too;
4. cache empty or expired → stop (auto: quietly, it waits for the next answer);
5. more than 17 % of the TTL left → wait;
6. otherwise ping: `$.model.fork({ prompt: 'Reply with the single word: warm' })`.

A fork is "the main thread's last request again … with `prompt` after it: every tool denied, its own tail never cached" (types: `$.model.fork`). After the ping, the mod stops warming when the fork read nothing, read less than half of the known context, or wrote 10 % or more of what it read (a partial miss) – in each case the TTL assumption was wrong and further pings would be full re-writes. Otherwise `lastAt` moves to the ping's start. A miss, an unanswered ping, or a fork that is refused before it is sent (it rejects – api › Call a model) is a hard stop (`hardStop`): auto goes off too. The toast of a hard stop or of a break that outlasted auto fades while the person is away, so it is shown again at the next own prompt (`autoNote`).

#### `/keepwarm auto`

`/keepwarm auto` (`/keepwarm auto [10m … 8h]`, or `/keepwarm-auto`, a command of its own so the typeahead lists it beside `/keepwarm`) keeps `auto` (the break length) in the keepwarm state and in a module variable. `rearmAuto` sets the window to *now + break* and the break's ping count to 0 on every own prompt (`prompt.submit`, `origin.kind` `composer`) and every finished main request – never for a request while a ping is in flight (`isPinging`) – an own prompt always counts: whether the engine reports a fork as a main-thread `turn.step` is not documented, and a ping that moved the window would never let it close (a test makes the fork run a main request and checks that). While you work no ping is due – each request refreshes `lastAt` – so pings only happen after a while away. `/clear`, `/resume` and `/branch` reset `$.state`; the `classic.SessionStart` hook restores auto from the module variable, with no window until the next answer. A reload takes it from `$.state`. `pings` and `readTokens` count the whole auto run, `pausePings` the cap per break.

Why a ping keeps the one-hour entry alive: a cache read lasts the "same duration as the preceding write" ([pricing › prompt caching](https://platform.claude.com/docs/en/about-claude/pricing)), and the main conversation's prefix was written with the one-hour TTL. Forks get the five-minute TTL only for what they write (*prompt caching › Which TTL each request gets*), and a keepwarm fork writes nothing of its own ("its own tail never cached"). Costs per model: README, *Keep the cache warm with /keepwarm*.

The count of running main requests is raised before the first `await` in `turn.step` and lowered in its `finally`; `turn.complete` resets it, because the documentation does not say whether an aborted stream reaches `finally`.

## The band

### Band layout

The band is one row sized to `e.props.bodyColumns`. The width of every segment is computed first; on a narrow terminal it drops, in order: the ping heartbeat (`· ping ok · … read`) and the `cold: good time to` note – each shown only when cost and the auto-compact point fit beside it – then the cost segment (`API value $X` on a subscription, `spent $X` otherwise, hidden at $0), the re-write hint, the auto-compact note, then the bar (minimum six cells). The `[ Keep warm ]` button goes before all of them: it shows only in the last stretch of a warm cache (`PING_SHARE` of the TTL left) with keepwarm and auto off, the option `keepwarm` on, an interactive session and a one-hour TTL, and only where `[ Compact ]` may show; a press calls `pressKeepWarm($, 2h)`, the pane button's path. It has no `hotkey`: a digit one on a band button also fires when the person types that digit alone into an empty prompt and pauses (*reference › Elements*), and a press spends quota. The `[ Compact ]` button is hidden while `e.props.isWorking` and while the `/tokens` pane is placed (`$.ui.panes()`), so the first Ctrl+X Tab reaches the pane; opening and closing the pane redraws the band. The weather symbols are single-width characters, not emoji, so the row lines up in every terminal font.

## The pane

### Pane layout

`/tokens` opens the pane with a requested height of 26 rows from 114 terminal columns, 36 below (`PaneOpenArgs.rows`; ignored when docked). The layout follows `e.props.bodyColumns` in three tiers, measured on 2.1.296 (a docked pane gets about 84 columns beside a 190-column terminal and about 48 beside a 120-column one):

| Body columns | Layout |
|---|---|
| < 64 | one column; drops the header subtitle, session hit rate, TTL source, trend and long hints |
| 64–109 | one column, everything |
| ≥ 110 | two columns (cache + keepwarm left, context + session right), requests full width below; the subtitle shows |

Every single-line text truncates (`wrap="truncate-end"`) instead of wrapping – the official mods do the same, and a wrapped line had garbled an earlier version.

Cards: **cache** (tall digits, state, expiry time, hit rates, TTL source; a countdown meter with a `┃` at the point where keepwarm pings, `PING_SHARE` of the TTL; what expiry would cost), **keepwarm** (buttons with hotkeys `w`/`s`), **context** (a meter with a `┃` at the auto-compact point, trend sparkline from three turns on), **session** (what caching saved, totals, cost, cold rewrites, plan limits) and **requests** (a column chart, below).

Meters are runs of `█`, a partial block to an eighth of a cell, and a `░` track: a `Raster` of colored cells in the terminal and the same runs as colored text elsewhere, because only the terminal draws `Raster` (*reference › Elements*). The fill is one solid color, not a gradient: the terminal rounds Raster colors to a smaller palette (*gallery › Raster*), and a per-cell gradient showed as bands. Hotkeys act only while the pane has focus (*interface › Keyboard focus and hotkeys*).

**Request chart:** one two-cell column per main request, newest at the right, up to half the card's width (the last 80 requests are kept). Its height is the share of the request's input *not* read from the cache, `(new + written) ÷ (new + read + written)`, to an eighth of a cell; any share above zero shows at least an eighth. Its color is the request's hit rate (green ≥ 80 %, yellow ≥ 50 %, red below). Normal turns are a low green line; a cold re-write is a tall red column. The Desktop app lists the last four requests as text instead.

#### Where the pane sits

**Opening by itself (`autoSidebar: auto`).** `session.start` does not say whether the session is fullscreen; the band's `ui.render` does (`e.viewport.isFullscreen`). Two seconds after start and on every tick after, Cache Meter opens the pane once per load if the band was drawn fullscreen, nobody closed the pane yet (`ui.close` with `origin.kind` `person`, or `/tokens` closing it) and it is not open. An unasked pane is placed from 144 terminal columns, 110 once the person opened it before, and waits undrawn below that (types: `UiOpenResult`). Above the prompt it never opens by itself.

**Tab names while typing.** The command's `argumentHint` (`[overview | context | health | report]`) shows once a space follows `/tokens`. An earlier version also added typeahead rows with a `prompt.autocomplete` hook; the directory's validation does not know that event yet, so 0.5.2 removed it. 

The surface seats the pane, not the mod (*interface › Pick where to draw*): docked as a sidebar beside the transcript in the fullscreen renderer from 110 columns, otherwise inline above the prompt. The mod reads where it was seated (`Pane.placement`) and acts on it: inline, your next own prompt (`prompt.submit` with `origin.kind` `composer`) closes the pane, since the band already carries the summary; docked, it stays. `/tokens` toggles. `closeOnEscape` (Esc at an empty prompt closes the pane) is set only when the pane will sit above the prompt: `command.run`'s `presentation` says whether the session is fullscreen and how wide the terminal is, and from 110 columns in fullscreen the pane docks – there Esc only hands the keys back. Above the prompt in a terminal (`$.session.surfaces()` holds `terminal`; `/tui` is the terminal's), the reply and a dim line on the Overview say how it gets beside the chat (`dockTip`): on the main screen `/tui fullscreen` – which saves the `tui` setting and relaunches with the conversation intact (*fullscreen › Enable fullscreen rendering*), so the mod's in-memory figures start over – in fullscreen a window of 110 columns or more. The line has three lengths (sentence in the reply, one line from 108 body columns, a short one below) and is left out docked, on other surfaces and where `viewport.isFullscreen` is unknown. Keys reach the pane only while it has focus: ctrl+x then Tab, or a click – clicks only in the fullscreen renderer, which captures the mouse (*interface › Keyboard focus and hotkeys*; *fullscreen › Use the mouse*). `/tokens <tab>` switches tabs without focus; the footer names it and offers clicking only when `e.viewport.isFullscreen`. No `focus` on open: a focused pane takes the keys, and its hotkeys would swallow typing.

### What caching saved

`cache saved X % of input cost` compares the input tokens of the main conversation at the base input price with what they cost through the cache:

```text
saved = 1 − (new + read × r + written × w) ÷ (new + read + written)
```

`r` is the cache-read multiplier of the last request's model, `w` the cache-write multiplier of the current TTL (2× for one hour, 1.25× for five minutes) – both from the official pricing page, see [CONTRIBUTING › Prices](../CONTRIBUTING.md#prices). Output tokens are not part of it. A negative value (`cache cost +X %`) means more was written than reading saved, e.g. right after a cold re-write. Assumption: the whole session used the last request's model and the current TTL.

### Context tab

After each turn the `session.measure` hook reads `$.session.usage({ breakdown: 'summary' })` – Claude Code's local estimate, which sends no request (types: `SessionUsageArgs`) – and keeps the heaviest items of `context.breakdown` (types: `SessionContextBreakdown`): categories of kind `used`, memory files, loaded MCP tools summed per `serverName` (tools with `isLoaded: false` sit behind tool search and are only counted), agents, and `skills.includedSkills` of `totalSkills`. **Count exactly** calls `breakdown: 'full'`, which sends one token-count request per tool and memory file as `/context` does – only on a press, never on a timer. The card says which one it shows (`estimate` or `exact`) and when. `ContextCategory.color` (a theme key, types: `ContextCategory`) is not used: the pane colours by its own scale, the same in every tab.

#### What the conversation holds

The Context tab lists the main conversation's tool results since the start or the last compaction (a real `session.compact` resets the tally, because the summary replaces them): by tool, and the five largest single results. The figure is an estimate – characters ÷ 4 of the text the model reads, which is no documented rule – drawn beside Claude Code's own estimate of all messages (the breakdown's `Messages` category), so a tally far above it shows the estimate is off. Images in results are not counted.

#### MCP calls and idle servers

The Context tab lists each loaded MCP server's tools with the calls this session made to any of them (`tool.call` above, matched by the wire names in the context breakdown, `ContextMcpTool.name`). After three prompts a server with no call reads *unused so far* – counted from the start, `/clear`, `/resume` or `/branch`: `$.state` (and with it the call count) resets there, `$.session.turns()` does not, so the prompts are counted from a baseline taken at that moment. Servers behind tool search are not listed: their tools are not in the cached prefix (prompt-caching › *Connecting or removing an MCP server*).

#### Auto-compact forecast

From `measure.history` (the context size after each turn, last 12): the run since the last drop (a compaction), at least three readings; pace = rise per turn over that run; prompts left = (auto-compact point − current size) ÷ pace, rounded up. The auto-compact point is the breakdown's `autoCompactThreshold` as a share of the window. No forecast when auto-compact is off or unknown, or the context does not grow. It is a straight line: a burst of large tool results makes it early, short exchanges late.

### Health tab

| Row | Source |
|---|---|
| Age, prompts | `$.session.usage().startedAt` (`/clear` starts it over), `$.session.turns()`, read in `session.measure` |
| Cost, $/h, $/prompt | `cost.usd` (as `/cost`) over age and prompts; labelled *API value* when plan limits are reported (a subscription: `rateLimits` is empty off one, types `SessionMeasureInput`), *spent* otherwise |
| Stops | `turn.step` result `stopReason` of main requests; `end_turn`, `tool_use` and none are normal, the rest is counted (types: `TurnStopReason`) |
| Errors | settings hook event `StopFailure` (`classic.StopFailure`, observed with `next(e)`), its `error`; `agent_id` set = subagent, counted apart |
| Server | `turn.step` result `serverToolUses` (v2.1.290+): tool calls the API ran itself, such as the advisor; no `tool.call` fires for them. Duration = `endedAt − startedAt`, `–` without `endedAt` |
| Warm miss | a main request warm by the countdown (cache seen, not expired) that wrote ≥ 10k tokens and read less than it wrote: model, effort, fast mode or the tool definitions changed (prompt-caching › *Actions that invalidate the cache*; editing CLAUDE.md mid-session keeps the cache, › *Actions that keep the cache*), or the real TTL is shorter than the one assumed. The pause before the last one is shown to tell the two apart; the prompt sections are not compared |
| Warm-miss cause | in this order: the model or an effort that splits the cache changed since the last main request; the pause was ≥ 5 min while a longer TTL was assumed; the loaded MCP tools differ (a fresh `breakdown: 'summary'` estimate – no request – against the last one), only when no tool is behind tool search, because loading a deferred tool keeps the prefix (prompt-caching › *Connecting or removing an MCP server*) and only when both maps carry tool names; an effort change on a model that keeps the cache only with an API key or a subscription; else the causes a mod cannot observe – fast mode, a code-intelligence plugin's LSP tool, a tool deny rule, removed images (prompt-caching › *Actions that invalidate the cache*). Cause and count are written together |
| Notice | option `expiryNotice`: sent count and the `reason` of the last `{ isSent: false }` (`disabled`, `no-channel`, `no-surface`, `refused`; types: `UiNotifyResult`) or the message of a rejection (a `Notification` hook's deny, a failed write). Sent is not delivered: a terminal does not report back. Fired from the 15 s tick once per cache window (`cache.lastAt`) at 17 % of the TTL left, only interactive, warm, keepwarm off, no request or ping running, TTL one hour, ≥ 10k tokens – `$.ui.notify` sets no rate limit of its own |
| Subagents | top five by tokens: tokens, requests, hit rate and cache saving – writes priced at the five-minute rate, the subagents' default TTL, or the one-hour rate with `ENABLE_PROMPT_CACHING_1H` (prompt-caching › *Subagents and the cache*, › *Choose the TTL yourself*); `subagentPromptCacheTtl` and an agent's own `cacheTtl` are not read. A failed type-and-task lookup is retried at the agent's next request |
| Cache check | `PostModelSwitch.prompt_cache_warm` and, on resume/fork, `SessionStart.prompt_cache_likely_expired` – Claude Code's verdict – against Cache Meter's countdown at that moment, taken before either is acted on; skipped while Cache Meter has seen no request (its state is empty after `/resume`). A resume that carries no verdict (`prompt_cache_likely_expired` is optional) is named with its time instead of reading as *no resume yet* |

### Limit forecast

`session.measure` keeps, per plan limit, its first reading in the current window (`limitStart`: time, percentage, `resetsAt`). A lower percentage or a `resetsAt` that moves by a minute or more (`isSameReset`) starts a new window. From ten minutes after that reading, the overview shows when the limit reaches 100 % at the average pace since then – only if that is before the reset, and not at all when Claude Code gives no reset time. A straight line through two readings: a burst of work makes it early, a pause late.

### `/tokens report`

Handled before the tab names, so it never opens, closes or switches the pane. It gathers what the pane shows into Markdown (`reportMarkdown` in `hooks/lib.ts`) and passes it to `$.ui.copy`. The command's own output is only a confirmation, in fixed words even when the copy fails: Claude reads a command's text (mods › api › Add a command). `isCopied: true` is not proof – an OSC 52 write does not report back (types: `UiCopyResult`) – so the confirmation asks to paste and check.

### Animations: the café, the minute flash and the short ones

Option `animations` (default `on`). All of them live in the Overview only; none in the band.

**The café** is a `Client` (interface › *Build a tree from elements*): `hooks/cafe.tsx`, a surface module the engine reads off the `module: './cafe.tsx'` literal of `h('Client', …)` (written that way, not as a computed element, so Anthropic's directory can read which file loads there) – it is not a hooks module and is not listed in `hooks.json`. It runs on the drawing side with its own frame clock (`surface.every`, 250 ms, started once while its state is still undefined) and gets no mods API; the pane hands it one word as props, from `cafeState` in `lib.ts`: `ping` while a keepwarm heartbeat shows, `brewing` for 12 s after a request wrote a fresh cache, `working` while a turn is open, then `cold`, `empty`, `last` or `warm` from the countdown. A new word reaches the running instance with its state kept (`ClientProps.props`). It is drawn only when the pane is docked (`placement: 'dock'`), where the outer Box takes the room's height (`minHeight` = `scroll.bodyRows`) and the café grows into what the cards leave (`flexGrow: 1`). It reads its own size (`surface.rows`, `surface.columns`): with fewer than 7 rows or 20 columns it draws a single line, so the region never shows half a figure; with no room left it is that one line. A tab switch, closing the pane or `animations: off` removes the Client, which ends its timer. Its redraws are its own region's (`setState`), not the pane hook's; whether they count against the pane's redraw limit is undocumented (reference › *Limits* names only `$.ui.invalidate`). If the file fails to load, draw or run, Claude Code draws a dimmed error line in its place and the rest of the pane as before (*interface › Build a tree from elements*); there is no `ui.fault` hook, an event Anthropic's directory doesn't list yet.

**The minute flash:** when the Overview draws a different minute than it last drew, the digits take the theme's `text` colour for 450 ms, and the shared redraw train below (which also carries the shine) draws them in the state colour again. Not on the first draw, after a reload (the module's memory starts empty), on another tab, or while the last minute counts seconds. The change is noticed where the digits are drawn, so it flashes whatever redraw shows the new minute.

The test kit drives a `Client`'s frame clock and size but does not report what the module draws, so `sceneRows` (pure) and the module function (with stand-in elements) are tested directly; how the scene looks docked is checked by hand.

**The short ones** share one redraw train: `animate(until)` asks for a redraw every 100 ms until the latest end any of them asked for, one `$.clock.after` chain at a time, so overlapping animations never stack timers – at most 10 redraws a second: the general limit, which the terminal raises to 30 for the shown pane (reference › *Limits*). A train without a frame for three frame lengths past its end – a refused timer runs never (types: `$.clock.after`) – is taken as gone, so the next animation starts a new one. Each animation keeps only its start time; the drawing reads its eased progress off the clock (`progress`, `tween` in `lib.ts`). None starts on the first draw, after a reload or after a tab switch, because each compares with the value the Overview last drew (kept only while the Overview is drawn):

| Animation | When | Length |
|---|---|---|
| Shine over the countdown bar | with the minute flash, a lightened cell (and its neighbours, a little less) runs across the bar (`shineCells`) | 600 ms |
| New request column | the newest column's height grows from 0 to its share; only the height, so the hover areas stay | 450 ms |
| Cost and cache saving | count from the figure on screen – mid-count too – to the new one | 600 ms |
| Turning keepwarm arrow | while keepwarm runs: `hooks/spin.tsx`, a `Client` with its own 200 ms frame clock (◜◝◞◟), so hours of keepwarm cost the pane no redraws; without `Client` (or with `animations` off) a still `↻` | while it runs |

The test kit advances the mock clock and reads the drawing in between, so each animation is tested at a midpoint as well as at its end.

## Notices

### Words when they matter

Every one of them states only figures the mod measured; none promises a saving.

- **One large tool result** (`tool.call`, main conversation, interactive): when the result's estimated size (characters ÷ 4, the same estimate as *What the conversation holds*) is at least `max(10k, 2 % of the window)` (`isContextHog`), a toast names the label as the Context tab shows it (`~`-shortened, masked) and the size. Once per call, and at most one such toast per 20 s (`HOG_GAP_MS`).
- **MCP servers** (Context tab): each server's tokens as a share of the context Claude Code measured (`shareOfRequest`) – its tool definitions go out with every request.
- **/compact note** (Context tab): when Claude Code's `Messages` category is at least 20k tokens and a quarter of the context (`compactNote`). The wording follows the docs: `/compact` "free[s] up context by summarizing the conversation so far" (commands) and compacting a large context "is itself a large request" (costs). What the summary keeps is not known before, so no saving is named.
- **Plan limits** (`checkLimits`, after every reading and main request, interactive): when a limit is at least 50 % used and `limitForecast` – the pace since the window started – says it is full before `resetsAt`, one toast per window (`isWarnedWindow`: the same kind and a reset time within a minute – the module list survives `/clear`, which resets `limitStart`, so `/clear` does not warn again), and with `limitNotice` on a `$.ui.notify`; a notification not sent or refused leaves the toast and a line in the debug log. The forecast needs 10 minutes of readings in the window (`FORECAST_MIN_MS`). After a reload in a running session the windows that already qualify are taken silently – `isInteractive` is set first in `session.start` for that.
- **After /clear** (`session.end` with `reason: 'clear'`, then `classic.SessionStart` `clear`): the ended conversation's main requests, share from the cache and cold re-writes come from module variables counted beside `$.state` (so the order in which `/clear` resets things – not documented – does not matter), its cost from `$.session.usage()` minus the cost when the conversation began. After `/resume` or `/branch` it counts from there and says so (*since you resumed it* / *since the branch*); after a reload mid-conversation the requests come from `$.state` and the cost is left out (its start is unknown). Shown once the new conversation starts. A real exit has nowhere to show anything (`session.end` has a 1.5 s budget and no output).

### Session budget

Option `sessionBudget` (dollars, `0` = off) against `cost.usd`, checked after every main request (see *Live during a turn*) and after each turn – the figure `/cost` and the band show: real spend on an API key, API value on a subscription. The band's cost segment reads `of $<budget>` and turns yellow at 80 % and red at 100 %; `session.measure` and every main request raise a toast when a level is first passed (once per level). A load at session start warns from 0; a reload in a running session, and `/clear`, `/resume`, `/branch`, take the level the current cost has reached without a toast – so a reload repeats no warning, and a `/clear` that starts the cost over warns again.

## Quality

### Tests

`claude plugin test` runs `tests/cache-meter.test.tsx` against the engine with stubs for everything Claude Code would answer (*test › Stub what Claude Code would answer*): `mock.clock` for the timer, `mock.env` for the TTL controls, a generator stub for `turn.step` (optionally slow, to keep a request in flight), and a `ui.render` stub below the band. Each safeguard – band composition, miss and partial-miss stops, no timer without a screen, no ping during a request, reset after an aborted turn, the cold-rewrite rule, the resume label – was checked by breaking it on purpose and seeing its test fail.

### Assumptions and limitations

| Topic | Status |
|---|---|
| TTL | derived, not measured: no mod interface reports it per request. The pane shows the rule that produced it. Check with `/usage` → *Prompt cache (main)* |
| Does a `/keepwarm` ping extend the one-hour cache? | **Documented for cache reads in general**: a cache hit lasts the "same duration as the preceding write" ([pricing › prompt caching](https://platform.claude.com/docs/en/about-claude/pricing)), one hour for the main conversation. Forks get the five-minute TTL for what they *write* ([which TTL each request gets](https://code.claude.com/docs/en/prompt-caching#which-ttl-each-request-gets)), but a keepwarm fork writes nothing of its own ("its own tail never cached", `$.model.fork` in the type declarations). Verify on your setup with `/usage` |
| Does a ping reach the mod's own `turn.step` hook? | **Undocumented.** If it does, the ping shows as one row in the history; the countdown stays right. There is no filter, because a filter would drop real requests that end during a ping |
| Countdown after `--resume` | `seconds_since_last_response` counts from the end of the last response, so the countdown is optimistic by that response's duration. If Claude Code reports `prompt_cache_likely_expired`, the cache is shown cold |
| Dollar amounts | only Claude Code's own estimates and the `/cost` total – no price table of its own |
| Other invalidations | a model switch, an MCP or plugin change can invalidate the cache before the TTL ends ([actions that invalidate the cache](https://code.claude.com/docs/en/prompt-caching#actions-that-invalidate-the-cache)) – visible as a low hit rate |
| Subagents | have their own caches, with a five-minute TTL by default (one hour with `subagentPromptCacheTtl`, `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL`, a subagent's `cacheTtl` frontmatter or `ENABLE_PROMPT_CACHING_1H`; *prompt caching › Choose the TTL yourself*); counted in the totals, not in the countdown |
