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

A live countdown above the prompt: minutes until the cache expires, the hit rate, how full the context is. **Under every answer, what it cost.** A **heads-up before a switch re-writes the cache**, a pulse in the last minutes – and an optional **session budget** that warns at 80 %.

</td>
<td width="33%" valign="top">

### ☕ Keep it

Type **`/keepwarm`** before lunch or a meeting. Shortly before expiry one ping – your conversation sent once more and billed as a cache read – keeps the cache alive – its cache read about **1/20 of a re-write or less** (1/40 on Opus 5.5), with hard limits so it never runs away. Every ping flashes a heartbeat in the band, so you see it working. **Never think about it again:** `/keepwarm auto` once, and every break of the session stays warm by itself. Forgot? An optional **notification** from your terminal reminds you ten minutes before the cache expires.

</td>
<td width="33%" valign="top">

### 📊 Understand it

**`/tokens`** opens a dashboard: **why a warm cache broke**, what caching saved, **which tool results and files fill your context** (and which MCP servers you never call), when auto-compact and your plan limit hit at this pace, what each subagent used, API errors and cost per hour. **`/tokens report`** copies it all as Markdown.

</td>
</tr>
</table>

<p align="center"><img src="https://raw.githubusercontent.com/florian101010/cache-meter/assets/brand/feature-why.svg" width="100%" alt="Why Cache Meter – stop wasting tokens: a re-write after a break costs about $1.20 for a 150k-token conversation on Opus 5.5 at API prices, a keepwarm ping about $0.03. Twelve everyday problems it solves follow."></p>

## Why you'll want it

