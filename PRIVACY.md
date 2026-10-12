# Privacy policy

Cache Meter is a [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview): code that runs on your computer, inside Claude Code, with your permissions. This page says what it reads, keeps and sends. It applies to every version; changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## What it reads

Only what Claude Code reports to mods within your session:

- **Per model request:** token counts (new, read from cache, written to cache, output), the model id, the stop reason, and the names and durations of server-side tool calls (such as the advisor).
- **Per session:** context fill and its breakdown – including the paths of your memory files (CLAUDE.md, rules) and the names of MCP servers, skills and agents with their token counts – cost as `/cost` shows it, plan-limit percentages and reset times, the number of prompts, the session's start time, the kinds of API errors a turn ended on, and Claude Code's own verdict on whether the prompt cache is warm.
- **Settings:** the prompt-cache TTL controls (`FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H`, `promptCacheTtl`) and its own two options.
- **Your prompt draft, while you type:** only to see whether it starts with `/tokens`, so it can suggest the tabs; nothing of it is kept. When you send a prompt it notes only that you did (to close its pane above the prompt), not the prompt's text.

It never reads the text of your prompts, Claude's answers, tool inputs or tool results, and no files.

## What it keeps

Everything stays in Claude Code's session state in memory. Nothing is written to disk. It is gone when the session ends and after `/clear`, `/resume` or `/branch`.

## What it sends

Nothing to the author or anyone else, and no telemetry. Two actions you start send requests through Claude Code, with your own credentials, to the provider your session already uses (the Anthropic API or your cloud provider):

- **`/keepwarm`:** one small request over your conversation shortly before the cache expires (at most 12 per run), to keep the prompt cache alive.
- **Count exactly** in the `/tokens` Context tab: token-count requests, one per tool and memory file, as `/context` makes them – once, when you press it.

## Children

Cache Meter is a developer tool and not directed at people under 18.

## Contact

Questions: [open an issue](https://github.com/florian101010/cache-meter/issues). Security problems: [private vulnerability reporting](https://github.com/florian101010/cache-meter/security/advisories/new) (see [SECURITY.md](SECURITY.md)).
