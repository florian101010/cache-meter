# AGENTS.md – Cache Meter

Guide for AI coding agents (Claude Code, Codex, Cursor, …) that were given this repository. Humans: see [README.md](README.md).

## What this is

**Cache Meter is a [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview)** – a Claude Code plugin whose TypeScript hooks run inside Claude Code. It contains no skills, no MCP server and no settings hooks. It:

- draws one row **above the prompt**: prompt-cache countdown, hit rate of the last request, context fill, auto-compact point, the session's cost at API prices (`cost.usd`), a Compact button;
- adds **`/tokens [overview | context | health]`**: a pane with three tabs – **Overview** (countdown, keepwarm, context, what caching saved, session totals, cost at API prices, plan limits, cold rewrites, a column chart of every request), **Context** (where the context goes, from Claude Code's free estimate; an exact count only on a press), **Health** (rates, unusual stop reasons, API errors, server-side tool calls, warm misses, Claude Code's cache verdict vs. the countdown); the Overview also forecasts when a plan limit is full, the Context tab counts MCP calls per server;
- shows a line **under each answer** with what it cost and how it used the cache (option `turnLine`), a note at a model switch and before any request that splits a warm cache (never a decision), names the cause of a warm miss, lists what each subagent used, and – option `expiryNotice` – sends a notification before the cache expires;
- adds **`/keepwarm [10m … 8h | off]`**: pings the cache through `$.model.fork` shortly before it expires; stops itself on a miss, after 12 pings, at a 5-minute TTL or at the end of the window;
- shows a hint after a cold rewrite. It never rewrites or drops prompts, never approves tool calls, writes no files, makes no network calls of its own – only the keepwarm pings and, on a press, the Context tab's exact count.

Version and requirements: `.claude-plugin/plugin.json` (`version`), Claude Code ≥ 2.1.287 (terminal) or ≥ 2.1.286 (Desktop Code tab), tested with 2.1.296.

## Install it for a user

1. Check the version: `claude --version` must be ≥ 2.1.287.
2. Install from GitHub (shell, non-interactive):

   ```bash
   claude plugin install cache-meter --marketplace florian101010/cache-meter --scope user
   ```

   In a running session the equivalent is `/plugin install cache-meter --marketplace florian101010/cache-meter`. Docs: <https://code.claude.com/docs/en/plugins/install>.
3. Verify: `claude plugin list` lists `cache-meter@cache-meter` as enabled. Tell the user to start a new Claude Code session (or run `/reload-plugins`); `/plugin` then shows `… mods active · cache-meter`, and after the first answer the band above the prompt shows a minute value and a hit rate.
4. Optional: the user can set `cacheTtl` (`auto` · `60m` · `5m`) with `/config` → `cache-meter.cacheTtl` – on an API key or cloud provider (5-minute default TTL) recommend `5m` – `autoSidebar` (`auto` · `off`): with `auto` the dashboard opens by itself as a sidebar in the fullscreen renderer – `turnLine` (`on` · `off`), the line under each answer – and `expiryNotice` (`off` · `on`), a notification before the cache expires. The install output's note "4 userConfig options not yet set" is harmless: the defaults apply.
5. Tell the user what to try: the band above the prompt after the first answer, `/tokens` (tabs: `/tokens context`, `/tokens health`), `/keepwarm` before a break.

Remove: `claude plugin uninstall cache-meter@cache-meter`. Turn off for one session: `claude --safe-mode`.

