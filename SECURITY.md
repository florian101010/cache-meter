# Security

Cache Meter is a [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview). Like every mod it runs inside Claude Code with your permissions and is not sandboxed ([decide whether to trust a mod](https://code.claude.com/docs/en/plugins/mods/overview#decide-whether-to-trust-a-mod)). This page states what it actually does, so you can check it.

## What the mod reaches

| | |
|---|---|
| Events it hooks | `session.start`, `classic.SessionStart`, `turn.step`, `classic.StopFailure`, `turn.start`, `turn.complete` (returns the line shown under the answer; the answer is not changed), `tool.call` (after the call ran: MCP calls counted per server, main-conversation result sizes estimated under a short label), `session.measure`, `session.compact`, `ui.fault` (observed only: leaves a failed animation out – the café or the turning arrow), `session.end` (observed: at a `/clear`, reads the ended conversation's figures for one toast), `classic.PreModelSwitch` (a note; no decision), `classic.PostModelSwitch`, `command.run` (its own three commands; keepwarm starts only on the person's own command, `origin` `composer` or `bridge`; with another plugin's `/keepwarm` it passes `off` and the words it doesn't know on to it, unchanged), `prompt.submit` (observed only: closes its own pane above the prompt; with `/keepwarm auto` on, an own prompt ends the break), `ui.close` (observed: remembers that you closed its pane), `config.set` (observed after the write: its own option `keepwarm` switched – registers or stops keepwarm; every change passes unchanged), `command.describe` (with `keepwarm` `off`: hides its own two keepwarm commands from the menu, nothing else), `ui.render` (band and its own pane) – every event is passed on unchanged, except that `turn.complete` adds its own line beneath the answer |
| Prompts and tool calls | never rewritten, approved or refused. Prompts and answers are never read. Of a tool call: the name, a short label (file path, or a Bash command's program name) and the result's length – its text is not kept |
| Files | none read or written |
| Network | none of its own. With the option `keepwarm` `off`, no keepwarm request at all. `/keepwarm` (also the **Keep warm** buttons in the band and the pane) calls `$.model.fork` – one request over your own conversation, through Claude Code; after `/keepwarm auto` it does so by itself during breaks (opt-in per session, at most 12 per break, off on a miss). **Count exactly** in the Context tab calls `$.session.usage({ breakdown: 'full' })`, which makes Claude Code count tokens with the API, one request per tool and memory file, as `/context` does – only when you press it. With the options `expiryNotice` or `limitNotice` on, `$.ui.notify` raises a notification through your own notification channel |
| Clipboard | only on `/tokens report`: a Markdown summary through `$.ui.copy`, the way `/copy` writes – never on its own |
| Session data | reads `$.session.usage` (context fill, the breakdown as Claude Code's local estimate, cost, plan limits, start time), `$.session.turns`, `$.session.surfaces` (whether a terminal draws, for the `/tui fullscreen` tip), `$.command.list` (command names and their plugins, to find another `/keepwarm`) and `$.agent.list` (each subagent's type and task description) |
| Processes | none |
| Environment | reads `FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H`; writes nothing |
| Settings | reads the merged settings once per session start or reset, and uses only `promptCacheTtl` |
| Stored data | in memory only: session state (`$.state`), reset by `/clear`, `/resume`, `/branch`, and the mod's own variables (warned limit windows, budget level, the `/clear` totals, whether `/keepwarm auto` is on and its last status line, the name of another plugin with `/keepwarm`), which stay over those on purpose; nothing persists after the session or a relaunch (`/tui`), nothing on disk. Other loaded mods can read it (types: `$.state`), so paths are stored `~`-shortened |
| Animation files | `hooks/cafe.tsx` and `hooks/spin.tsx`, surface modules drawn as a `Client` (option `animations`): the café gets only the cache's state word as props, the turning keepwarm arrow gets none; neither has the mods API (no `$`) or posts anything back. If one fails, `ui.fault` leaves that one out (café or arrow) and writes the reason to the debug log |
| What Claude reads | the short replies of its own commands – a command's text goes into the conversation (mods › api › Add a command); never data. Whether Claude reads the line under an answer is not documented; it is shown only in interactive sessions |

`claude plugin validate .` prints the authoritative list of hooks and calls for the version you have.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's [private vulnerability reporting](https://github.com/florian101010/cache-meter/security/advisories/new) for this repository, or contact the maintainer through the profile at <https://github.com/florian101010>. Expect a first answer within a week.

Only the latest release on `main` is supported.
