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

The TTL is derived (see the README, *Configuration*), because no mod event carries it per request. The order after the mod's own option is Claude Code's own (*prompt caching › Choose the TTL yourself*); the plan-limit rule mirrors "Once you go over your plan's usage limit … Claude Code drops the main conversation to the five-minute TTL" (*prompt caching › Which TTL each request gets*).

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

## Band layout

The band is one row sized to `e.props.bodyColumns`. The width of every segment is computed first; on a narrow terminal the re-write hint goes first, then the auto-compact note, then the bar (minimum six cells). The `[ Compact ]` button is hidden while `e.props.isWorking`. The weather symbols are single-width characters, not emoji, so the row lines up in every terminal font.

## Tests

`claude plugin test` runs `tests/cache-meter.test.tsx` against the engine with stubs for everything Claude Code would answer (*test › Stub what Claude Code would answer*): `mock.clock` for the timer, `mock.env` for the TTL controls, a generator stub for `turn.step` (optionally slow, to keep a request in flight), and a `ui.render` stub below the band. Each safeguard – band composition, miss and partial-miss stops, no timer without a screen, no ping during a request, reset after an aborted turn, the cold-rewrite rule, the resume label – was checked by breaking it on purpose and seeing its test fail.
