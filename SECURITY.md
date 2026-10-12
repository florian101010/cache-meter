# Security

Cache Meter is a [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview). Like every mod it runs inside Claude Code with your permissions and is not sandboxed ([decide whether to trust a mod](https://code.claude.com/docs/en/plugins/mods/overview#decide-whether-to-trust-a-mod)). This page states what it actually does, so you can check it.

## What the mod reaches

| | |
|---|---|
| Events it hooks | `session.start`, `classic.SessionStart`, `turn.step`, `classic.StopFailure`, `turn.start`, `turn.complete` (returns the line shown under the answer; the answer is not changed), `tool.call` (after the call ran: MCP calls counted per server, main-conversation result sizes estimated under a short label), `session.measure`, `session.compact`, `classic.PreModelSwitch` (a note; no decision), `classic.PostModelSwitch`, `command.run` (its own two commands), `prompt.submit` (observed only: closes its own pane above the prompt), `ui.close` (observed: remembers that you closed its pane), `ui.render` (band and its own pane) – every event is passed on unchanged, except that `turn.complete` adds its own line beneath the answer |
| Prompts and tool calls | never rewritten, approved or refused. Prompts and answers are never read. Of a tool call: the name, a short label (file path, or a Bash command's program name) and the result's length – its text is not kept |
| Files | none read or written |
| Network | none of its own. `/keepwarm` calls `$.model.fork` – one request over your own conversation, through Claude Code. **Count exactly** in the Context tab calls `$.session.usage({ breakdown: 'full' })`, which makes Claude Code count tokens with the API, one request per tool and memory file, as `/context` does – only when you press it. With the option `expiryNotice` on, `$.ui.notify` raises a notification through your own notification channel |
| Clipboard | only on `/tokens report`: a Markdown summary through `$.ui.copy`, the way `/copy` writes – never on its own |
| Session data | reads `$.session.usage` (context fill, the breakdown as Claude Code's local estimate, cost, plan limits, start time), `$.session.turns` and `$.agent.list` (each subagent's type and task description) |
| Processes | none |
| Environment | reads `FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H`; writes nothing |
| Settings | reads the merged settings once per session start or reset, and uses only `promptCacheTtl` |
| Stored data | session state only (`$.state`); nothing persists after the session, `/clear`, `/resume` or `/branch` |

`claude plugin validate .` prints the authoritative list of hooks and calls for the version you have.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's [private vulnerability reporting](https://github.com/florian101010/cache-meter/security/advisories/new) for this repository, or contact the maintainer through the profile at <https://github.com/florian101010>. Expect a first answer within a week.

Only the latest release on `main` is supported.
