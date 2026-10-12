# How Cache Meter works

This page describes the design of the mod for people who want to change it or check what it does. Every statement about the Claude Code mods API refers to the official documentation – <https://code.claude.com/docs/en/plugins/mods/overview> and its pages – or to the type declarations Claude Code writes for the running version (`.claude-plugin/types/claude-code/index.d.ts`). References such as *interface › Pick where to draw* name a page and a section of that documentation. Where something is not documented, it says so.

## Events and calls

| Hook | Used for | Source |
|---|---|---|
| `session.start` | reads the TTL controls and a first measurement, starts the 15 s timer (interactive sessions only), registers `/tokens` and `/keepwarm` | *reference › Session*, *overview › Where mods run* |
| `classic.SessionStart` with `source` `clear`, `resume`, `fork` | `/clear`, `/resume` and `/branch` reset all `$.state` and do not fire `session.start` again, so the same set-up runs here; on resume/fork the countdown continues from `seconds_since_last_response` | *interface › Load a saved value again after /clear*; types: `SessionStartHookInput` |
| `turn.step` (async generator) | the four token counts of each model request; main conversation vs. subagent via `e.agentId` | *events › Follow a turn*; types: `TurnStepResult.usage` |
| `turn.complete` | resets the count of running main requests, also after an abort (`isAborted`) | types: `TurnCompleteInput` |
| `session.measure` | context fill, plan limits, cost after each turn | *reference › Session*; types: `SessionMeasureInput` |
| `session.compact` | a real compaction (not `precompute`, not a subagent) empties the cache | types: `SessionCompactInput` |
| `classic.PostModelSwitch` | a real switch (not `source: 'resume'`, not to the same model) leaves the cache cold; carries `cache_ttl` and `estimated_cache_write_usd` | types: `PostModelSwitchHookInput` |
| `ui.render` `AbovePrompt` | the band; puts `await next(e)` below its own row so other mods' content stays | *interface › Pick where to draw › Band above the prompt* |
| `ui.render` `Pane` (`requestId: 'cache-meter'`) | the `/tokens` pane; sized by `e.props.bodyColumns` and `e.props.scroll.bodyRows` | *reference › Render sites* |
| `command.run` `tokens`, `keepwarm` | the two commands | *api › Add a command* |

Calls: `$.clock.now/every`, `$.command.register`, `$.env.get` (three literal names), `$.settings.read`, `$.session.usage` and `$.session.compact`, `$.model.fork`, `$.state` through `atom`/`read`/`update`, `$.ui.invalidate/open/resolve/toast`. `claude plugin validate .` prints the authoritative list.

## State

All drawn values live in `$.state`, declared in `types/index.d.ts` (*interface › Keep a value in $.state*). They survive a reload of the module and are reset by `/clear`, `/resume` and `/branch`.

| Key | Holds |
|---|---|
| `cache` | `lastAt` (start of the last request that touched the main cache; `0` = known cold), hit rate, context tokens, Claude Code's re-write estimate, why it is cold (`model`/`resume`) and the reported idle time |
| `steps` | the last 80 main-conversation requests (start time, four token counts, model) |
| `totals` | sums for main conversation and subagents, number of cold rewrites and tokens re-written |
| `coldWrites` | the last 20 cold rewrites (time, tokens, cause `pause`/`model`/`resume`, idle time) |
| `measure` | context fill and tokens, window, auto-compact point (and whether it is off), the last 12 context sizes, plan limits, cost |
| `reportedTtl` | `cache_ttl` from the last model switch |
| `ttlConfig` | the TTL controls read at start (three environment variables, the `promptCacheTtl` setting) |
| `keepWarm` | end of the window, pings, tokens read, last ping |

Module variables hold only what is never drawn: the `cacheTtl` option, whether the session is interactive, whether a ping is in flight, and how many main requests are running. A reload runs `session.start` again (*reference › Session*), so losing them is harmless.

## Countdown and TTL

The countdown is `lastAt + TTL − now`, redrawn every 15 seconds. `lastAt` is the start of the last main request: the documentation says the cache stays warm for one TTL "after Claude Code last sent a request … or Claude last responded" (*prompt caching › Switching models*); counting from the request's start is the conservative choice. Every hit resets the timer (*prompt caching › Cache lifetime*).