Alternative without a marketplace: clone and load with `claude --plugin-dir <absolute path>`, or add the absolute path to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json` (paths separated by `:`). Editing a user's `settings.json` changes which code their Claude Code loads – ask before doing it.

## Check that it works

```bash
claude plugin validate --strict .   # must print "Validation passed"
claude plugin test .                # must end with "0 fail" – no session, sign-in or network needed
```

End-to-end smoke test (one tiny model request): every `cache-meter` hook in the log must say `settled`, none `skipped` or `refused`.

```bash
D=$(mktemp -d); claude -p "Reply with: ok" --settings '{"env":{"CLAUDE_CODE_PLUGIN_DIRS":"/absolute/path/to/this/checkout"}}' --debug-file "$D/debug.log"; grep cache-meter "$D/debug.log"; rm -rf "$D"
```

Type check (needs `tsc` ≥ 5.4 and the types Claude Code writes into `.claude-plugin/types/` the first time it loads the mod, e.g. after the smoke test): `tsc -p .`

Visual check needs a real terminal session: the band, `/tokens`, and `/usage` → *Prompt cache (main)* to confirm the TTL assumption.

## Change it

**Rule 1 – the official documentation is the single source of truth, not your training data.** The mods API is early access and newer than any model. Before any change, fetch fresh: <https://code.claude.com/docs/en/plugins/mods/reference> (always), <https://code.claude.com/docs/en/plugins/mods/interface> (the mod draws), <https://code.claude.com/docs/en/plugins/mods/test> (every change needs tests), plus `events`/`api` for what you touch and <https://code.claude.com/docs/en/prompt-caching> for cache logic (index: <https://code.claude.com/docs/llms.txt> → *Mods*). The type declarations Claude Code writes for the running version (`.claude-plugin/types/claude-code/index.d.ts`) win where they are more specific. Cite page and section for every API assumption in a comment, or mark it *undocumented*. Give this rule to every subagent you start for this repository.

**Rule 2 – a loaded checkout is live.** If this folder is loaded through `CLAUDE_CODE_PLUGIN_DIRS`, Claude Code runs it exactly as checked out in every new session. Keep it on `main`; work in a worktree (`git worktree add ../cache-meter-wt -b feat/<topic>`). `--plugin-dir` cannot load the worktree while another `cache-meter` is loaded (the first wins: `another plugin of that name loads first` in the debug log). From the worktree, replace the variable for one session instead: `claude --settings '{"env":{"CLAUDE_CODE_PLUGIN_DIRS":"/absolute/path/to/this/checkout"}}'`.

**Rule 3 – prices come from the pricing page.** Price multipliers (`readMultiplier`, `writeMultiplier` in `hooks/lib.ts`, the README cost table) follow <https://platform.claude.com/docs/en/about-claude/pricing#prompt-caching>, fetched fresh – check it on every new model and before every release; details: [CONTRIBUTING.md › Prices](CONTRIBUTING.md#prices).

Workflow: branch → read the docs above → change → tests (for a new safeguard, break it once and see its test fail) → `validate --strict`, `test`, `tsc -p .`, smoke test → update every doc the change touches (`README.md`, `docs/how-it-works.md`, `CHANGELOG.md`; `PRIVACY.md`/`SECURITY.md` when reads, hooks or sends change; this file and `llms.txt` when features or options change) and check them for stale counts and lists, bump `version` in `.claude-plugin/plugin.json` → Conventional Commit → pull request. Never merge to `main` without the owner's explicit go. Details: [CONTRIBUTING.md](CONTRIBUTING.md).

Code conventions enforced by `validate`: helpers that take `$` are top-level functions; `$` calls are written in full (`$.noun.method(...)`); `$.state` keys are declared in `types/index.d.ts`; `$.env.get` names are string literals. Pure logic goes in `hooks/lib.ts` so tests can call it directly.

## Map

| Path | What |
|---|---|
| `.claude-plugin/plugin.json` | manifest: name, version, `types` contract, the `cacheTtl` option |
| `.claude-plugin/marketplace.json` | makes the repository a one-plugin marketplace (`cache-meter@cache-meter`) |
| `hooks/hooks.json` → `hooks/register.tsx` | every hook: data sources, band, pane, commands, keepwarm |
| `hooks/lib.ts` | pure functions: TTL derivation, hit rate, formatting, thresholds |
| `types/index.d.ts` | type contract of every `$.state` value |
| `tests/cache-meter.test.tsx` | tests for `claude plugin test` |
| `docs/how-it-works.md` | events, state, thresholds, cold-rewrite rule, keepwarm algorithm, with doc references |
| `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md` | user docs, history, contribution rules, what the mod can reach |
