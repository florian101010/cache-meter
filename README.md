<p align="center"><img src="https://raw.githubusercontent.com/florian101010/cache-meter/assets/brand/header.svg" width="100%" alt="Cache Meter – Never lose your prompt cache to a coffee break again. A coffee cup inside a countdown ring that drains, pings and refills."></p>

# Cache Meter (Claude Code Mod)

[![CI](https://github.com/florian101010/cache-meter/actions/workflows/ci.yml/badge.svg)](https://github.com/florian101010/cache-meter/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/florian101010/cache-meter?display_name=release)](https://github.com/florian101010/cache-meter/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-d97757)
![Claude Code ≥ 2.1.287](https://img.shields.io/badge/Claude%20Code-%E2%89%A5%202.1.287-555)

**Never lose your prompt cache to a coffee break again.**

Claude Code re-sends your entire conversation with every message. The prompt cache is what makes that fast and cheap – but it only lives for **one hour** on a Claude subscription (five minutes on an API key). Step away longer, and your next message re-writes the whole context from scratch: a [slower turn](https://code.claude.com/docs/en/prompt-caching#cache-lifetime), billed at the [cache-write rate](https://code.claude.com/docs/en/prompt-caching#check-cache-performance). Nothing on screen warns you.

> **What a break costs:** on Claude Opus 5.5, re-writing a 150k-token conversation after the cache expired costs about **$1.20** at API prices – keeping it warm with one `/keepwarm` ping about **$0.03** ([pricing › prompt caching](https://platform.claude.com/docs/en/about-claude/pricing#prompt-caching)). On a subscription it is plan usage instead of dollars, at the same ratio.

**Cache Meter puts the cache on screen, keeps it warm while you are away – and tells you what breaks it, what fills your context and what every answer costs.**

<table>
<tr>
<td width="33%" valign="top">

### ⏱️ See it

A live countdown above the prompt: minutes until the cache expires, the last request's hit rate, how full the context is and what the session would cost on an API key. **Under every answer, what that answer cost** – and a heads-up when a switch is about to re-write it: before a `/model` switch, and the moment a request with another model or effort goes out.

</td>
<td width="33%" valign="top">

### ☕ Keep it

Type **`/keepwarm`** before lunch or a meeting. Shortly before expiry one tiny ping keeps the cache alive – about **1/20 of a re-write**, with hard limits so it never runs away. Forgot? An optional **desktop notification** reminds you ten minutes before the cache expires.

</td>
<td width="33%" valign="top">

### 📊 Understand it

**`/tokens`** opens a dashboard: **why a warm cache broke**, what caching saved, **which tool results and files fill your context** (and which MCP servers you never call), when auto-compact and your plan limit hit at this pace, what each subagent used, API errors and cost per hour. **`/tokens report`** copies it all as Markdown.

</td>
</tr>
</table>

**New in 0.6–0.8:** cost under every answer · a warning before a switch re-writes the cache · the cause of every warm miss · what tool results fill your context · auto-compact forecast · per-subagent use · expiry notification · `/tokens report` for sharing. See the [changelog](CHANGELOG.md).

**Install** – in your shell, then start a new Claude Code session:

```bash
claude plugin install cache-meter --marketplace florian101010/cache-meter --scope user
```

**Or let Claude Code do it** – paste this into a session:

```text
Install the Claude Code mod from https://github.com/florian101010/cache-meter – follow its AGENTS.md.
```

It runs the same command (Claude Code may ask you to approve it); start a new session afterwards.

**Try it** in the new session:

1. Ask anything – under the answer a line shows what it cost; the band above the prompt shows the countdown, hit rate and context.
2. `/tokens` – the dashboard; `/tokens context` shows which tool results, files and servers fill your context.
3. `/keepwarm` before your next break – then check after the break that the next answer reads from the cache (hit rate in the band).
4. `/tokens report` – the whole session as Markdown on your clipboard, ready to paste into an issue or a note.

Safe by design: it never changes your prompts, answers or tool calls, never keeps their text and writes nothing to disk. It sends nothing on its own – only the `/keepwarm` pings and, if you press **Count exactly**, the token counts `/context` would make; with the option `expiryNotice` on, a notification through your own terminal. Free and MIT-licensed.

### What you see

The band above the prompt, always there:

![The band above the prompt: cache 60m with a green countdown bar, 100% hit, context 15%, auto-compact at 97%, API value $1.06 and a Compact button](https://raw.githubusercontent.com/florian101010/cache-meter/assets/screenshots/band.png)

`/tokens` – the dashboard, here as a sidebar beside the chat (Claude Code's fullscreen renderer):

<img src="https://raw.githubusercontent.com/florian101010/cache-meter/assets/screenshots/overview.png" width="640" alt="The /tokens overview: a big 60-minute countdown marked WARM with the expiry time and where keepwarm would ping, a keepwarm card with a 'Keep warm 2h' button, the context gauge with the auto-compact marker, session totals with 'cache saved 40% of input cost' and the plan limits, and a column chart of every request">

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

## See everything with `/tokens`

`/tokens` opens the dashboard, `/tokens` again closes it. Three tabs, each answering its own question:

| Tab | What it answers | Open with |
|---|---|---|
| **Overview** | How long is the cache still warm? Did the last requests hit it? What did caching save? How many prompts until auto-compact? How close are my plan limits – and when are they full at this pace? | `/tokens` |
| **Context** | What fills my context – which tool results (by tool, and the largest single ones), CLAUDE.md files, MCP servers (and how often this session called each), skills, agents? | `/tokens context` |
| **Health** | Did requests fail or get cut off? How long does the advisor take? What does the session cost per hour and per prompt? Was a warm cache re-written anyway – and why? What did each subagent use? | `/tokens health` |
| **Report** | Everything above as Markdown on the clipboard – to share, file or compare | `/tokens report` |

<p>
<img src="https://raw.githubusercontent.com/florian101010/cache-meter/assets/screenshots/context.png" width="49%" alt="The Context tab: where the context goes by category, the heaviest memory files, MCP servers, skills listed of total and agents">
<img src="https://raw.githubusercontent.com/florian101010/cache-meter/assets/screenshots/health.png" width="49%" alt="The Health tab: session age, prompts, cost as API value per prompt, tokens per prompt, stop reasons, API errors, server-side tool calls and the cache check">
</p>

**Where it shows.** In Claude Code's classic renderer the pane sits above the prompt, and your next prompt closes it so the conversation keeps its room. In the fullscreen renderer (`/tui fullscreen`) it docks beside the chat as a sidebar, opens there by itself at session start (option [`autoSidebar`](#configuration)) and stays open while you work.

**Switching tabs.** `/tokens context` or `/tokens health` – a prefix is enough; after `/tokens ` Claude Code shows the tab names and `report` as a hint. Or click a tab (fullscreen renderer), or press ctrl+x, Tab, then `1`–`3`.

**Where the numbers come from.** Everything is what Claude Code reports to mods – token counts per request, context breakdown, cost, plan limits, stop reasons, errors. Tool-result sizes are estimates (characters ÷ 4 of the text the model reads), shown beside Claude Code's own total for all messages. Nothing is sent anywhere; only **Count exactly** in the Context tab asks the API to count tokens, once, when you press it.

## Contents

- [Keep the cache warm with `/keepwarm`](#keep-the-cache-warm-with-keepwarm)
- [See everything with `/tokens`](#see-everything-with-tokens)
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
| `· API value $1.10` | On a subscription: what the session would cost on an API key – a comparison, Claude Code's own figure as `/cost` shows it. On an API key or a cloud provider it reads `· spent $1.10`. Hidden at $0, dropped first on narrow terminals |
| `↻` | `/keepwarm` is running |
| `· rewrite ≈ …` | When the cache has expired: what the next request will re-write (in $ when Claude Code estimated it, otherwise in tokens) |
| `· cold: good time to` | Before `[ Compact ]` when the cache has expired and the context is half full or more: the next prompt re-writes everything anyway, so compacting now loses no warm cache (it still reads the context once) |
| `[ Compact ]` | Runs `/compact`; hidden while a turn is running |

Four more places, only when there is something to say:

| Where | What |
|---|---|
| Under each answer | `◉ Cache Meter · ≈ $0.42 API value · 3 requests · 97% from cache · 6.0k written to cache` – what the session cost rose by during this answer (subagents it started count; `spent` on an API key; no cost under half a cent), its model requests and how they used the cache. Option [`turnLine`](#configuration) |
| At a model switch | While the cache is warm, Claude Code asks you to confirm a `/model` switch. Cache Meter adds a note with Claude Code's own estimate and the time left: *Model switch re-writes 148.0k tokens to the cache (≈ $1.18) · cache warm 42m more – after it expires, switching adds nothing.* It never blocks or approves a switch |
| When a request splits the cache | While the cache is warm, a request that changes what the cache is keyed on – the model for one turn (a skill or command that names its own, `opusplan`), or the effort level on a model where that splits it – gets a note the moment it goes out: *This request re-writes 148.0k tokens to the cache: effort high → medium.* Effort changes keep the cache on Opus 5.5, Sonnet 5.5, Haiku 5.5 and Fable 5.1 with an API key or a subscription, so these models get no note on any provider – on Amazon Bedrock, Google Cloud's Agent Platform or a gateway the change does split the cache, and the Health tab names it afterwards ([prompt-caching › Changing effort level](https://code.claude.com/docs/en/prompt-caching#changing-effort-level)). Fast mode is not observable for a mod |
| Before the cache expires (option [`expiryNotice`](#configuration), off by default) | One terminal notification per cache window, about 10 minutes before a one-hour cache expires, while keepwarm is off: *Prompt cache expires in 10m – the next prompt would re-write 148.0k tokens. Type /keepwarm to keep it.* It goes through your own notification channel (Claude Code's `preferredNotifChannel` setting – the terminal's own notification or just a bell, which shows no text) and your `Notification` settings hooks |

**Pane `/tokens`** – the dashboard with its Overview, Context and Health tabs, and `/tokens report` for a Markdown copy; see [above](#see-everything-with-tokens). The Context tab's *What the conversation holds* lists the tool results of the main conversation since the start or the last compact – by tool and the five largest, labelled with the file path or, for Bash, only the program name. The Overview's request chart draws one column per request: its height is the share not read from the cache, so a cold re-write stands out as a tall red column, a first write of the cache in blue.

**`/keepwarm [10m … 8h | off]`** – shortly before the cache would expire, sends one tiny request over your conversation (`$.model.fork`) so the cache stays warm while you are away. Stops by itself on a miss, at the end of the window, after 12 pings, or when the TTL is 5 minutes.

**Cold-rewrite hint** – after a break that let the cache expire, a toast suggests `/keepwarm` before the next break. Nothing is ever switched on automatically and no prompt is ever dropped.

## Requirements

- **Claude Code 2.1.287 or later** in the terminal, or 2.1.286 or later in the Code tab of the Desktop app (see [where mods run](https://code.claude.com/docs/en/plugins/mods/overview#where-mods-run)). Tested with **2.1.296**.
- Mods enabled – the default; see [turn mods on or off](https://code.claude.com/docs/en/plugins/mods/overview#turn-mods-on-or-off).
- In the VS Code extension and under `claude -p` the hooks run but nothing is drawn, and `/keepwarm` refuses to start.
- The Health tab's server-side tool calls (e.g. the advisor) need Claude Code 2.1.290 or later; earlier versions do not report them.

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
claude --plugin-dir /absolute/path/to/cache-meter   # for one session (the clone's absolute path)
```

To load the clone in every session, add its **absolute** path to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json` (paths separated by `:`; see [settings and environment variables](https://code.claude.com/docs/en/plugins/mods/reference#settings-and-environment-variables)). Claude Code then loads the clone exactly as it is checked out – keep that checkout on `main` and develop in a separate worktree. While a copy named `cache-meter` is already loaded that way, `--plugin-dir` cannot load a second one (the first wins); see [CONTRIBUTING.md](CONTRIBUTING.md#set-up) for how to try a worktree.

> A mod runs with your permissions and is not sandboxed. Read [Privacy, cost and permissions](#privacy-cost-and-permissions) first; `claude plugin validate <dir>` lists every event a mod hooks and every call it makes ([decide whether to trust a mod](https://code.claude.com/docs/en/plugins/mods/overview#decide-whether-to-trust-a-mod)).

## Usage

| What | How |
|---|---|
| See cache and context | the band above the prompt, always on |
| Open the full view | `/tokens` – again to close; Esc at an empty prompt closes it above the prompt |
| Open a tab directly | `/tokens context`, `/tokens health`, `/tokens overview` (a prefix is enough: `/tokens h`) – switches an open pane instead of closing it |
| Switch tabs | `/tokens health` etc.; or press ctrl+x, then Tab (the pane gets the keys), then `1`–`3` – Esc hands the keys back; clicking a tab works only in Claude Code's fullscreen renderer, which captures the mouse |
| Count the context exactly | `x` or **Count exactly** in the Context tab – one API request per tool and memory file, as `/context` |
| Copy a session report | `/tokens report` – Markdown on the clipboard; the pane stays as it is. Paste it to check: some terminals drop clipboard writes without saying so |
| Pane beside the chat | `/tui fullscreen` (Claude Code's fullscreen renderer): from 110 columns the pane docks as a sidebar and stays open while you chat; `/tui default` switches back |
| Keep the cache warm | `/keepwarm` (2 h), `/keepwarm 30m` … `/keepwarm 8h`, also `/keepwarm 120m` – interactive sessions only |
| Stop keeping it warm | `/keepwarm off` (or `0`) – reports pings and tokens read |
| Compact | the `[ Compact ]` button in the band or the pane (between turns only) |

## Configuration

Four options. Set them with `/config` → `cache-meter.<option>`, or in `~/.claude/settings.json` under `pluginConfigs` → `"cache-meter@cache-meter"` (marketplace install) or `"cache-meter@inline"` (loaded with `--plugin-dir` or `CLAUDE_CODE_PLUGIN_DIRS`) → `options`.

| Option | Values | What it does |
|---|---|---|
| `cacheTtl` | `auto` (default), `60m`, `5m` | Which cache lifetime the countdown assumes – see below |
| `autoSidebar` | `auto` (default), `off` | `auto`: in Claude Code's fullscreen renderer (`/tui fullscreen`) the dashboard opens by itself as a sidebar at session start – from 144 terminal columns, 110 once you have opened it yourself – and stays closed once you close it. It never opens above the prompt by itself. `off`: only with `/tokens` |
| `turnLine` | `on` (default), `off` | The line under each answer with what it cost and how it used the cache. `off`: no line |
| `expiryNotice` | `off` (default), `on` | `on`: a terminal notification once per cache window when about 10 minutes are left and keepwarm is off – only with a one-hour TTL and at least 10k tokens of context. The Health tab shows how many were sent (a terminal does not confirm delivery), or why one was not (`disabled`, `no-channel`, …) |

With `auto`, Cache Meter follows Claude Code's own TTL controls and your plan state ([full order](docs/how-it-works.md#how-the-ttl-is-derived)). On an API key or a cloud provider Claude Code's default is five minutes: set `cacheTtl` to `5m`, or set `promptCacheTtl`.

## Privacy, cost and permissions

> [!NOTE]
> **Local and read-only.** Cache Meter never changes your prompts, answers or tool calls and never reads or keeps the text of your prompts or Claude's answers. Of a tool call it reads the tool's name, a short label (the file path, or a Bash command's program name – never its arguments) and the length of the result, to show what fills your context; the result's text is not kept. It writes nothing to disk and sends nothing on its own. Full details: [PRIVACY.md](PRIVACY.md) · [SECURITY.md](SECURITY.md).

| | | Source |
|---|---|---|
| **Reads** | What Claude Code reports to mods: token counts, model, stop reason and server-side tool calls of each request; context fill and its breakdown (Claude Code's free local estimate, including the paths of your CLAUDE.md files and the names of MCP servers, skills and agents); cost as `/cost` shows it; plan-limit percentages; number of prompts and the session's start time; API errors; of each tool call: the tool's name, a short label (file path, or a Bash command's program name) and the length of the result as the model reads it – for MCP tools also counted per server; the type and task description of each subagent, as `$.agent.list()` gives them; Claude Code's own verdict on the cache and its re-write estimate at model switches and resumes; whether the session is fullscreen. Plus the TTL controls `FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H` and the `promptCacheTtl` setting | The code ([`hooks/register.tsx`](hooks/register.tsx)); `claude plugin validate .` lists every event it hooks and every call it makes. Data sources: [events › Follow a turn](https://code.claude.com/docs/en/plugins/mods/events#follow-a-turn), [reference › Mods API methods](https://code.claude.com/docs/en/plugins/mods/reference#mods-api-methods) (`$.session.usage`, `$.session.turns`), [events › Handle the settings hook events](https://code.claude.com/docs/en/plugins/mods/events#hook-the-settings-hook-events) |
| **Keeps** | Everything in memory for the session only – gone when it ends and after `/clear`, `/resume` or `/branch`. Nothing on disk | [interface › Keep state](https://code.claude.com/docs/en/plugins/mods/interface#keep-state) (`$.state` lasts until the session ends or `/clear`, `/resume`, `/branch`); no `$.fs` or `$.store` call in the code – check with `claude plugin validate .` |
| **Sends** | Nothing on its own. Only when you ask: `/keepwarm` pings and **Count exactly** in the Context tab – through Claude Code, with your credentials, to the provider your session already uses. With `expiryNotice` on, a notification through your own notification channel – no server of the mod's | [api › Call a model](https://code.claude.com/docs/en/plugins/mods/api#call-a-model) (`$.model.fork` uses the session's credentials); `$.session.usage({ breakdown: 'full' })` sends token-count requests (type declaration `SessionUsageArgs`); no `$.http` or `$.process` call in the code; `$.ui.notify` goes through “the person's own notification channel, the one their `preferredNotifChannel` names” (type declaration) |
| **Costs** | Nothing, except `/keepwarm`: each ping reads your whole context at the model's cache-read price – billed like any request on an API key, counted against your limits on a plan. How cache reads count towards the 5-hour and weekly limits is **not documented**; watch them in the pane. **Count exactly** uses token counting, which is free on the API; whether Claude Code counts it against plan limits is **not documented** | [pricing › Prompt caching](https://platform.claude.com/docs/en/about-claude/pricing#prompt-caching) (cache read 0.1×, 0.05× or 0.025× of the input price); [api › Call a model](https://code.claude.com/docs/en/plugins/mods/api#call-a-model) (“bill to the user's plan, API key, or cloud provider”); [token counting › Pricing and rate limits](https://platform.claude.com/docs/en/build-with-claude/token-counting#pricing-and-rate-limits) (“free to use”) |

<details>
<summary><b>Every hook and what it does</b> – it answers only its own commands and draws only its own band and pane; everything else passes on unchanged</summary>

| Event | What Cache Meter does there | What it changes |
|---|---|---|
| `session.start` | Registers `/tokens` and `/keepwarm`, starts its 15-second timer, takes a first reading | Nothing |
| `classic.SessionStart` (after `/clear`, `/resume`, `/branch`) | Reloads the TTL controls and the reading; on a resume continues the countdown and records Claude Code's verdict on the cache | Nothing – passes the event on with `next(e)`; it adds no context and no instructions |
| `turn.step` | Reads each request's token counts, model, effort, stop reason and server-side tool calls; before a main request that splits a warm cache it shows a note; after a warm miss it names the cause (a fresh, free context estimate shows a changed tool set); sums each subagent's requests and looks up its type and task once (`$.agent.list`) | Nothing – the request and its result go through as they are |
| `classic.StopFailure` | Counts the kind of API error a turn ended on | Nothing |
| `turn.start` | Notes the session cost when a turn starts, for the line under its answer | Nothing |
| `turn.complete` | Notes that no main request is running (so `/keepwarm` never pings during one); returns the line shown under the answer (option `turnLine`) | The answer itself is not changed – the line is shown beneath it ([reference › Turns](https://code.claude.com/docs/en/plugins/mods/reference#turns)) |
| `tool.call` | After the call ran: counts MCP calls per server, and for the main conversation estimates the result's size (characters ÷ 4 of the text the model reads) under a short label – file path, or a Bash command's program name. The text itself is not kept | Nothing – the call, its input and its result pass through unchanged; it never denies or answers a call |
| `session.measure` | Reads context fill, plan limits, cost and the context breakdown | Nothing |
| `session.compact` | After a real compaction, resets the countdown, since the next request writes a fresh cache, and the tool-result tally, since the summary replaced those results. The same name is the call `$.session.compact` that the **Compact** button makes; the hook sees every compaction, whoever starts it | Nothing – it never skips or alters a compaction |
| `classic.PreModelSwitch` | While the cache is warm, shows a note with Claude Code's re-write estimate and the time the cache has left | Nothing – it returns no decision, so Claude Code's own confirmation and your settings hooks decide as without it |
| `classic.PostModelSwitch` | Records the cache TTL, the re-write estimate and Claude Code's verdict on the cache | Nothing |
| `command.run` (`/tokens`, `/keepwarm` only) | Answers its own two commands; `/tokens report` puts a Markdown report on the clipboard (`$.ui.copy`) and prints only a confirmation | Other commands are not matched |
| `prompt.submit` | Closes its own pane above the prompt when you send a prompt | Nothing – the prompt is not read, changed or dropped |
| `ui.close` | Notes that you closed its pane, so it doesn't reopen | Nothing – it never keeps a pane open |
| `ui.render` (band, its own pane) | Draws the band – keeping what other mods draw below it – and the `/tokens` pane | Only its own drawing |

`claude plugin validate .` prints this list for the version you have.
</details>

## FAQ

### Cost

<details>
<summary><b>Does it cost anything?</b></summary>

Only what you start yourself. A `/keepwarm` ping reads your context at the cache-read price – about 1/20 of re-writing it after expiry (1/40 on Opus 5.5 and Sonnet 5.5, 1/80 on Fable 5.1 and Mythos 5.1), at most 12 pings per run. On an API key that is billed like any request, on a plan it counts against your limits. **Count exactly** uses free token counting. Everything else costs nothing.
</details>

<details>
<summary><b>Does “API value” mean I am paying that?</b></summary>

Not on a subscription: it is what the same session would cost on an API key, as `/cost` computes it – a comparison. Your plan's usage is the 5-hour and weekly limits in the pane. On an API key or a cloud provider the band says `spent` instead, because there it is real cost. Cache Meter tells the two apart by whether Claude Code reports plan limits.
</details>

<details>
<summary><b>Does <code>/keepwarm</code> really keep the cache alive?</b></summary>

A cache read keeps the entry for the duration of its original write – one hour for the main conversation ([pricing](https://platform.claude.com/docs/en/about-claude/pricing#prompt-caching)). Check it on your setup with `/usage` after a break (see [above](#keep-the-cache-warm-with-keepwarm)).
</details>

### Using it

<details>
<summary><b>How do I share what a session cost?</b></summary>

`/tokens report` puts a Markdown summary on your clipboard: cost, hit rate, cold re-writes and warm misses with their cause, context fill and the auto-compact forecast, the heaviest files, servers and tool results, subagents and plan limits. Paths are shortened to `~` and Bash commands appear only by program name; still, review it before you post it publicly.
</details>

<details>
<summary><b>Isn't this what <code>/usage</code> shows?</b></summary>

`/usage` reports the session's hit ratio and whether the cache is warm, when you ask. Cache Meter shows how long it stays warm, all the time, per request, with history – and can keep it warm.
</details>

<details>
<summary><b>Why does the pane sit above the prompt and not beside the chat?</b></summary>

Claude Code places it, not the mod: beside the chat only in its fullscreen renderer (`/tui fullscreen`) from 110 columns, otherwise above the prompt – there your next prompt closes it so it doesn't take rows from the conversation. In fullscreen it opens as a sidebar by itself at session start; set `autoSidebar` to `off` to stop that.
</details>

<details>
<summary><b>Does it read or change my prompts?</b></summary>

No. It hooks model requests only to read their token counts, stop reasons and server-side tool calls, and notes that you sent a prompt without reading it. Of tool calls it reads the name, a short label and the result's length – not to keep the content, but to show what fills your context. The line under an answer is shown beneath it; the answer is not changed. See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) for everything it can reach.
</details>

### Setup

<details>
<summary><b>Does it work with an API key or a cloud provider?</b></summary>

Yes. Claude Code's default TTL there is five minutes; set `cacheTtl` to `5m` (see [Configuration](#configuration)). `/keepwarm` is disabled at a five-minute TTL.
</details>

<details>
<summary><b>Where does it work?</b></summary>

In the Claude Code terminal and the Code tab of the Desktop app. In the VS Code extension and under `claude -p` it runs but draws nothing.
</details>

<details>
<summary><b>How do I remove it?</b></summary>

`claude plugin uninstall cache-meter@cache-meter`.
</details>

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
