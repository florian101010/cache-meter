# Cache Meter

**A [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview) that shows your prompt cache and token usage at a glance** – how long the cache stays warm, how well each request hits it, how full the context is, what every request cost in tokens, and, on request, keeps the cache warm while you step away.

[![CI](https://github.com/florian101010/cache-meter/actions/workflows/ci.yml/badge.svg)](https://github.com/florian101010/cache-meter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-d97757)
![Claude Code ≥ 2.1.287](https://img.shields.io/badge/Claude%20Code-%E2%89%A5%202.1.287-555)

```text
● cache 42m ■■■■■■■■■■■■■■□□□□□□ 93% hit · ☀ context 9% (auto-compact 97%) [ Compact ]
```

> **What is a Claude Code mod?** A mod is a Claude Code plugin whose JavaScript/TypeScript hooks run *inside* Claude Code: it can draw a band above the prompt, open panes, add slash commands and react to events such as each model request. See the official [mods overview](https://code.claude.com/docs/en/plugins/mods/overview). Cache Meter is a mod only – no skills, no MCP server, no settings hooks.

> **For AI coding agents:** start with **[AGENTS.md](AGENTS.md)** – what the mod does, how to install it for a user, how to verify and test it, and the rules for changing it, on one page. Machine-readable index: [llms.txt](llms.txt).

## Quick start

```bash
claude plugin install cache-meter --marketplace florian101010/cache-meter --scope user   # install, then start a new session
claude plugin list                                                                        # cache-meter@cache-meter, enabled
```

In the new session the band appears above the prompt after the first answer; type `/tokens` for the full view. To check a clone: `claude plugin validate --strict . && claude plugin test .`

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Assumptions and limitations](#assumptions-and-limitations)
- [Privacy, cost and permissions](#privacy-cost-and-permissions)
- [Development](#development)
- [License](#license)

## Features

**Band above the prompt** – one line that never wraps, drawn above whatever other mods put in the band:

| Part | Meaning |
|---|---|
| `● cache 42m` | Time left until the main conversation's prompt cache expires. Green = warm, yellow = 17 % of the TTL or less, red = `expired` / `empty` |
| `■■■□□` | The same as a bar (up to 20 cells; dropped first on narrow terminals) |
| `93% hit` | Cache hit rate of the last main request = read ÷ (new + read + written) |
| `☀ context 9%` | Context fill against the model's window; the symbol tracks the distance to the auto-compact point (☀ ☁ ☂ ☇ ↯) |
| `(auto-compact 97%)` | Where auto-compact triggers, on the same scale (`off` when disabled) |
| `↻` | `/keepwarm` is running |
| `· rewrite ≈ …` | When the cache has expired: what the next request will re-write (in $ when Claude Code estimated it, otherwise in tokens) |
| `[ Compact ]` | Runs `/compact`; hidden while a turn is running |

**Pane `/tokens`** – every main-conversation request as a stacked bar (read from cache / written to cache / uncached), session totals for the main conversation and subagents, cost as in `/cost`, plan limits (5 hours, 7 days) with reset times, a context sparkline, the cold rewrites of the session, the keepwarm balance, and the TTL together with the rule that produced it.

**`/keepwarm [10m … 8h | off]`** – shortly before the cache would expire, sends one tiny request over your conversation (`$.model.fork`) so the cache stays warm while you are away. Stops by itself on a miss, at the end of the window, after 12 pings, or when the TTL is 5 minutes.

**Cold-rewrite hint** – after a break that let the cache expire, a toast suggests `/keepwarm` before the next break. Nothing is ever switched on automatically and no prompt is ever dropped.

## Requirements

- **Claude Code 2.1.287 or later** in the terminal, or 2.1.286 or later in the Code tab of the Desktop app (see [where mods run](https://code.claude.com/docs/en/plugins/mods/overview#where-mods-run)). Tested with **2.1.296**.
- Mods enabled – the default; see [turn mods on or off](https://code.claude.com/docs/en/plugins/mods/overview#turn-mods-on-or-off).
- In the VS Code extension and under `claude -p` the hooks run but nothing is drawn, and `/keepwarm` refuses to start.

## Installation

### From GitHub

In a Claude Code terminal session:

```text
/plugin install cache-meter --marketplace florian101010/cache-meter
```

Answer `y` to add the marketplace, then pick a scope. Or from your shell:

```bash
claude plugin install cache-meter --marketplace florian101010/cache-meter --scope user
```

Run `/reload-plugins` in an open session, or start a new one. `/plugin` then shows `… mods active · cache-meter`. Details: [Install plugins](https://code.claude.com/docs/en/plugins/install).

### From a local clone

```bash
git clone https://github.com/florian101010/cache-meter.git
claude --plugin-dir "$PWD/cache-meter"          # for one session
```

To load the clone in every session, add its **absolute** path to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json` (paths separated by `:`; see [settings and environment variables](https://code.claude.com/docs/en/plugins/mods/reference#settings-and-environment-variables)). Claude Code then loads the clone exactly as it is checked out – keep that checkout on `main` and develop in a separate worktree. While a copy named `cache-meter` is already loaded that way, `--plugin-dir` cannot load a second one (the first wins); see [CONTRIBUTING.md](CONTRIBUTING.md#set-up) for how to try a worktree.

> A mod runs with your permissions and is not sandboxed. Read [Privacy, cost and permissions](#privacy-cost-and-permissions) first; `claude plugin validate <dir>` lists every event a mod hooks and every call it makes ([decide whether to trust a mod](https://code.claude.com/docs/en/plugins/mods/overview#decide-whether-to-trust-a-mod)).

## Usage

| What | How |
|---|---|
| See cache and context | the band above the prompt, always on |
| Open the full view | `/tokens` |
| Keep the cache warm | `/keepwarm` (2 h), `/keepwarm 30m` … `/keepwarm 8h`, also `/keepwarm 120m` – interactive sessions only |
| Stop keeping it warm | `/keepwarm off` (or `0`) – reports pings and tokens read |
| Compact | the `[ Compact ]` button in the band or the pane (between turns only) |

## Configuration

One option, `cacheTtl` – `auto` (default), `60m` or `5m`. Set it with `/config` → `cache-meter.cacheTtl`, or in `~/.claude/settings.json` under `pluginConfigs` → `"cache-meter@cache-meter"` (marketplace install) or `"cache-meter@inline"` (loaded with `--plugin-dir` or `CLAUDE_CODE_PLUGIN_DIRS`) → `options` → `cacheTtl`.

With `auto`, the TTL is derived in this order, following [prompt caching › choose the TTL yourself](https://code.claude.com/docs/en/prompt-caching#choose-the-ttl-yourself):

1. the mod's own option `60m` / `5m`
2. `FORCE_PROMPT_CACHING_5M=1` → 5m
3. `CLAUDE_CODE_PROMPT_CACHE_TTL` (`5m` / `1h`)
4. the `promptCacheTtl` setting (`5m` / `1h`)
5. `ENABLE_PROMPT_CACHING_1H=1` → 1h
6. a plan limit at 100 % or more – Claude Code then draws usage credits and drops to 5m → 5m
7. the value Claude Code reported on the last model switch
8. otherwise 60m (subscription within plan usage)

On an API key or a cloud provider Claude Code's default is five minutes: set `cacheTtl` to `5m`, or set `promptCacheTtl`.

## How it works

Cache Meter only listens and draws; it never rewrites prompts or tool calls.

- **`turn.step`** gives the four token counts of every model request – the source of the hit rate, the history and the countdown (timed at the request's *start*, a conservative assumption).
- **`session.measure`** gives context fill, plan limits and cost after each turn; `$.session.usage({ breakdown: 'summary' })` gives the auto-compact point (estimated locally, no API call).
- **`classic.SessionStart`** carries the countdown across `--resume` and reloads state after `/clear`, `/resume` and `/branch`; **`classic.PostModelSwitch`** marks the cache cold after a real model switch, with Claude Code's own estimate.
- **`/keepwarm`** pings through `$.model.fork` from a 15-second timer, never while a main request is running.

Data flow, state, the cold-rewrite rule and every threshold: [docs/how-it-works.md](docs/how-it-works.md).

## Assumptions and limitations

| Topic | Status |
|---|---|
| TTL | derived, not measured: no mod interface reports it per request. The pane shows the rule that produced it. Check with `/usage` → *Prompt cache (main)* |
| Does a `/keepwarm` ping extend the one-hour cache? | **Not officially documented, but observed.** Forks get the five-minute TTL themselves ([which TTL each request gets](https://code.claude.com/docs/en/prompt-caching#which-ttl-each-request-gets)); the mixed case is undocumented. [karanb192/cache-tax](https://github.com/karanb192/cache-tax) observed a fork ping keeping the one-hour cache alive in one run (Fable 5.1, subscription, 2026-09-19). Verify on your setup with `/usage` 6–50 minutes after a ping |
| Does a ping reach the mod's own `turn.step` hook? | **Undocumented.** If it does, the ping shows as one row in the history; the countdown stays right. There is no filter, because a filter would drop real requests that end during a ping |
| Countdown after `--resume` | `seconds_since_last_response` counts from the end of the last response, so the countdown is optimistic by that response's duration. If Claude Code reports `prompt_cache_likely_expired`, the cache is shown cold |
| Dollar amounts | only Claude Code's own estimates and the `/cost` total – no price table of its own |
| Other invalidations | a model switch, an MCP or plugin change can invalidate the cache before the TTL ends ([actions that invalidate the cache](https://code.claude.com/docs/en/prompt-caching#actions-that-invalidate-the-cache)) – visible as a low hit rate |
| Subagents | have their own caches with a five-minute TTL; counted in the totals, not in the countdown |

## Privacy, cost and permissions

- **Writes nothing to disk and sends nothing anywhere** except the `/keepwarm` pings. All values live in session state (`$.state`) and are gone after `/clear`, `/resume`, `/branch` or the end of the session.
- **Reads** the environment variables `FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL` and `ENABLE_PROMPT_CACHING_1H`, and the `promptCacheTtl` setting through `$.settings.read()`.
- **Cost:** none, except `/keepwarm`. Each ping reads your whole context at the model's cache-read price ([pricing](https://platform.claude.com/docs/en/about-claude/pricing)) and counts against your plan. How cache reads count towards the 5-hour and weekly limits is not documented – watch the limits in the pane.

More in [SECURITY.md](SECURITY.md).

## Development

```bash
claude plugin validate --strict .   # manifest, marketplace, hooks, state contract
claude plugin test .                # 23 tests against the engine – no session, sign-in or network
tsc -p .                            # types appear in .claude-plugin/types/ once Claude Code has loaded the mod
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing anything – above all the rule that the **official documentation is the single source of truth** for the mods API, not memory. CI runs `validate --strict` and the tests on every push and pull request.

```text
.claude-plugin/plugin.json        manifest: name, version, type contract, the cacheTtl option
.claude-plugin/marketplace.json   makes this repository a one-plugin marketplace
hooks/hooks.json                  points to the hooks module
hooks/register.tsx                all hooks: data sources, band, pane, commands, keepwarm
hooks/lib.ts                      pure functions without $ (TTL derivation, formatting) – unit-testable
types/index.d.ts                  type contract of every $.state value
tests/cache-meter.test.tsx        tests run by `claude plugin test`
docs/how-it-works.md              design and data flow
AGENTS.md                         guide for coding agents: install, verify, test, change
.claude/CLAUDE.md                 imports AGENTS.md for Claude Code sessions in this repository
llms.txt                          machine-readable index of the documentation
```

## License

[MIT](LICENSE) © 2026 Florian Grimmer

Not affiliated with or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic.