| | The problem | What Cache Meter does | How |
|:-:|---|---|---|
| ☕ | **“Back from lunch, the first answer takes ages – and re-writes everything.”** | Keeps the cache warm through the break – a ping reads the cache for **1/20 of a re-write or less** | [`/keepwarm`](#keep-the-cache-warm-with-keepwarm) |
| 🔁 | **“I always forget to type it before a break.”** | Covers **every** break of the session by itself – only while you are away | [`/keepwarm auto`](#every-break-by-itself-keepwarm-auto) · opt-in |
| ⏱️ | **“When does my cache run out?”** | A live **countdown**, the hit rate and the context fill, always in view | [band above the prompt](#what-you-see) |
| 💸 | **“What did that answer just cost?”** | The cost **under every answer**, the session total, a warning at your budget | [automatic](#every-answer-priced) · `sessionBudget` |
| ⚠️ | **“A model switch silently re-wrote everything.”** | A heads-up **before** a switch splits a warm cache – with Claude Code's own re-write estimate at a model switch | [automatic](#warned-before-the-cache-breaks) |
| 🔍 | **“The cache was cold – but why?”** | Names the likely **cause** of a warm miss | [`/tokens health`](#see-everything-with-tokens) |
| 🧱 | **“My context fills up so fast.”** | Shows **what** fills it – tool results, files, MCP servers (also unused ones), skills and agents | [`/tokens context`](#see-everything-with-tokens) |
| 📄 | **“One file read flooded the context.”** | Says so the moment a single result is **≥ 10k tokens** (and ≥ 2 % of the window) | [automatic](#a-word-when-it-matters) |
| 📈 | **“Will I hit my plan limit before it resets?”** | Forecasts it and warns **once** when a limit is half used and on course to fill | [automatic](#a-word-when-it-matters) · `limitNotice` |
| 🗜️ | **“Auto-compact always comes as a surprise.”** | Shows **where** it triggers and about how many prompts are left | band · [`/tokens`](#see-everything-with-tokens) |
| 📋 | **“I need these numbers in a ticket.”** | Copies your **session stats** – cost, cache, context, limits – as Markdown. Never your conversation | [`/tokens report`](#copy-your-session-stats-as-markdown) |
| 🪟 | **“I want it beside the chat, not above the prompt.”** | Docks as a **sidebar** in Claude Code's fullscreen renderer | [`/tui fullscreen`](#quickstart) |

**Local and read-only:** never reads your prompts' text, writes nothing to disk, sends nothing you have not switched on – details in [Privacy, cost and permissions](#privacy-cost-and-permissions).

**New in 0.6–0.12:** `/keepwarm auto` – every break covered by itself · a word when one tool result floods the context · plan-limit warnings · what the conversation came to after `/clear` · a barista who acts out your cache · cost under every answer · warnings before a switch re-writes the cache · the cause of every warm miss · what fills your conversation · auto-compact forecast · per-subagent use · expiry notification · session budget · live last minute and keepwarm heartbeat · a flash at each new minute · hover details · `/tokens report`. → [changelog](CHANGELOG.md)

## Quickstart

**1 · Install** – in your shell (Claude Code 2.1.292 or later for this command):

```bash
claude plugin install cache-meter --marketplace florian101010/cache-meter --scope user
```

On an older Claude Code, type `/plugin install cache-meter --marketplace florian101010/cache-meter` in a session instead.

Or let Claude Code do it – paste this into a session (it runs the same command; Claude Code may ask you to approve it):

```text
Install the Claude Code mod from https://github.com/florian101010/cache-meter – follow its AGENTS.md.
```

**2 · Start a new session and ask anything.** Under the answer a line shows what it cost; the band above the prompt shows the cache countdown, hit rate and context.

**3 · Open the dashboard: `/tokens`.** `/tokens context` shows which tool results, files and servers fill your context; `/tokens` again closes it.

> [!TIP]
> **Want the dashboard as a sidebar beside the chat?** Run **`/tui fullscreen`** – Claude Code's fullscreen renderer docks the pane next to the transcript from 110 columns, and it stays open while you chat (mouse clicks work there too). In the classic renderer the pane opens above the prompt instead, and says so in a tip line. The switch relaunches Claude Code with your conversation intact; Cache Meter's figures start over. `/tui default` switches back.

**4 · Before your next break: `/keepwarm`** – or **`/keepwarm auto`** once, and every break this session is covered by itself. After the break, check that the next answer reads from the cache (hit rate in the band). `/tokens report` copies your session stats as Markdown – never your conversation.

| Command | Does |
|---|---|
| `/tokens` · `/tokens context` · `/tokens health` | the dashboard, or one tab of it; `/tokens` again closes it, a tab name switches an open pane |
| `/tui fullscreen` | the dashboard as a sidebar beside the chat (from 110 columns) |
| `/keepwarm` · `/keepwarm 10m`…`8h` · `/keepwarm off` | keep the cache warm through a break, with hard limits |
| `/keepwarm auto` (or `/keepwarm-auto`) | keep it warm through every break this session, by itself – it pings on its own once on |
| `/tokens report` | your session stats as Markdown on your clipboard – never the conversation |

Safe by design: it never changes your prompts, answers or tool calls, never keeps their text and writes nothing to disk. It sends nothing you have not switched on – the `/keepwarm` pings (with `/keepwarm auto`, on their own during every break) and, if you press **Count exactly**, the token counts `/context` would make; with the options `expiryNotice` or `limitNotice` on, a notification through your own terminal. Free and MIT-licensed.

## What you see

The band above the prompt, always there:

![The band above the prompt: cache 56m with a green countdown bar, 98% hit, context 11%, auto-compact at 97%, API value $0.48 and a Compact button, above the prompt and Claude Code's status line](https://raw.githubusercontent.com/florian101010/cache-meter/assets/screenshots/v0.9/band.webp)

`/tokens` – the dashboard, here as a sidebar beside the chat (Claude Code's fullscreen renderer):

<img src="https://raw.githubusercontent.com/florian101010/cache-meter/assets/screenshots/v0.9/full-overview.webp" width="100%" alt="Claude Code on a Mac in the fullscreen renderer: the conversation on the left, and docked on the right the /tokens dashboard – a big 59-minute countdown marked WARM with a 98% hit rate, the keepwarm card, context at 11% of 1.0M, the session with 44% saved by caching and plan limits at 12% and 39%, and the request chart from 20:09 to 20:22">

> **What is a Claude Code mod?** A mod is a Claude Code plugin whose TypeScript hooks run *inside* Claude Code: it can draw above the prompt, open panes, add slash commands and react to events such as each model request. See the official [mods overview](https://code.claude.com/docs/en/plugins/mods/overview). Cache Meter is a mod only – no skills, no MCP server, no settings hooks.

> **For AI coding agents:** start with **[AGENTS.md](AGENTS.md)** – what the mod does, how to install it for a user, how to verify and test it, and the rules for changing it, on one page. Machine-readable index: [llms.txt](llms.txt).

<p align="center"><img src="https://raw.githubusercontent.com/florian101010/cache-meter/assets/brand/feature-cost.svg" width="100%" alt="See it – every answer, priced: under an answer the line ≈ $0.42 API value · 97% from cache types in, and a session budget bar fills and turns amber at 82 %."></p>

## Every answer, priced

Under each answer one line says what it cost and how it used the cache:

```text
◉ Cache Meter · ≈ $0.42 API value · 3 requests · 97% from cache · 6.0k written to cache
```

The band above the prompt keeps the session's total – *API value* on a subscription (what an API key would pay), *spent* on an API key. Set a [`sessionBudget`](#configuration) and it reads `spent $4.10 of $5.00`, turns yellow at 80 % and red at 100 %, with a toast at each.

<p align="center"><img src="https://raw.githubusercontent.com/florian101010/cache-meter/assets/brand/feature-warn.svg" width="100%" alt="Before it breaks – warned in time: a model switch from opus to sonnet raises a card “Model switch re-writes 148.0k tokens (≈ $1.18), cache warm 42m more”, and a bell rings."></p>

## Warned before the cache breaks

A switch while the cache is warm re-writes the whole conversation. Cache Meter says so **before it costs you**:

- **`/model`** – next to Claude Code's own confirmation: *Model switch re-writes 148.0k tokens to the cache (≈ $1.18) · cache warm 42m more – after it expires, switching adds nothing*
- **A request with another model or effort** – a skill with its own model, `opusplan`, an effort change on a model where it splits the cache – the moment it goes out.
- **Before the cache expires** – an optional notification from your terminal ten minutes ahead, so you can still type `/keepwarm` (option [`expiryNotice`](#configuration)).
- **And afterwards** – if a warm cache was re-written anyway, the Health tab names the likely cause: model, effort, tool set, a shorter real TTL.

It never blocks, approves or delays anything.

<p align="center"><img src="https://raw.githubusercontent.com/florian101010/cache-meter/assets/brand/feature-keepwarm.svg" width="100%" alt="Keep it – /keepwarm: the countdown ring drains towards the ping mark, a ping flashes, “ping ok · 148k read” appears, and the ring fills again."></p>

## A word when it matters

Cache Meter speaks up only with figures it measured – no guessed savings:

| When | What you see |
|---|---|
| One tool result floods the context (≥ 10k tokens and ≥ 2 % of the window) | `Read ~/src/big.ts put ≈ 50.0k tokens into the context – sent again with every request until /compact` – the size is an estimate (characters ÷ 4); at most one such toast per 20 seconds |
| A plan limit is half used and, at this pace, full before it resets | `5 hours limit at 60% – full ≈ 18:40 at this pace (resets Mon 20:00)` – once per window; a notification too with `limitNotice` |
| The conversation's messages are a quarter of the context or more (≥ 20k) | in the Context tab: `Messages 60.0k (30% of the context) are sent again with every request – /compact summarizes them to free space, itself one large request` |
| An MCP server's tools ride along with every request | in the Context tab, beside each server: its share of each request, and `unused so far` after three prompts without a call |
| You `/clear` | `Conversation cleared – it came to $1.50 spent · 12 requests · 94% from cache` – only what that conversation measured (after `/resume`: *since you resumed it*; after a reload mid-conversation without the cost) |
| The dashboard opens above the prompt in a terminal | a tip in the reply and on the Overview: `/tui fullscreen puts this beside the chat as a sidebar` (in fullscreen: a window of 110 columns or more) |
| A break outlasts `/keepwarm auto`'s window | `Keepwarm auto: break longer than 2h – the cache may expire; on again with your next answer` |

## Keep the cache warm with `/keepwarm`

Before you step away, type:

```text
/keepwarm          # 2 hours
/keepwarm 4h       # any window from 10m to 8h
/keepwarm auto     # every break this session, by itself (breaks up to 2h; auto 4h for longer)
/keepwarm off      # stop early – also stops auto
```

The band shows `↻` while it runs. Whenever 10 minutes or less of the one-hour TTL are left and no request is running, Cache Meter sends one request over your conversation – billed as a cache read, plus its short answer – (`$.model.fork`, answer: `warm`). It reads the cached context, and a cache read keeps the entry alive for the duration of the original write – one hour for the main conversation ([pricing › prompt caching](https://platform.claude.com/docs/en/about-claude/pricing): cache read, *"same duration as the preceding write"*). That is roughly one ping every 50 minutes.

**What it costs, compared with letting the cache expire** (multipliers of the base input price, from the [pricing page](https://platform.claude.com/docs/en/about-claude/pricing)):

| | Re-write after expiry (1-hour cache write) | One ping (cache read) | Pings that cost as much as one re-write |
|---|---|---|---|
| Most models | 2× | 0.1× | ≈ 20 |
| Claude Opus 5.5, Claude Sonnet 5.5 | 2× | 0.05× | ≈ 40 |
| Claude Fable 5.1, Claude Mythos 5.1 | 2× | 0.025× | ≈ 80 |

Each ping also pays for its few uncached tokens and its answer – one word, plus any thinking the model does first: a fork repeats the main thread's last request (model, system prompt, tools) and takes no output cap (types: `ModelForkRequest` has only a prompt), so at a high effort level that thinking is billed as output. The table's break-even is therefore an upper bound. On a subscription these are shares of your plan limits rather than dollars; how cache reads count towards the 5-hour and weekly limits is not documented, so watch the limits in `/tokens`.

**Safety limits** – keepwarm switches itself off, with a toast, when:

- a ping reads less than half of the context, nothing at all, or writes 10 % or more of what it read (the cache was not what it should be, so further pings would be full re-writes);
- 12 pings are done, the window ends, the cache is empty or expired, or a ping gets no answer;
- the TTL is five minutes (API key, cloud provider, or a plan limit reached) – it refuses to start there.

It runs only in interactive sessions, never drops a message, and after an expensive cold re-write it only *suggests* `/keepwarm` – it never switches itself on.

**Check that it works on your setup:** 10–50 minutes after a ping, run `/usage` – the *Prompt cache (main)* line should say warm – or watch the hit rate of your next request in the band.

<p align="center"><img src="https://raw.githubusercontent.com/florian101010/cache-meter/assets/brand/feature-auto.svg" width="100%" alt="Every break – /keepwarm auto: on a timeline, prompts keep the cache bar full while you work; during a two-hour break it drains to the ping mark, two pings refill it, and when you are back a chip says cache warm."></p>

## Every break, by itself: `/keepwarm auto`

**You no longer have to remember `/keepwarm`.** Type `/keepwarm auto` once, and every coffee break, call or long read of this session finds the cache still warm when you come back – no re-write, no waiting for the first answer to rebuild it.

```text
/keepwarm auto        # every break up to 2 hours
/keepwarm auto 4h     # longer breaks (10m to 8h)
/keepwarm off         # stop
```

It is also listed as `/keepwarm-auto` in the slash-command menu.

**How it knows you are away:** each prompt you send and each answer moves the window to *now + 2 hours*. While you work no ping is needed – every request refreshes the cache. Once you have been away long enough for the cache to near expiry – lunch, a call, a long read – the same ping as above goes out; your next prompt ends the break.

- **What it costs:** the same ping, only when you are away. A two-hour break at the one-hour TTL is two pings – about **$0.06** for a 150k-token conversation on Opus 5.5 at API prices, against **$1.20** for the re-write ([costs above](#keep-the-cache-warm-with-keepwarm)).
- **It pings on its own once on** – that is the point of it, and the only request Cache Meter sends without you asking each time. Nothing is written to disk: it is on for this session only, stays on through `/clear`, `/resume` and `/branch` (the setting is kept in memory, where other loaded mods could read it), and is off again in the next session or after a relaunch (`/tui`). It starts only on your own command – typed, or sent from your phone through Remote Control – never on another mod's.
- **Limits:** at most 12 pings per break (an 8-hour break at the one-hour TTL is about nine). A break longer than the window lets the cache go with a toast, and the next answer covers the next break. A miss, an unanswered or refused ping, or a 5-minute TTL switches auto off for good; a fixed `/keepwarm 2h` replaces it. What happened while you were away is said again at your next prompt.
- **See it:** the keepwarm card reads *Keepwarm auto · breaks up to 2h*, with the pings of this break and in all; `/keepwarm off` (or **Stop** in the card) ends it and reports the pings.

<p align="center"><img src="https://raw.githubusercontent.com/florian101010/cache-meter/assets/brand/feature-tokens.svg" width="100%" alt="Understand it – /tokens: request columns grow, a tall red one is a warm miss, and its tooltip says “148.0k written · effort high → medium · splits the cache”."></p>

## See everything with `/tokens`

`/tokens` opens the dashboard, `/tokens` again closes it. Three tabs, each answering its own question, and a report to take along:

| Tab | What it answers | Open with |
|---|---|---|
| **Overview** | How long is the cache still warm? Did the last requests hit it? What did caching save? How many prompts until auto-compact? How close are my plan limits – and when are they full at this pace? | `/tokens` |
| **Context** | What fills my context – which tool results (by tool, and the largest single ones), CLAUDE.md files, MCP servers (and how often this session called each), skills, agents? | `/tokens context` |
| **Health** | Did requests fail or get cut off? How long does the advisor take? What does the session cost per hour and per prompt? Was a warm cache re-written anyway – and why? What did each subagent use? | `/tokens health` |
| **Report** | Everything above as Markdown on the clipboard – to share, file or compare | `/tokens report` |

<p>
<img src="https://raw.githubusercontent.com/florian101010/cache-meter/assets/screenshots/v0.9/overview.webp" width="32%" alt="The Overview tab: countdown 59 minutes WARM, hit 98%, keepwarm off with a 'Keep warm 2h' button, context 11%, session with cache saved 44%, plan limits and the request chart">
<img src="https://raw.githubusercontent.com/florian101010/cache-meter/assets/screenshots/v0.9/context.webp" width="32%" alt="The Context tab: context 11%, where it goes by category with messages and memory files largest, and the heaviest items – CLAUDE.md files, MCP servers, skills and agents">
<img src="https://raw.githubusercontent.com/florian101010/cache-meter/assets/screenshots/v0.9/health.webp" width="32%" alt="The Health tab: session age, prompts and requests, cost as API value per hour and per prompt, tokens per prompt, stops and errors, and Claude Code's cache check">
</p>

<details>
<summary>The Context and Health tabs in the full terminal</summary>

<img src="https://raw.githubusercontent.com/florian101010/cache-meter/assets/screenshots/v0.9/full-context.webp" width="100%" alt="Claude Code in the fullscreen renderer with the /tokens dashboard docked on the Context tab">
<img src="https://raw.githubusercontent.com/florian101010/cache-meter/assets/screenshots/v0.9/full-health.webp" width="100%" alt="Claude Code in the fullscreen renderer with the /tokens dashboard docked on the Health tab">
</details>

### A barista who keeps an eye on your cache

Docked beside the chat, the free room under the request chart becomes a small café – a pixel barista – orange, with a brown cap and a white apron – and a cup act out the cache, four frames a second:

| The cache | The café |
|---|---|
| Claude is working | the barista stirs |
| fresh cache written | coffee drips into the cup |
| no answer yet | an empty cup |
| warm | steam rises, the barista takes a sip now and then |
| last stretch | the steam thins out, the barista watches the clock |
| keepwarm ping | a puff of steam – topped up |
| cold | the cup goes grey, the barista naps |

Small touches go with it, each a fraction of a second: the big countdown flashes and a shine runs over its bar at each new minute; a new request column grows in from below; cost and the cache saving count up to a new figure; and while keepwarm runs, its arrow turns. All of it shows only while the Overview is on screen, never in the band, and stops with the option `animations` set to `off`. The café and the turning arrow are separate files that get nothing but the cache's state word (the arrow not even that): they have no mods API (types: `ClientSurface`), and their code makes no other call.

**Where it shows.** In Claude Code's classic renderer the pane sits above the prompt – a tip line says how to get it beside the chat – and your next prompt closes it so the conversation keeps its room. In the fullscreen renderer (`/tui fullscreen`) it docks beside the chat as a sidebar, opens there by itself at session start (option [`autoSidebar`](#configuration)) and stays open while you work – and there it takes the mouse: click the tabs and buttons, scroll with the wheel, point at the request chart. **Keys, either way:** <kbd>Ctrl</kbd>+<kbd>X</kbd>, then <kbd>Tab</kbd> gives the pane the keyboard (it turns orange), <kbd>1</kbd>–<kbd>3</kbd> switch tabs, <kbd>↓</kbd> / <kbd>Page Down</kbd> scroll, <kbd>Esc</kbd> hands the keys back.

**Switching tabs.** `/tokens context` or `/tokens health` – a prefix is enough; after `/tokens ` Claude Code shows the tab names and `report` as a hint. Or click a tab (fullscreen renderer), or press <kbd>Ctrl</kbd>+<kbd>X</kbd>, then <kbd>Tab</kbd> until the pane turns orange (*keys here*), then `1`–`3`.

**Where the numbers come from.** Everything is what Claude Code reports to mods – token counts per request, context breakdown, cost, plan limits, stop reasons, errors. Tool-result sizes are estimates (characters ÷ 4 of the text the model reads), shown beside Claude Code's own total for all messages. Showing them sends nothing: only **Count exactly** in the Context tab asks the API to count tokens, once, when you press it (what `/keepwarm` sends is under [Privacy, cost and permissions](#privacy-cost-and-permissions)).

### Copy your session stats as Markdown

<p align="center"><img src="https://raw.githubusercontent.com/florian101010/cache-meter/assets/brand/feature-report.svg" width="100%" alt="Copy it – /tokens report: your session stats as a Markdown report fill line by line and land on your own clipboard with a check mark – never your conversation."></p>

`/tokens report` puts your session stats on your clipboard as Markdown – figures and labels, never a word of your prompts or Claude's answers: cost, hit rate, cold re-writes and warm misses with their cause, context fill and the auto-compact forecast, the heaviest files, servers and tool results, subagents and plan limits. Paste it into an issue, a pull request or your notes. Paths are shortened to `~` and Bash commands appear only by program name; each subagent's task description – a line Claude wrote when it started the subagent – is included as it is. Review it before you post it publicly.

It stays with you: the report goes only to your own clipboard – the one of the device your terminal runs on. The Health tab's Session card reminds you: *copy as Markdown: /tokens report*.

## Contents

- [Why you'll want it](#why-youll-want-it)
- [Quickstart](#quickstart)
- [Every answer, priced](#every-answer-priced)
- [Warned before the cache breaks](#warned-before-the-cache-breaks)
- [Keep the cache warm with `/keepwarm`](#keep-the-cache-warm-with-keepwarm)
- [Every break, by itself: `/keepwarm auto`](#every-break-by-itself-keepwarm-auto)
- [See everything with `/tokens`](#see-everything-with-tokens) · [Copy your session stats as Markdown](#copy-your-session-stats-as-markdown)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation) · [Update](#update)
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
| `● cache 42m` | Time left until the main conversation's prompt cache expires. Green = warm, yellow = 17 % of the TTL or less – then the dot pulses once a second and the last minute counts in seconds – red = `expired` / `empty` |
| `■■■■■` | The same as a bar – dim cells are the time already gone (up to 20 cells; shrinks to make room on narrow terminals and is dropped last) |
| `93% hit` | Cache hit rate of the last main request = read ÷ (new + read + written) |
| `☀ context 9%` | Context fill against the model's window, refreshed after every request; the symbol tracks the distance to the auto-compact point (☀ ☁ ☂ ☇ ↯) |
| `(auto-compact 97%)` | Where auto-compact triggers, on the same scale (`off` when disabled) |
| `· API value $1.10` | On a subscription: what the session would cost on an API key – a comparison, Claude Code's own figure as `/cost` shows it. On an API key or a cloud provider it reads `· spent $1.10`. With a [`sessionBudget`](#configuration) it reads `· spent $1.10 of $5.00`, yellow from 80 %, red from 100 %. Hidden at $0 without a budget, dropped first on narrow terminals |
| `↻` | `/keepwarm` is running (with `/keepwarm auto`: whenever its window is open, i.e. almost always while you work); after each ping it lights up for five seconds with `· ping ok · 148.0k read` |
| `· rewrite ≈ …` | When the cache has expired: what the next request will re-write (in $ when Claude Code estimated it, otherwise in tokens) |
| `· cold: good time to` | Before `[ Compact ]` when the cache has expired and the context is half full or more: the next prompt re-writes everything anyway, so compacting now loses no warm cache (it still reads the context once) |
| `· /keepwarm?` | In the last stretch while keepwarm and `/keepwarm auto` are off: a reminder that `/keepwarm` would keep the cache warm through a break |
| `[ Compact ]` | Runs `/compact`; hidden while a turn is running, and while the `/tokens` pane is open (it has its own, `c`) – so <kbd>Ctrl</kbd>+<kbd>X</kbd> <kbd>Tab</kbd> usually lands in the pane at once (measured with 2.1.296) |

Four more places, only when there is something to say:

| Where | What |
|---|---|
| Under each answer | `◉ Cache Meter · ≈ $0.42 API value · 3 requests · 97% from cache · 6.0k written to cache` – what the session cost rose by during this answer (subagents it started count; `spent` on an API key; no cost under half a cent), its model requests and how they used the cache. Option [`turnLine`](#configuration) |
| At a model switch | While the cache is warm, Claude Code asks you to confirm a `/model` switch. Cache Meter adds a note with Claude Code's own estimate and the time left: *Model switch re-writes 148.0k tokens to the cache (≈ $1.18) · cache warm 42m more – after it expires, switching adds nothing.* It never blocks or approves a switch |
| When a request splits the cache | While the cache is warm, a request that changes what the cache is keyed on – the model for one turn (a skill or command that names its own, `opusplan`), or the effort level on a model where that splits it – gets a note the moment it goes out: *This request re-writes 148.0k tokens to the cache: effort high → medium.* Effort changes keep the cache on Opus 5.5, Sonnet 5.5, Haiku 5.5 and Fable 5.1 with an API key or a subscription, so these models get no note on any provider – on Amazon Bedrock, Google Cloud's Agent Platform or a Claude apps gateway, with `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` set or under a HIPAA configuration, the change does split the cache, and the Health tab names it afterwards ([prompt-caching › Changing effort level](https://code.claude.com/docs/en/prompt-caching#changing-effort-level)). Fast mode is not observable for a mod |
| Before the cache expires (option [`expiryNotice`](#configuration), off by default) | One terminal notification per cache window, about 10 minutes before a one-hour cache expires, while keepwarm is off: *Prompt cache expires in 10m – the next prompt would re-write 148.0k tokens. Type /keepwarm to keep it.* It goes through your own notification channel (Claude Code's `preferredNotifChannel` setting – the terminal's own notification or just a bell, which shows no text) and your `Notification` settings hooks |

**Pane `/tokens`** – the dashboard with its Overview, Context and Health tabs, and `/tokens report` for a Markdown copy; see [above](#see-everything-with-tokens). The Context tab's *What the conversation holds* lists the tool results of the main conversation since the start or the last compact – by tool and the five largest, labelled with the file path or, for Bash, only the program name. The Overview's request chart draws one column per request: its height is the share not read from the cache, so a cold re-write stands out as a tall red column, a first write of the cache in blue. In the fullscreen renderer, point at a column to see its time, tokens, hit rate, writes and output.

**`/keepwarm [10m … 8h | auto | off]`** – shortly before the cache would expire, sends one request over your conversation (`$.model.fork`, billed as a cache read) so the cache stays warm while you are away. Stops by itself on a miss, at the end of the window, after 12 pings, or when the TTL is 5 minutes. **`/keepwarm auto`** (also `/keepwarm-auto`) does it for every break of the session: the window moves with each prompt and answer, so it pings only once you have been away long enough – opt-in, and once on it pings on its own.

**Cold-rewrite hint** – after a break that let the cache expire, a toast suggests `/keepwarm` (or `/keepwarm auto`) before the next break. Nothing is ever switched on automatically and no prompt is ever dropped.

## Requirements

- **Claude Code 2.1.287 or later** in the terminal, or 2.1.286 or later in the Code tab of the Desktop app (see [where mods run](https://code.claude.com/docs/en/plugins/mods/overview#where-mods-run)). Tested with **2.1.296**. The café's fallback when its animation file fails (`ui.fault`) needs 2.1.289 or later.
- Mods enabled – the default; see [turn mods on or off](https://code.claude.com/docs/en/plugins/mods/overview#turn-mods-on-or-off).
- In the VS Code extension and under `claude -p` the hooks run but nothing is drawn, and `/keepwarm` refuses to start.
- The Health tab's server-side tool calls (e.g. the advisor) need Claude Code 2.1.290 or later; earlier versions do not report them.

## Installation

### From GitHub

In a Claude Code terminal session:

```text
/plugin install cache-meter --marketplace florian101010/cache-meter
```

Answer `y` to add the marketplace, then pick a scope. Or from your shell (Claude Code 2.1.292 or later – [cli-reference › plugin install](https://code.claude.com/docs/en/plugins/cli-reference)):

```bash
claude plugin install cache-meter --marketplace florian101010/cache-meter --scope user
```

Run `/reload-plugins` in an open session, or start a new one. `/plugin` then shows `… mod(s) active · cache-meter` (e.g. `1 mod active · cache-meter`). Details: [Install plugins](https://code.claude.com/docs/en/plugins/install).

### From a local clone

```bash
git clone https://github.com/florian101010/cache-meter.git
claude --plugin-dir /absolute/path/to/cache-meter   # for one session (the clone's absolute path)
```

To load the clone in every session, add its **absolute** path to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json` (paths separated by `:`; see [settings and environment variables](https://code.claude.com/docs/en/plugins/mods/reference#settings-and-environment-variables)). Claude Code then loads the clone exactly as it is checked out – keep that checkout on `main` and develop in a separate worktree. While a copy named `cache-meter` is already loaded that way, `--plugin-dir` cannot load a second one (the first wins); see [CONTRIBUTING.md](CONTRIBUTING.md#set-up) for how to try a worktree.

> A mod runs with your permissions and is not sandboxed. Read [Privacy, cost and permissions](#privacy-cost-and-permissions) first; `claude plugin validate <dir>` lists every event a mod hooks and every call it makes ([decide whether to trust a mod](https://code.claude.com/docs/en/plugins/mods/overview#decide-whether-to-trust-a-mod)).

### Update

New versions land on `main` – what changed is in the [changelog](CHANGELOG.md). A plugin from a third-party marketplace such as this one does **not** update by itself ([install › Keep plugins updated](https://code.claude.com/docs/en/plugins/install#keep-plugins-updated)):

```bash
claude plugin update cache-meter@cache-meter
```

or `/plugin` → **Installed** → Cache Meter → **Update now**. To update automatically from now on: `/plugin` → **Marketplaces** → `cache-meter` → **Enable auto-update**. The running session keeps its version; run `/reload-plugins` or start a new session. From a local clone: `git pull` in the clone, then `/reload-plugins`.

## Usage

| What | How |
|---|---|
| See cache and context | the band above the prompt, always on |
| Open the full view | `/tokens` – again to close; Esc at an empty prompt closes it above the prompt |
| Open a tab directly | `/tokens context`, `/tokens health`, `/tokens overview` (a prefix is enough: `/tokens h`) – switches an open pane instead of closing it |
| Switch tabs | `/tokens health` etc. – always works; or with the keyboard or the mouse, see the next two rows |
| Count the context exactly | `x` or **Count exactly** in the Context tab – one API request per tool and memory file, as `/context` |
| Keyboard in the pane | <kbd>Ctrl</kbd>+<kbd>X</kbd>, let go, then <kbd>Tab</kbd>: the pane takes the keys and its header and bottom line turn orange (the theme's accent colour) (*keys here*). Then `1`–`3` switch tabs, <kbd>↓</kbd> <kbd>↑</kbd> <kbd>Page Down</kbd> <kbd>Page Up</kbd> <kbd>End</kbd> <kbd>Home</kbd> scroll a tab that is taller than the pane, <kbd>Tab</kbd> + <kbd>Enter</kbd> walk and press the buttons, `w` keeps the cache warm for 2 h, `s` stops it, `x` counts the context exactly, `c` compacts. <kbd>Esc</kbd> hands the keys back to the prompt |
| Mouse | only in Claude Code's fullscreen renderer (`/tui fullscreen`), which captures the mouse: click a tab or a button, scroll a pane with the wheel (types: `ui.scroll`), point at a column of the request chart for its details. In the classic renderer the terminal keeps the mouse – use the keys |
| Copy a session report | `/tokens report` – Markdown on the clipboard; the pane stays as it is. Paste it to check: some terminals drop clipboard writes without saying so |
| Pane beside the chat | `/tui fullscreen` (Claude Code's fullscreen renderer): from 110 columns the pane docks as a sidebar and stays open while you chat; `/tui default` switches back |
| Keep the cache warm | `/keepwarm` (2 h), `/keepwarm 10m` … `/keepwarm 8h`, also `/keepwarm 120m` – interactive sessions only |
| Keep it warm through every break | `/keepwarm auto` (breaks up to 2 h) or `/keepwarm auto 4h` – also `/keepwarm-auto`; on for this session, pings on its own while you are away |
| Stop keeping it warm | `/keepwarm off` (or `0`) – stops auto too; reports pings and tokens read |
| Compact | the `[ Compact ]` button in the band, or `c` in the pane – the band hides its button while the pane is open (between turns only) |

## Configuration

Seven options. Set them with `/config` → `cache-meter.<option>`, or in `~/.claude/settings.json` under `pluginConfigs` → `"cache-meter@cache-meter"` (marketplace install) or `"cache-meter@inline"` (loaded with `--plugin-dir` or `CLAUDE_CODE_PLUGIN_DIRS`) → `options`.

| Option | Values | What it does |
|---|---|---|
| `cacheTtl` | `auto` (default), `60m`, `5m` | Which cache lifetime the countdown assumes – see below |
| `autoSidebar` | `auto` (default), `off` | `auto`: in Claude Code's fullscreen renderer (`/tui fullscreen`) the dashboard opens by itself as a sidebar at session start – from 144 terminal columns, 110 once you have opened it yourself – and stays closed once you close it. It never opens above the prompt by itself. `off`: only with `/tokens` |
| `turnLine` | `on` (default), `off` | The line under each answer with what it cost and how it used the cache. `off`: no line |
| `sessionBudget` | `0` (default, off) or dollars, e.g. `5` | A budget for one session, compared with the figure the band shows (spend on an API key, API value on a subscription): the band shows `of $5.00`, turns yellow at 80 % and red at 100 %, and a toast appears once at each. The Health tab shows the share |
| `expiryNotice` | `off` (default), `on` | `on`: a terminal notification once per cache window when about 10 minutes are left and keepwarm is off – only with a one-hour TTL and at least 10k tokens of context. The Health tab shows how many were sent (a terminal does not confirm delivery), or why one was not (`disabled`, `no-channel`, …) |
| `limitNotice` | `off` (default), `on` | `on`: a terminal notification through your own channel when a plan limit (5 hours, 7 days, spend limit) is at least half used and would be full before it resets at the pace since its window started (measured over at least 10 minutes) – once per window. The toast in Claude Code comes either way |
| `animations` | `on` (default), `off` | `on`: in the docked dashboard a small café under the request chart acts out the cache; on the Overview the countdown flashes and its bar shines at each new minute, new request columns grow in, cost and saving count up, and the keepwarm arrow turns while it runs. `off`: none of it – for a calm screen, or a terminal app that leaves traces when parts of the screen redraw |

With `auto`, Cache Meter follows Claude Code's own TTL controls and your plan state ([full order](docs/how-it-works.md#how-the-ttl-is-derived)). On an API key or a cloud provider Claude Code's default is five minutes: set `cacheTtl` to `5m` – or set Claude Code's `promptCacheTtl` to `1h` to give the main conversation a one-hour cache ([prompt caching › Choose the TTL yourself](https://code.claude.com/docs/en/prompt-caching#choose-the-ttl-yourself)); then `/keepwarm` works there too. One-hour cache writes cost 2× the input price instead of 1.25× ([pricing](https://platform.claude.com/docs/en/about-claude/pricing#prompt-caching)).

## Privacy, cost and permissions

> [!NOTE]
> **Local and read-only.** Cache Meter never changes your prompts, answers or tool calls, never reads your prompts and never keeps the text of Claude's answers. Of a tool call it reads the tool's name, a short label (a file tool's path, or a Bash command's program name – never its arguments, a URL or a token) and the length of the result, to show what fills your context; the result's text is not kept. It writes nothing to disk and sends nothing you have not switched on (with `/keepwarm auto` on, its pings go out by themselves during breaks). Full details: [PRIVACY.md](PRIVACY.md) · [SECURITY.md](SECURITY.md).

| | | Source |
|---|---|---|
| **Reads** | What Claude Code reports to mods: token counts, model, stop reason and server-side tool calls of each request; context fill and its breakdown (Claude Code's free local estimate, including the paths of your CLAUDE.md files and the names of MCP servers, skills and agents); cost as `/cost` shows it; plan-limit percentages; number of prompts and the session's start time; API errors; of each tool call: the tool's name, a short label (file path, or a Bash command's program name) and the length of the result as the model reads it – for MCP tools also counted per server; the type and task description of each subagent, as `$.agent.list()` gives them; Claude Code's own verdict on the cache and its re-write estimate at model switches and resumes; whether the session is fullscreen. Plus the TTL controls `FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H` and the `promptCacheTtl` setting | The code ([`hooks/register.tsx`](hooks/register.tsx)); `claude plugin validate .` lists every event it hooks and every call it makes. Data sources: [events › Follow a turn](https://code.claude.com/docs/en/plugins/mods/events#follow-a-turn), [reference › Mods API methods](https://code.claude.com/docs/en/plugins/mods/reference#mods-api-methods) (`$.session.usage`, `$.session.turns`), [reference › Settings hook events](https://code.claude.com/docs/en/plugins/mods/reference#settings-hook-events) |
| **Keeps** | Everything in memory for the session only – gone when it ends and when Claude Code relaunches (`/tui` switches renderer that way). The session state is reset by `/clear`, `/resume` and `/branch`; a few figures in the mod's own variables stay over them on purpose – which plan-limit windows were warned about, the budget level, the ended conversation's totals for the `/clear` toast, and whether `/keepwarm auto` is on (its break length). Nothing on disk | [interface › Keep state](https://code.claude.com/docs/en/plugins/mods/interface#keep-state) (`$.state` lasts until the session ends or `/clear`, `/resume`, `/branch`); no `$.fs` or `$.store` call in the code – check with `claude plugin validate .` |
| **Sends** | Nothing on its own until you switch it on. When you ask: `/keepwarm` pings and **Count exactly** in the Context tab – through Claude Code, with your credentials, to the provider your session already uses. Once you type `/keepwarm auto`, its pings go out by themselves whenever you have been away long enough, until `/keepwarm off`, a miss or the session ends. Once you switch them on, `expiryNotice` and `limitNotice` raise a notification by themselves – through your own notification channel and your `Notification` hooks, never to a server of the mod's | [api › Call a model](https://code.claude.com/docs/en/plugins/mods/api#call-a-model) (`$.model.fork` uses the session's credentials); `$.session.usage({ breakdown: 'full' })` sends token-count requests (type declaration `SessionUsageArgs`); no `$.http` or `$.process` call in the code; `$.ui.notify` goes through “the person's own notification channel, the one their `preferredNotifChannel` names” (type declaration) |
| **Costs** | Nothing, except what you start: the **Compact** button runs `/compact` (a summarisation request, as typing it would), and `/keepwarm`: each ping reads your whole context at the model's cache-read price – billed like any request on an API key, counted against your limits on a plan. How cache reads count towards the 5-hour and weekly limits is **not documented**; watch them in the pane. **Count exactly** uses token counting, which is free on the API; whether Claude Code counts it against plan limits is **not documented** | [pricing › Prompt caching](https://platform.claude.com/docs/en/about-claude/pricing#prompt-caching) (cache read 0.1×, 0.05× or 0.025× of the input price); [api › Call a model](https://code.claude.com/docs/en/plugins/mods/api#call-a-model) (“bill to the user's plan, API key, or cloud provider”); [token counting › Pricing and rate limits](https://platform.claude.com/docs/en/build-with-claude/token-counting#pricing-and-rate-limits) (“free to use”) |

<details>
<summary><b>Every hook and what it does</b> – it answers only its own commands and draws only its own band and pane; everything else passes on unchanged</summary>

| Event | What Cache Meter does there | What it changes |
|---|---|---|
| `session.start` | Registers `/tokens`, `/keepwarm` and `/keepwarm-auto`, starts its 15-second timer, takes a first reading | Nothing |
| `classic.SessionStart` (after `/clear`, `/resume`, `/branch`) | Reloads the TTL controls and the reading; on a resume continues the countdown and records Claude Code's verdict on the cache | Nothing – passes the event on with `next(e)`; it adds no context and no instructions |
| `turn.step` | Reads each request's token counts, model, effort, stop reason and server-side tool calls; before a main request that splits a warm cache it shows a note; after a warm miss it names the cause (a fresh, free context estimate shows a changed tool set); sums each subagent's requests and looks up its type and task once (`$.agent.list`); after each main request refreshes context, cost and plan limits from the plain `$.session.usage()`, which costs nothing, and checks the plan-limit warning. | Nothing – the request and its result go through as they are |
| `classic.StopFailure` | Counts the kind of API error a turn ended on | Nothing |
| `turn.start` | Notes the session cost when a turn starts, for the line under its answer | Nothing |
| `turn.complete` | Notes that no main request is running (so `/keepwarm` never pings during one); returns the line shown under the answer (option `turnLine`) | The answer itself is not changed – the line is shown beneath it ([reference › Turns](https://code.claude.com/docs/en/plugins/mods/reference#turns)) |
| `tool.call` | After the call ran: counts MCP calls per server, and for the main conversation estimates the result's size (characters ÷ 4 of the text the model reads) under a short label – file path, or a Bash command's program name. The text itself is not kept. A single result of 10k tokens or more (and 2 % of the window) raises a toast with its label. | Nothing – the call, its input and its result pass through unchanged; it never denies or answers a call |
| `session.measure` | Reads context fill, plan limits, cost and the context breakdown; checks the plan-limit warning (a toast, and with `limitNotice` a notification) | Nothing |
| `session.compact` | After a real compaction, resets the countdown, since the next request writes a fresh cache, and the tool-result tally, since the summary replaced those results. It sees every compaction – `/compact`, auto-compact and its own **Compact** button (`$.session.compact` skips only the calling hook, types; the button is not a hook) – and the button also resets the countdown right away | Nothing – it never skips or alters a compaction |
| `classic.PreModelSwitch` | While the cache is warm, shows a note with Claude Code's re-write estimate and the time the cache has left | Nothing – it returns no decision, so Claude Code's own confirmation and your settings hooks decide as without it |
| `classic.PostModelSwitch` | Records the cache TTL, the re-write estimate and Claude Code's verdict on the cache | Nothing |
| `command.run` (`/tokens`, `/keepwarm`, `/keepwarm-auto` only) | Answers its own commands; `/tokens report` puts a Markdown report on the clipboard (`$.ui.copy`) and prints only a confirmation | Other commands are not matched |
| `prompt.submit` | Closes its own pane above the prompt when you send a prompt; with `/keepwarm auto` on, your own prompt also ends the break (moves its window) | Nothing – the prompt is not read, changed or dropped |
| `ui.close` | Notes that you closed its pane, so it doesn't reopen | Nothing – it never keeps a pane open |
| `ui.fault` | Notes that one of the animation files (the café, the turning keepwarm arrow) failed to load, draw or run, and leaves that one out from then on; the reason goes to the debug log | Nothing – the rest of the pane draws as before |
| `session.end` | At a `/clear`: puts together what the conversation came to (cost, requests, share from the cache, cold re-writes) from the mod's own figures, shown once the new one starts | Nothing – passes the event on; at a real exit nothing is shown |
| `ui.render` (band, its own pane) | Draws the band – keeping what other mods draw below it – and the `/tokens` pane | Only its own drawing |

`claude plugin validate .` prints this list for the version you have.
</details>

## FAQ

### Cost

<details>
<summary><b>Does it cost anything?</b></summary>

Only what you start yourself. A `/keepwarm` ping reads your context at the cache-read price – about 1/20 of re-writing it after expiry (1/40 on Opus 5.5 and Sonnet 5.5, 1/80 on Fable 5.1 and Mythos 5.1), at most 12 pings per run – with `/keepwarm auto`, per break (two for a two-hour break). On an API key that is billed like any request, on a plan it counts against your limits. **Count exactly** uses free token counting. Everything else costs nothing.
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
<summary><b>How do I get the session's stats as text – to keep, compare or paste into an issue?</b></summary>

`/tokens report` puts your session stats on your clipboard as Markdown (never your conversation): cost, hit rate, cold re-writes and warm misses with their cause, context fill and the auto-compact forecast, the heaviest files, servers and tool results, subagents and plan limits. Paths are shortened to `~`, Bash commands appear only by program name, and each subagent's task description (written by Claude) is included as it is; still, review it before you post it publicly.
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
<summary><b>Why does the request chart start empty after <code>/tui</code> or a resume?</b></summary>

Cache Meter keeps its history in memory only, never on disk. `/tui fullscreen` and `/tui default` switch the renderer by relaunching Claude Code with the conversation intact ([fullscreen › Enable fullscreen rendering](https://code.claude.com/docs/en/fullscreen#enable-fullscreen-rendering)), and so does `claude --resume`: the conversation comes back, the history does not. The pane then says `No request since <time>` and counts requests from there; the countdown continues from Claude Code's own report of the last answer.
</details>

<details>
<summary><b>Can I turn the animations off?</b></summary>

Yes: `/config` → `cache-meter.animations` → `off`. The café under the request chart and the minute flash go away; the band's last-stretch pulse and the keepwarm heartbeat stay, because they tell you something. Worth it on a terminal app that leaves traces of redrawn cells behind (seen with Termius on an iPad), or simply for a calmer screen.
</details>

<details>
<summary><b>How do I switch tabs or scroll without the mouse – and why doesn't a click work?</b></summary>

Always: `/tokens overview`, `/tokens context`, `/tokens health` (a prefix is enough, `/tokens h`). Or the keyboard:

1. <kbd>Ctrl</kbd>+<kbd>X</kbd>, let go, then <kbd>Tab</kbd> – the pane takes the keyboard: its header and bottom line turn orange, *keys here*. (Claude Code moves the keyboard from the prompt to the band, then to each open pane, then back – [keybindings › `abovePrompt:focus`](https://code.claude.com/docs/en/keybindings). While the pane is open the band has no button of Cache Meter's, so the first press usually lands in the pane (measured with 2.1.296; the docs do not say that a band without controls is skipped). If another mod has a control in the band or a pane open, press it again until this one lights up.)
2. <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> switch tabs – or <kbd>Tab</kbd> walks the tabs and buttons and <kbd>Enter</kbd> presses one.
3. A tab taller than the pane – the Context tab in a short window, for example – scrolls with <kbd>↓</kbd> <kbd>↑</kbd>, <kbd>Page Down</kbd> <kbd>Page Up</kbd>, and <kbd>End</kbd> <kbd>Home</kbd> for the bottom and top ([interface › What each key does](https://code.claude.com/docs/en/plugins/mods/interface)).
4. <kbd>Esc</kbd> gives the keyboard back to the prompt. Until then <kbd>c</kbd>, <kbd>w</kbd> and <kbd>x</kbd> press the pane's buttons, and digits typed before the pane turns orange go into the chat.

**The mouse** works only in Claude Code's fullscreen renderer (`/tui fullscreen`), which captures it: click a tab or a button, scroll a pane with the wheel (types: `ui.scroll`), point at a column of the request chart for its details. In the classic renderer the terminal keeps the mouse. Even in fullscreen, a click that moves the pointer slightly becomes a text selection – Claude Code then copies the word instead of clicking, and a toast names the way it copied (seen: `sent … chars via OSC 52`). That happens easily on a touchscreen or trackpad, for example over SSH from an iPad; the keys above always work.
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

Issues and pull requests are welcome – under the [Code of Conduct](CODE_OF_CONDUCT.md). Read [CONTRIBUTING.md](CONTRIBUTING.md) first – above all the rule that the **official documentation is the single source of truth** for the mods API, not memory. CI runs `claude plugin validate --strict` and every test on every push and pull request. The files under `.github/` (workflows and their scripts, which fetch the official docs and open issues with GitHub's own token) run only in GitHub Actions – they are not part of the mod and never run in your session.

## Learn more

- [docs/how-it-works.md](docs/how-it-works.md) – events, state, thresholds, the TTL derivation, assumptions and limitations
- [AGENTS.md](AGENTS.md) – install, verify, test and change the mod, for coding agents
- [SECURITY.md](SECURITY.md) – everything the mod can reach
- [CHANGELOG.md](CHANGELOG.md) – versions
- [The official documentation it is built on](CONTRIBUTING.md#the-official-documentation-this-mod-relies-on) – every mods and plugin page, and how the mod keeps up with new Claude Code releases


## License

[MIT](LICENSE) © 2026 [Florian Grimmer](https://www.floriangrimmer.de/)

Not affiliated with or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic.
