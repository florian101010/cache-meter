# Contributing to Cache Meter

Thanks for helping. Cache Meter is a [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview); its hooks run inside Claude Code, so a mistake costs the user's session, not just a test.

## The one rule: the official documentation is the single source of truth

The mods API is early access, changes between releases and is newer than any model's training data. For every statement about how the API behaves – in code, comments, docs or a review – the source is:

1. the official documentation, fetched fresh, not remembered: <https://code.claude.com/docs/en/plugins/mods/overview> and its pages (index: <https://code.claude.com/docs/llms.txt>, section *Mods*), and <https://code.claude.com/docs/en/prompt-caching> for cache behaviour;
2. the type declarations Claude Code writes for the running version, `.claude-plugin/types/claude-code/index.d.ts` (they win where they are more specific than the docs);
3. what `claude plugin validate` and `claude plugin test` accept.

**Required reading before any change**, every time: [reference](https://code.claude.com/docs/en/plugins/mods/reference), [interface](https://code.claude.com/docs/en/plugins/mods/interface) (the mod draws) and [test](https://code.claude.com/docs/en/plugins/mods/test) (every change needs tests); plus [events](https://code.claude.com/docs/en/plugins/mods/events) or [api](https://code.claude.com/docs/en/plugins/mods/api) for the event or call you touch. Cite page and section in a comment for every non-obvious API fact, or mark it as *undocumented*. This applies to AI agents working on the repository as well.

## Set up

Requirements: Claude Code 2.1.287 or later, TypeScript (`tsc`) 5.4 or later for type checking.

```bash
git clone https://github.com/florian101010/cache-meter.git
cd cache-meter
claude --plugin-dir "$PWD"     # loads the mod for one session and lays the types into .claude-plugin/types/
```

If you load your clone permanently through `CLAUDE_CODE_PLUGIN_DIRS`, that checkout is live in every new session: keep it on `main` and work in a worktree (`git worktree add ../cache-meter-wt -b feat/<topic>`). While that permanent copy is loaded, `--plugin-dir` cannot load a second plugin named `cache-meter` – the first one wins, and the debug log says `another plugin of that name loads first`. To try the worktree, run Claude Code from it with the variable replaced for that session only:

```bash
cd ../cache-meter-wt
claude --settings "{\"env\":{\"CLAUDE_CODE_PLUGIN_DIRS\":\"$PWD\"}}"   # only this checkout loads
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
   D=$(mktemp -d); claude -p "Reply with: ok" --settings "{\"env\":{\"CLAUDE_CODE_PLUGIN_DIRS\":\"$PWD\"}}" --debug-file "$D/debug.log"; grep cache-meter "$D/debug.log"
   ```

   (This makes one small model request. Delete the debug log afterwards – it contains session data.)
7. Update `README.md`, `docs/how-it-works.md` and `CHANGELOG.md` in the same pull request. Bump `version` in `.claude-plugin/plugin.json` for every change users should receive.
8. Commit with [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).

## Pull requests

Fill in the template. CI must be green. Describe what a user sees differently, and which documentation sections back the change.
