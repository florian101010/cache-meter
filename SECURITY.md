# Security

Cache Meter is a [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview). Like every mod it runs inside Claude Code with your permissions and is not sandboxed ([decide whether to trust a mod](https://code.claude.com/docs/en/plugins/mods/overview#decide-whether-to-trust-a-mod)). This page states what it actually does, so you can check it.

## What the mod reaches

| | |
|---|---|
| Events it hooks | `session.start`, `classic.SessionStart`, `turn.step`, `turn.complete`, `session.measure`, `session.compact`, `classic.PostModelSwitch`, `command.run` (its own two commands), `ui.render` (band and its own pane) |
| Prompts and tool calls | never read, rewritten, approved or refused |
| Files | none read or written |
| Network | none, except `/keepwarm`, which calls `$.model.fork` – one request over your own conversation, through Claude Code |
| Processes | none |
| Environment | reads `FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H`; writes nothing |
| Settings | reads the merged settings once per session start or reset, and uses only `promptCacheTtl` |
| Stored data | session state only (`$.state`); nothing persists after the session, `/clear`, `/resume` or `/branch` |

`claude plugin validate .` prints the authoritative list of hooks and calls for the version you have.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's [private vulnerability reporting](https://github.com/florian101010/cache-meter/security/advisories/new) for this repository, or contact the maintainer through the profile at <https://github.com/florian101010>. Expect a first answer within a week.

Only the latest release on `main` is supported.
