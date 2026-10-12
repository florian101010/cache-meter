# Contributing to Cache Meter

Thanks for helping. Cache Meter is a [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview); its hooks run inside Claude Code, so a mistake costs the user's session, not just a test.

## The one rule: the official documentation is the single source of truth

The mods API is early access, changes between releases and is newer than any model's training data. For every statement about how the API behaves – in code, comments, docs or a review – the source is:

1. the official documentation, fetched fresh, not remembered: <https://code.claude.com/docs/en/plugins/mods/overview> and its pages (index: <https://code.claude.com/docs/llms.txt>, section *Mods*), and <https://code.claude.com/docs/en/prompt-caching> for cache behaviour;
2. the type declarations Claude Code writes for the running version, `.claude-plugin/types/claude-code/index.d.ts` (they win where they are more specific than the docs);
3. what `claude plugin validate` and `claude plugin test` accept.

**Required reading before any change**, every time: [reference](https://code.claude.com/docs/en/plugins/mods/reference), [interface](https://code.claude.com/docs/en/plugins/mods/interface) (the mod draws) and [test](https://code.claude.com/docs/en/plugins/mods/test) (every change needs tests); plus [events](https://code.claude.com/docs/en/plugins/mods/events) or [api](https://code.claude.com/docs/en/plugins/mods/api) for the event or call you touch. Cite page and section in a comment for every non-obvious API fact, or mark it as *undocumented*. This applies to AI agents working on the repository as well.

## Keeping up with Claude Code and the mods API

The mods API is early access and changes between Claude Code releases. Three things keep this mod current:

1. **CI is pinned.** `ci.yml` installs exactly `CLAUDE_CODE_VERSION` (now 2.1.296), so a new release never breaks a pull request by surprise. Raise it on purpose, after the steps below, and update *Tested with* in the README and AGENTS.md.
2. **A weekly check** (`.github/workflows/upstream.yml`, Mondays, or by hand under *Actions*) runs `validate --strict` and every test on the **newest** Claude Code, and compares the official pages below with the content hashes in `docs/upstream-docs.txt` (`.github/scripts/upstream-docs.sh --check`). Either kind of change opens one issue, *Upstream: …*, and comments on it again while it stays open.
3. **On such an issue:** read the release notes of the new version (`claude --version`, the [changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)) and the changed pages, load the mod in a session of that version so Claude Code writes its new type declarations (`.claude-plugin/types/claude-code/index.d.ts`), run `tsc -p .`, `claude plugin validate --strict .` and `claude plugin test .`, fix code and docs, run `.github/scripts/upstream-docs.sh --write`, raise `CLAUDE_CODE_VERSION`, bump `version` – one pull request.

### The official documentation this mod relies on

| Page | What it settles here |
|---|---|
| [mods › overview](https://code.claude.com/docs/en/plugins/mods/overview) | What a mod is, where mods run, trusting and turning mods off |
| [mods › create](https://code.claude.com/docs/en/plugins/mods/create) | Files of a mod, getting the types for your build, `--plugin-dir`, `validate` |
| [mods › reference](https://code.claude.com/docs/en/plugins/mods/reference) | Every event, every `$` method, render sites, elements, **limits**, settings – read before every change |
| [mods › interface](https://code.claude.com/docs/en/plugins/mods/interface) | Band and pane, elements, presses, redraws, hover, `$.state` – read before every drawing change |
| [mods › gallery](https://code.claude.com/docs/en/plugins/mods/gallery) | How elements look in the terminal and Desktop |
| [mods › events](https://code.claude.com/docs/en/plugins/mods/events) | Hooks, matchers, *Follow a turn*, settings hook events (`classic.*`), failing hooks |
| [mods › api](https://code.claude.com/docs/en/plugins/mods/api) | Commands, model calls (`$.model.fork`), timers, files and processes |
| [mods › test](https://code.claude.com/docs/en/plugins/mods/test) | The test kit, stubs, `mock.clock`, `$.ui.mount`, options – read before every change |
| [mods › troubleshoot](https://code.claude.com/docs/en/plugins/mods/troubleshoot) | Why a mod does nothing, where its errors are logged |
| [mods › admin](https://code.claude.com/docs/en/plugins/mods/admin) | What organizations can enforce (`prependPlugins`, the built-in guard) |
| [plugins › install](https://code.claude.com/docs/en/plugins/install) | Installing, scopes, **keeping plugins updated** |
| [plugins › loading](https://code.claude.com/docs/en/plugins/loading) | When auto-update runs, which marketplaces auto-update |
| [plugins › CLI reference](https://code.claude.com/docs/en/plugins/cli-reference) | `claude plugin install / update / validate / test`, marketplace commands |
| [plugins › manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference) | `plugin.json` fields, `userConfig` (types, `options`, `min`/`max`), `types` |
| [plugins › marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference) | `.claude-plugin/marketplace.json` |
| [prompt caching](https://code.claude.com/docs/en/prompt-caching) | TTLs, what invalidates and keeps the cache, subagents – the facts the countdown and causes rest on |
| [hooks](https://code.claude.com/docs/en/hooks) | Settings hook events the mod observes (`PreModelSwitch`, `PostModelSwitch`, `SessionStart`, `StopFailure`) |
| [Plugin directory: submit](https://claude.com/docs/plugins/submit) | Directory listing, versions, review |

Index of every page: <https://code.claude.com/docs/llms.txt> (section *Mods*). Prices: [pricing › Prompt caching](https://platform.claude.com/docs/en/about-claude/pricing#prompt-caching), see [Prices](#prices).

## Prices

Cache Meter turns token counts into cost statements (`/keepwarm`'s “a ping costs about 1/20 of a re-write”, the pane's “cache saved X % of input cost”). Those rest on Anthropic's price **multipliers**, never on dollar prices.

- **Single source:** the official pricing page, section *Prompt caching*: <https://platform.claude.com/docs/en/about-claude/pricing#prompt-caching> – fetched fresh, never from memory. Cache write 1.25× (5 minutes) / 2× (1 hour) of the base input price; cache read 0.1×, with per-model exceptions in the table's footnotes. Dollar figures in the pane come only from Claude Code itself (`cost.usd`, `estimated_cache_write_usd`).
- **Where they live:** in code only `readMultiplier` and `writeMultiplier` in `hooks/lib.ts`; in docs the table *What it costs* in `README.md`, the FAQ ratios (1/20, 1/40, 1/80) and the keepwarm card's text. The test `cache saving: …` pins the values, so a change touches code, test and README together.
- **When to check:** whenever Anthropic releases a model (a new model id falls back to 0.1×, which may be wrong), before every release tag, and otherwise once a month. Record the date in the comment above `readMultiplier`.

## Set up

Requirements: Claude Code 2.1.287 or later, TypeScript (`tsc`) 5.4 or later for type checking.

```bash
git clone https://github.com/florian101010/cache-meter.git
cd cache-meter
claude --plugin-dir /absolute/path/to/cache-meter   # this clone: loads the mod for one session and lays the types into .claude-plugin/types/
```

If you load your clone permanently through `CLAUDE_CODE_PLUGIN_DIRS`, that checkout is live in every new session: keep it on `main` and work in a worktree (`git worktree add ../cache-meter-wt -b feat/<topic>`). While that permanent copy is loaded, `--plugin-dir` cannot load a second plugin named `cache-meter` – the first one wins, and the debug log says `another plugin of that name loads first`. To try the worktree, run Claude Code from it with the variable replaced for that session only:

```bash
cd ../cache-meter-wt
claude --settings '{"env":{"CLAUDE_CODE_PLUGIN_DIRS":"/absolute/path/to/cache-meter-wt"}}'   # only this checkout loads
```

## Make a change

1. Branch from `main` (`feat/…`, `fix/…`, `docs/…`).
2. Read the required pages above.
3. Change the code; keep functions without `$` in `hooks/lib.ts`, so they stay unit-testable. Helpers that take `$` must be top-level functions, and `$` calls are spelled in full (`$.noun.method(...)`), because `validate` reads them from the source.
4. Add or adjust tests in `tests/`. For a new safeguard, break it on purpose once and confirm its test fails.
5. Run the checks:

   ```bash
   claude plugin validate --strict .
   claude plugin test .
   tsc -p .
   ```

6. Smoke-test in a real headless run – every cache-meter hook must report `settled`, none `skipped` or `refused`:

   ```bash
   D=$(mktemp -d); claude -p "Reply with: ok" --settings '{"env":{"CLAUDE_CODE_PLUGIN_DIRS":"/absolute/path/to/this/checkout"}}' --debug-file "$D/debug.log"; grep cache-meter "$D/debug.log"
   ```

   (This makes one small model request. Delete the debug log afterwards – it contains session data.)
7. Update, in the same pull request, every file that describes what changed: `README.md` (features, band and pane tables, options, hook table, FAQ), `docs/how-it-works.md`, `CHANGELOG.md`; `PRIVACY.md` and `SECURITY.md` when what the mod reads, hooks or sends changes; `AGENTS.md` and `llms.txt` when features or options change. Then search all of them for numbers and lists that went stale (option count, hook list, versions). Bump `version` in `.claude-plugin/plugin.json` for every change users should receive: the plugin directory picks up every push to `main` as a new version.
8. Commit with [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).

## Pull requests

Fill in the template. CI must be green. Describe what a user sees differently, and which documentation sections back the change.

## Repository map

Images (README screenshots, header, icon and social preview sources) live on the [`assets` branch](https://github.com/florian101010/cache-meter/tree/assets), not on `main`: the directory scans `main`, and image files there hold every version for review. Its README says how to regenerate them.

```text
.claude-plugin/plugin.json        manifest: name, version, type contract, the cacheTtl, autoSidebar, turnLine, expiryNotice and sessionBudget options
                                  (the folder also holds the listing icon, a static PNG; its source is on the assets branch)
.claude-plugin/marketplace.json   makes this repository a one-plugin marketplace
hooks/hooks.json                  points to the hooks module
hooks/register.tsx                all hooks: data sources, band, pane, commands, keepwarm
hooks/lib.ts                      pure functions without $ (TTL derivation, formatting) – unit-testable
types/index.d.ts                  type contract of every $.state value
tests/cache-meter.test.tsx        tests run by `claude plugin test`
docs/how-it-works.md              design and data flow
AGENTS.md                         guide for coding agents: install, verify, test, change
.claude/CLAUDE.md                 imports AGENTS.md for Claude Code sessions in this repository
llms.txt                          machine-readable index of the documentation
.github/workflows/upstream.yml    weekly: tests on the newest Claude Code, official docs compared
.github/scripts/upstream-docs.sh          content hashes of the official pages (--check, --write)
docs/upstream-docs.txt            the hashes, with the date and Claude Code version they were taken at
```