The TTL is derived (see [How the TTL is derived](#how-the-ttl-is-derived)), because no mod event carries it per request. The order after the mod's own option is Claude Code's own (*prompt caching › Choose the TTL yourself*); the plan-limit rule mirrors "Once you go over your plan's usage limit … Claude Code drops the main conversation to the five-minute TTL" (*prompt caching › Which TTL each request gets*).

## Hit rate

`read ÷ (input + read + write)` of a single request, from `TurnStepResult.usage`, as a whole percent. The session hit rate uses the same formula over the main-conversation totals.

## Cold rewrites

A main request counts as a cold rewrite when all of these hold:

1. at its start, the cache was expired by the clock (or known cold after a model switch or a resume that Claude Code reported as `prompt_cache_likely_expired`),
2. it wrote at least 10,000 tokens to the cache, and
3. it wrote more than it read – so a wrong TTL assumption cannot turn a warm request into a "cold" one.

The first request of a new session and the first after `/compact` or `/clear` find no cache at all and are not counted. The pane shows the last five with their cause; the totals cover the whole session. After a cold rewrite caused by a pause in this session, a toast suggests `/keepwarm` (10 s), unless keepwarm is already running or the session is not interactive.

## `/keepwarm`

Every 15 seconds (interactive sessions only) the timer checks, in this order:

1. no window, a ping in flight, or a main request running → nothing to do;
2. window over or 12 pings reached → stop with a toast;
3. TTL below one hour → stop (a ping every few minutes is not worth it);
4. cache empty or expired → stop;
5. more than 17 % of the TTL left → wait;
6. otherwise ping: `$.model.fork({ prompt: 'Reply with the single word: warm' })`.

A fork is "the main thread's last request again … with `prompt` after it: every tool denied, its own tail never cached" (types: `$.model.fork`). After the ping, the mod stops warming when the fork read nothing, read less than half of the known context, or wrote 10 % or more of what it read (a partial miss) – in each case the TTL assumption was wrong and further pings would be full re-writes. Otherwise `lastAt` moves to the ping's start.

Why a ping keeps the one-hour entry alive: a cache read lasts the "same duration as the preceding write" ([pricing › prompt caching](https://platform.claude.com/docs/en/about-claude/pricing)), and the main conversation's prefix was written with the one-hour TTL. Forks get the five-minute TTL only for what they write (*prompt caching › Which TTL each request gets*), and a keepwarm fork writes nothing of its own ("its own tail never cached"). Costs per model: README, *Keep the cache warm with /keepwarm*.

The count of running main requests is raised before the first `await` in `turn.step` and lowered in its `finally`; `turn.complete` resets it, because the documentation does not say whether an aborted stream reaches `finally`.

## Pane layout

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

## What caching saved

`cache saved X % of input cost` compares the input tokens of the main conversation at the base input price with what they cost through the cache:

```text
saved = 1 − (new + read × r + written × w) ÷ (new + read + written)
```

`r` is the cache-read multiplier of the last request's model, `w` the cache-write multiplier of the current TTL (2× for one hour, 1.25× for five minutes) – both from the official pricing page, see [CONTRIBUTING › Prices](../CONTRIBUTING.md#prices). Output tokens are not part of it. A negative value (`cache cost +X %`) means more was written than reading saved, e.g. right after a cold re-write. Assumption: the whole session used the last request's model and the current TTL.

### Where the pane sits

**Opening by itself (`autoSidebar: auto`).** `session.start` does not say whether the session is fullscreen; the band's `ui.render` does (`e.viewport.isFullscreen`). Two seconds after start and on every tick after, Cache Meter opens the pane once per load if the band was drawn fullscreen, nobody closed the pane yet (`ui.close` with `origin.kind` `person`, or `/tokens` closing it) and it is not open. An unasked pane is placed from 144 terminal columns, 110 once the person opened it before, and waits undrawn below that (types: `UiOpenResult`). Above the prompt it never opens by itself.

**Typeahead.** A `prompt.autocomplete` hook adds rows beneath the engine's own: the three `/tokens <tab>` commands while `/tok…` is typed at the start of the prompt, and the matching tab names after `/tokens `, each with one line of description. The command's `argumentHint` (`[overview | context | health]`) shows once a space follows `/tokens`.

The surface seats the pane, not the mod (*interface › Pick where to draw*): docked as a sidebar beside the transcript in the fullscreen renderer from 110 columns, otherwise inline above the prompt. The mod reads where it was seated (`Pane.placement`) and acts on it: inline, your next own prompt (`prompt.submit` with `origin.kind` `composer`) closes the pane, since the band already carries the summary; docked, it stays. `/tokens` toggles. `closeOnEscape` (Esc at an empty prompt closes the pane) is set only when the pane will sit above the prompt: `command.run`'s `presentation` says whether the session is fullscreen and how wide the terminal is, and from 110 columns in fullscreen the pane docks – there Esc only hands the keys back. Keys reach the pane only while it has focus: ctrl+x then Tab, or a click – clicks only in the fullscreen renderer, which captures the mouse (*interface › Keyboard focus and hotkeys*; *fullscreen › Use the mouse*). `/tokens <tab>` switches tabs without focus; the footer names it and offers clicking only when `e.viewport.isFullscreen`. No `focus` on open: a focused pane takes the keys, and its hotkeys would swallow typing.

## Context tab

After each turn the `session.measure` hook reads `$.session.usage({ breakdown: 'summary' })` – Claude Code's local estimate, which sends no request (types: `SessionUsageArgs`) – and keeps the heaviest items of `context.breakdown` (types: `SessionContextBreakdown`): categories of kind `used`, memory files, loaded MCP tools summed per `serverName` (tools with `isLoaded: false` sit behind tool search and are only counted), agents, and `skills.includedSkills` of `totalSkills`. **Count exactly** calls `breakdown: 'full'`, which sends one token-count request per tool and memory file as `/context` does – only on a press, never on a timer. The card says which one it shows (`estimate` or `exact`) and when. `ContextCategory.color` is not used: its format is undocumented, and an unknown color would make the whole tree invalid.

## Health tab

| Row | Source |
|---|---|
| Age, prompts | `$.session.usage().startedAt` (`/clear` starts it over), `$.session.turns()`, read in `session.measure` |
| Cost, $/h, $/prompt | `cost.usd` (as `/cost`) over age and prompts; labelled *API value* when plan limits are reported (a subscription: `rateLimits` is empty off one, types `SessionMeasureInput`), *spent* otherwise |
| Stops | `turn.step` result `stopReason` of main requests; `end_turn`, `tool_use` and none are normal, the rest is counted (*events › Follow a turn*) |
| Errors | settings hook event `StopFailure` (`classic.StopFailure`, observed with `next(e)`), its `error`; `agent_id` set = subagent, counted apart |
| Server | `turn.step` result `serverToolUses` (v2.1.290+): tool calls the API ran itself, such as the advisor; no `tool.call` fires for them. Duration = `endedAt − startedAt`, `–` without `endedAt` |
| Cache check | `PostModelSwitch.prompt_cache_warm` and, on resume/fork, `SessionStart.prompt_cache_likely_expired` – Claude Code's verdict – against Cache Meter's countdown at that moment, taken before either is acted on; skipped while Cache Meter has seen no request (its state is empty after `/resume`) |

## Band layout

The band is one row sized to `e.props.bodyColumns`. The width of every segment is computed first; on a narrow terminal the re-write hint goes first, then the auto-compact note, then the bar (minimum six cells). The cost segment (`API value $X` on a subscription, `spent $X` otherwise, hidden at $0) is dropped first, before the auto-compact note. The `[ Compact ]` button is hidden while `e.props.isWorking`. The weather symbols are single-width characters, not emoji, so the row lines up in every terminal font.

## Tests

`claude plugin test` runs `tests/cache-meter.test.tsx` against the engine with stubs for everything Claude Code would answer (*test › Stub what Claude Code would answer*): `mock.clock` for the timer, `mock.env` for the TTL controls, a generator stub for `turn.step` (optionally slow, to keep a request in flight), and a `ui.render` stub below the band. Each safeguard – band composition, miss and partial-miss stops, no timer without a screen, no ping during a request, reset after an aborted turn, the cold-rewrite rule, the resume label – was checked by breaking it on purpose and seeing its test fail.

## How the TTL is derived

With the option `cacheTtl` set to `auto`, the TTL is derived in this order, following [prompt caching › choose the TTL yourself](https://code.claude.com/docs/en/prompt-caching#choose-the-ttl-yourself):

1. the mod's own option `60m` / `5m`
2. `FORCE_PROMPT_CACHING_5M=1` → 5m
3. `CLAUDE_CODE_PROMPT_CACHE_TTL` (`5m` / `1h`)
4. the `promptCacheTtl` setting (`5m` / `1h`)
5. `ENABLE_PROMPT_CACHING_1H=1` → 1h
6. a plan limit at 100 % or more – Claude Code then draws usage credits and drops to 5m → 5m
7. the value Claude Code reported on the last model switch
8. otherwise 60m (subscription within plan usage)

## Assumptions and limitations

| Topic | Status |
|---|---|
| TTL | derived, not measured: no mod interface reports it per request. The pane shows the rule that produced it. Check with `/usage` → *Prompt cache (main)* |
| Does a `/keepwarm` ping extend the one-hour cache? | **Documented for cache reads in general**: a cache hit lasts the "same duration as the preceding write" ([pricing › prompt caching](https://platform.claude.com/docs/en/about-claude/pricing)), one hour for the main conversation. Forks get the five-minute TTL for what they *write* ([which TTL each request gets](https://code.claude.com/docs/en/prompt-caching#which-ttl-each-request-gets)), but a keepwarm fork writes nothing of its own ("its own tail never cached", `$.model.fork` in the type declarations). Also observed in practice with the same mechanism by [karanb192/cache-tax](https://github.com/karanb192/cache-tax) (Fable 5.1, subscription, 2026-09-19). Verify on your setup with `/usage` |
| Does a ping reach the mod's own `turn.step` hook? | **Undocumented.** If it does, the ping shows as one row in the history; the countdown stays right. There is no filter, because a filter would drop real requests that end during a ping |
| Countdown after `--resume` | `seconds_since_last_response` counts from the end of the last response, so the countdown is optimistic by that response's duration. If Claude Code reports `prompt_cache_likely_expired`, the cache is shown cold |
| Dollar amounts | only Claude Code's own estimates and the `/cost` total – no price table of its own |
| Other invalidations | a model switch, an MCP or plugin change can invalidate the cache before the TTL ends ([actions that invalidate the cache](https://code.claude.com/docs/en/prompt-caching#actions-that-invalidate-the-cache)) – visible as a low hit rate |
| Subagents | have their own caches with a five-minute TTL; counted in the totals, not in the countdown |
