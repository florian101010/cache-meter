# Cache Meter (Claude Code Mod)

[![CI](https://github.com/florian101010/cache-meter/actions/workflows/ci.yml/badge.svg)](https://github.com/florian101010/cache-meter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-d97757)
![Claude Code ≥ 2.1.287](https://img.shields.io/badge/Claude%20Code-%E2%89%A5%202.1.287-555)

**Never lose your prompt cache to a coffee break.**

Claude Code re-sends your entire conversation with every message. The prompt cache is what makes that fast and cheap – but it only lives for **one hour** on a Claude subscription (five minutes on an API key). Step away longer, and your next message re-writes the whole context from scratch: a [slower turn](https://code.claude.com/docs/en/prompt-caching#cache-lifetime), billed at the [cache-write rate](https://code.claude.com/docs/en/prompt-caching#check-cache-performance). Nothing on screen warns you.

**Cache Meter puts the cache on screen and keeps it warm while you are away.**

- **See it** – a live countdown above the prompt: minutes until the cache expires, the hit rate of the last request, how full the context is.
- **Keep it** – type **`/keepwarm`** before lunch or a meeting. Shortly before expiry it sends one tiny ping that keeps the cache alive – about **1/20 of the cost of a re-write**, with hard limits so it never runs away.
- **Understand it** – **`/tokens`** opens a dashboard: every request's cache hits and misses, cold re-writes and why they happened, what caching saved you, context fill and your plan limits – plus a **Context** tab (which CLAUDE.md files, MCP servers and skills fill your context) and a **Health** tab (API errors, requests cut off at the output limit, the advisor's time, cost per hour at API prices).

Safe by design: it never changes your prompts or tool calls, writes nothing to disk and sends nothing except the pings you start. Free and MIT-licensed.

```bash
claude plugin install cache-meter --marketplace florian101010/cache-meter --scope user
```

### What you see

The band above the prompt, always there:

```text
● cache 38m ■■■■■■■■■■■■■□□□□□□□ 99% hit · ☀ context 15% (auto-compact 97%) [ Compact ]
```

`/tokens`, the dashboard (example values; colors in your terminal):

```text
◉ Cache Meter                                                                  prompt cache · tokens
╭───────────────────────────────────────────────╮ ╭────────────────────────────────────────────────╮
│ ▀▀█ █▀█  WARM · min left · until 15:32        │ │ Context 15%                      150.2k / 1.0M │
│  ▀█ █▀█  hit 99% last · 86% session           │ │ ██████▉░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░┃ │
│ ▀▀▀ ▀▀▀  TTL 60m · subscription               │ │ ┃ auto-compact 97%                 trend ▁▂▃▅▆ │
│ ████████┃███████████████████▌░░░░░░░░░░░░░░░░ │ ╰────────────────────────────────────────────────╯
│ expiry costs a re-write of ≈ 150k tokens      │ ╭────────────────────────────────────────────────╮
╰───────────────────────────────────────────────╯ │ Session          cache saved 54% of input cost │
╭───────────────────────────────────────────────╮ │ read 460k · written 122k · new 8 · out 1.3k    │
│ ↻ Keepwarm off                w: Keep warm 2h │ │ 4 requests · $1.09 list price                  │
│ Break ahead? A ping ≈ 1/20 of a re-write.     │ │ Cold       None – warm for every request.      │
╰───────────────────────────────────────────────╯ │ 5 hours    ██░░░░░░░░░  12% · resets Mon 17:10 │
                                                  ╰────────────────────────────────────────────────╯
╭──────────────────────────────────────────────────────────────────────────────────────────────────╮
│ Requests                                   height = share not read from the cache · newest right │
│                                                                         ▃▃                       │
│                                                                         ██                       │
│                                                                         ██                       │
│ ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁██▁▁▁▁▂▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁ │
│ 14:02                                                                                      15:31 │
│ last 150.2k in · 99% hit · out 570                                                               │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯
keys after ctrl+x tab: w keep warm · c compact · Esc back                                 c: Compact
```

> **What is a Claude Code mod?** A mod is a Claude Code plugin whose TypeScript hooks run *inside* Claude Code: it can draw above the prompt, open panes, add slash commands and react to events such as each model request. See the official [mods overview](https://code.claude.com/docs/en/plugins/mods/overview). Cache Meter is a mod only – no skills, no MCP server, no settings hooks.

> **For AI coding agents:** start with **[AGENTS.md](AGENTS.md)** – what the mod does, how to install it for a user, how to verify and test it, and the rules for changing it, on one page. Machine-readable index: [llms.txt](llms.txt).

## Keep the cache warm with `/keepwarm`

Before you step away, type:

```text
/keepwarm          # 2 hours
/keepwarm 4h       # any window from 10m to 8h
/keepwarm off      # stop early
```

The band shows `↻` while it runs. Whenever 10 minutes or less of the one-hour TTL are left and no request is running, Cache Meter sends one tiny request over your conversation (`$.model.fork`, answer: `warm`). It reads the cached context, and a cache read keeps the entry alive for the duration of the original write – one hour for the main conversation ([pricing › prompt caching](https://platform.claude.com/docs/en/about-claude/pricing): cache read, *"same duration as the preceding write"*). That is roughly one ping every 50 minutes.

**What it costs, compared with letting the cache expire** (multipliers of the base input price, from the [pricing page](https://platform.claude.com/docs/en/about-claude/pricing)):

| | Re-write after expiry (1-hour cache write) | One ping (cache read) | Pings that cost as much as one re-write |
|---|---|---|---|
| Most models | 2× | 0.1× | ≈ 20 |
| Claude Opus 5.5, Claude Sonnet 5.5 | 2× | 0.05× | ≈ 40 |
| Claude Fable 5.1, Claude Mythos 5.1 | 2× | 0.025× | ≈ 80 |

Each ping also pays for its few uncached tokens and its one-word answer. On a subscription these are shares of your plan limits rather than dollars; how cache reads count towards the 5-hour and weekly limits is not documented, so watch the limits in `/tokens`.

**Safety limits** – keepwarm switches itself off, with a toast, when:

- a ping reads less than half of the context, nothing at all, or writes 10 % or more of what it read (the cache was not what it should be, so further pings would be full re-writes);
- 12 pings are done, the window ends, the cache is empty or expired, or a ping gets no answer;
- the TTL is five minutes (API key, cloud provider, or a plan limit reached) – it refuses to start there.

It runs only in interactive sessions, never drops a message, and after an expensive cold re-write it only *suggests* `/keepwarm` – it never switches itself on.

**Check that it works on your setup:** 10–50 minutes after a ping, run `/usage` – the *Prompt cache (main)* line should say warm – or watch the hit rate of your next request in the band.

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
- [Privacy, cost and permissions](#privacy-cost-and-permissions)
- [FAQ](#faq)
- [Contributing](#contributing)
- [Learn more](#learn-more)
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
| `· API $1.10` | What the session would cost at API prices – Claude Code's own figure, the one `/cost` shows (dropped first on narrow terminals) |
| `↻` | `/keepwarm` is running |
| `· rewrite ≈ …` | When the cache has expired: what the next request will re-write (in $ when Claude Code estimated it, otherwise in tokens) |
| `[ Compact ]` | Runs `/compact`; hidden while a turn is running |

**Pane `/tokens`** – a dashboard that fits its space: two columns above the prompt from 110 columns, one column as a sidebar, a compact version in a narrow sidebar. It shows a big countdown with the expiry time and a `┃` where keepwarm would ping, what expiry would cost, a keepwarm card with one-key start (`w`), a context gauge marking the auto-compact point, **what caching saved** (share of the input cost, from the price multipliers – see [Prices](CONTRIBUTING.md#prices)), session totals for the main conversation and subagents, cost as in `/cost` (API list price), plan limits with reset times, the cold rewrites of the session, and a **column chart of every request** – its height is the share not read from the cache, so a cold re-write stands out as a tall red column. `/tokens` again or Esc at an empty prompt closes it; above the prompt it also closes when you send your next prompt.

**Tab `2: Context`** – where your context goes, in tokens: categories (memory files, system tools, skills, messages …), the heaviest CLAUDE.md and rule files, MCP servers with their tool count, how many skills made it into the listing (e.g. *120 of 154*). Claude Code estimates this locally after each turn, for free – the same data `/context` shows, but always at hand. **Count exactly** (`x`) asks the API, one request per tool and memory file, only when you press it.

**Tab `3: Health`** – session age, prompts, cost at API prices per hour and per prompt, tokens per prompt; requests that ended unusually (output limit, context full, compaction, refusal); API errors (overloaded, rate limit …) – Claude Code shows each one once and moves on, this keeps the tally; server-side tool calls such as the [advisor](https://code.claude.com/docs/en/advisor) with their time; and Claude Code's own verdict on the cache at model switches and resumes, checked against Cache Meter's countdown.

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

With `auto`, Cache Meter follows Claude Code's own TTL controls and your plan state ([full order](docs/how-it-works.md#how-the-ttl-is-derived)). On an API key or a cloud provider Claude Code's default is five minutes: set `cacheTtl` to `5m`, or set `promptCacheTtl`.




## Privacy, cost and permissions

- **Writes nothing to disk and sends nothing anywhere** except the `/keepwarm` pings. All values live in session state (`$.state`) and are gone after `/clear`, `/resume`, `/branch` or the end of the session.
- **Reads** the environment variables `FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL` and `ENABLE_PROMPT_CACHING_1H`, and the `promptCacheTtl` setting through `$.settings.read()`.
- **Cost:** none, except `/keepwarm`. Each ping reads your whole context at the model's cache-read price ([pricing](https://platform.claude.com/docs/en/about-claude/pricing)) and counts against your plan. How cache reads count towards the 5-hour and weekly limits is not documented – watch the limits in the pane.

More in [SECURITY.md](SECURITY.md).

## FAQ

**Does it cost anything?** No – except `/keepwarm`, which you start yourself. Each ping reads your context at the cache-read price – about 1/20 of re-writing it after expiry (1/40 on Opus 5.5 and Sonnet 5.5, 1/80 on Fable 5.1 and Mythos 5.1) – and counts against your plan; at most 12 pings per run.

**Does `/keepwarm` really keep the cache alive?** A cache read keeps the entry for the duration of its original write – one hour for the main conversation ([pricing](https://platform.claude.com/docs/en/about-claude/pricing)). Check it on your setup with `/usage` after a break (see [above](#keep-the-cache-warm-with-keepwarm)).

**Isn't this what `/usage` shows?** `/usage` reports the session's hit ratio and whether the cache is warm, when you ask. Cache Meter shows how long it stays warm, all the time, per request, with history – and can keep it warm.

**Does it work with an API key or a cloud provider?** Yes. Claude Code's default TTL there is five minutes; set `cacheTtl` to `5m` (see [Configuration](#configuration)). `/keepwarm` is disabled at a five-minute TTL.

**Does it read or change my prompts?** No. It hooks model requests only to read their token counts. See [SECURITY.md](SECURITY.md) for everything it can reach.

**Where does it work?** In the Claude Code terminal and the Code tab of the Desktop app. In the VS Code extension and under `claude -p` it runs but draws nothing.

**How do I remove it?** `claude plugin uninstall cache-meter@cache-meter`.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first – above all the rule that the **official documentation is the single source of truth** for the mods API, not memory. CI runs `claude plugin validate --strict` and every test on every push and pull request.

## Learn more

- [docs/how-it-works.md](docs/how-it-works.md) – events, state, thresholds, the TTL derivation, assumptions and limitations
- [AGENTS.md](AGENTS.md) – install, verify, test and change the mod, for coding agents
- [SECURITY.md](SECURITY.md) – everything the mod can reach
- [CHANGELOG.md](CHANGELOG.md) – versions


## License

[MIT](LICENSE) © 2026 Florian Grimmer

Not affiliated with or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic.
