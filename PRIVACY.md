# Privacy policy

Cache Meter is a [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview): code that runs on your computer, inside Claude Code, with your permissions. This page says what it reads, keeps and sends. It applies to every version; changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## What it reads

Only what Claude Code reports to mods within your session:

- **Per model request:** token counts (new, read from cache, written to cache, output), the model id, the stop reason, and the names and durations of server-side tool calls (such as the advisor).
- **Per MCP tool call:** the tool's name (such as `mcp__github__create_issue`), to count calls per server – not its input or result.
- **Per turn:** the session cost at its start and end, and the turn's token totals, for the line under the answer.
- **At a model switch:** Claude Code's own estimate of what re-writing the context costs, and whether it thinks the cache is warm.
- **Per session:** context fill and its breakdown – including the paths of your memory files (CLAUDE.md, rules) and the names of MCP servers, skills and agents with their token counts – cost as `/cost` shows it, plan-limit percentages and reset times, the number of prompts, the session's start time, the kinds of API errors a turn ended on, and Claude Code's own verdict on whether the prompt cache is warm.
- **Settings:** the prompt-cache TTL controls (`FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H`, `promptCacheTtl`) and its own three options.
- **Your prompts:** when you send one it notes only that you did (to close its pane above the prompt), not the text.

It never reads the text of your prompts, Claude's answers, tool inputs or tool results, and no files. The line it shows under an answer is its own; the answer is not changed.

## What it keeps

Everything stays in memory, in Claude Code's session state and the mod's own variables. Nothing is written to disk. It is gone when the session ends and after `/clear`, `/resume` or `/branch`.

## What it sends

Nothing to the author or anyone else, and no telemetry. Two actions you start send requests through Claude Code, with your own credentials, to the provider your session already uses (the Anthropic API or your cloud provider):

- **`/keepwarm`:** one small request over your conversation shortly before the cache expires (at most 12 per run), to keep the prompt cache alive.
- **Count exactly** in the `/tokens` Context tab: token-count requests, one per tool and memory file, as `/context` makes them – once, when you press it. Token counting is [free on the API](https://platform.claude.com/docs/en/build-with-claude/token-counting#pricing-and-rate-limits).

## Children

Cache Meter is a developer tool and not directed at people under 18.

## Contact

Questions: [open an issue](https://github.com/florian101010/cache-meter/issues). Security problems: [private vulnerability reporting](https://github.com/florian101010/cache-meter/security/advisories/new) (see [SECURITY.md](SECURITY.md)).
