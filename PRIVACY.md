# Privacy policy

Cache Meter is a [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview): code that runs on your computer, inside Claude Code, with your permissions. This page says what it reads, keeps and sends. It applies to every version; changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## What it reads

Only what Claude Code reports to mods within your session:

- **Per model request:** token counts (new, read from cache, written to cache, output), the model id, the stop reason, and the names and durations of server-side tool calls (such as the advisor).
- **Per tool call:** the tool's name; MCP calls are counted per tool name and shown per server. For the main conversation also a short label – for the file tools (Read, Write, Edit, MultiEdit, NotebookEdit) the file path, home directory shortened to `~`, without query or fragment, never a URL, and a path part that looks like a token shown as `…`; for a Bash command only a word that looks like a program name, never one that looks like a token; nothing for other tools – and the length of the result as the model reads it, to estimate how much it adds to the context. Labels are one line of at most 80 characters. The result's text is measured, not kept; a command's arguments are never read into the label.
- **Per turn:** the session cost at its start and end, and the turn's token totals, for the line under the answer.
- **Per subagent:** its type and task description, as Claude Code lists it, and its token counts.
- **At a model switch:** Claude Code's own estimate of what re-writing the context costs, and whether it thinks the cache is warm.
- **Per session:** context fill and its breakdown – including the paths of your memory files (CLAUDE.md, rules) and the names of MCP servers, skills and agents with their token counts – cost as `/cost` shows it, plan-limit percentages and reset times, the number of prompts, the session's start time, the kinds of API errors a turn ended on, and Claude Code's own verdict on whether the prompt cache is warm.
- **Settings:** the prompt-cache TTL controls (`FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H`, `promptCacheTtl`) and its own four options. Claude Code hands a mod the whole merged settings object at once (`$.settings.read`, no per-key read); Cache Meter takes only `promptCacheTtl` from it and keeps nothing else.
- **Your prompts:** when you send one it notes only that you did (to close its pane above the prompt), not the text.

It never reads the text of your prompts, and no files. Claude's answer is only compared with what the turn returned, to keep another mod's line, never kept. Of tool calls it reads only what the list above names: the result's text is measured for its length and dropped; for Bash only a word that looks like a program name becomes the label – anything with `$`, quotes, `;`, `|`, `&` or a leading `-` gives just `Bash`. The line it shows under an answer is its own; the answer is not changed. Whether Claude reads that line is not documented.

What Claude does read: the short replies of its commands (`/tokens`, `/keepwarm`, `/tokens report`) – Claude Code adds a command's text to the conversation (mods › api › Add a command). They hold confirmations, never your data.

## What it keeps

Everything stays in memory, in Claude Code's session state and the mod's own variables. Nothing is written to disk. It is gone when the session ends and after `/clear`, `/resume` or `/branch`.

Other mods you load can read that session state – Claude Code lets any loaded mod read any mod's values (type declarations, `$.state`) – and a mod that runs before Cache Meter can see what it puts on the clipboard or in a notification. Paths are stored with your home directory shortened to `~`; tool labels and subagent task descriptions are stored as shown.

## What you copy

`/tokens report` puts a summary on your clipboard – the figures of the pane, the names of your memory files (home directory shortened to `~`), MCP servers and their call counts, the tool labels above, each subagent's type and task description, the last model's id and the last warm miss's cause – only when you run it. What you paste it into is up to you.

## What it sends

Nothing to the author or anyone else, and no telemetry. Two actions you start send requests through Claude Code, with your own credentials, to the provider your session already uses (the Anthropic API or your cloud provider):

- **`/keepwarm`:** one small request over your conversation shortly before the cache expires (at most 12 per run), to keep the prompt cache alive.
- **Expiry notification** (only with the option `expiryNotice` on): one notification per cache window through your own notification channel – the one Claude Code's `preferredNotifChannel` setting names – and your `Notification` settings hooks. Its text holds the time left and the context size, nothing else.
- **Count exactly** in the `/tokens` Context tab: token-count requests, one per tool and memory file, as `/context` makes them – once, when you press it. Token counting is [free on the API](https://platform.claude.com/docs/en/build-with-claude/token-counting#pricing-and-rate-limits).

## Children

Cache Meter is a developer tool and not directed at people under 18.

## Contact

Questions: [open an issue](https://github.com/florian101010/cache-meter/issues). Security problems: [private vulnerability reporting](https://github.com/florian101010/cache-meter/security/advisories/new) (see [SECURITY.md](SECURITY.md)).
