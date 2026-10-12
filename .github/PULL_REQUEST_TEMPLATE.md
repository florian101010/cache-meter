## What changes for the user

<!-- What does someone see or get differently in the band, the /tokens pane or /keepwarm? -->

## Documentation this relies on

<!-- Page and section of https://code.claude.com/docs/en/plugins/mods/* or the type declaration for every API behaviour this change depends on. Mark anything undocumented. -->

## Checklist

- [ ] Read reference, interface and test (fresh), plus events/api for what I touched
- [ ] `claude plugin validate --strict .` passes
- [ ] `claude plugin test .` passes; new safeguards have a test that fails when the safeguard is broken
- [ ] `tsc -p .` passes
- [ ] Headless smoke test: every cache-meter hook `settled`
- [ ] README, docs/how-it-works.md and CHANGELOG.md updated; PRIVACY.md and SECURITY.md if what the mod reads, hooks or sends changed; AGENTS.md and llms.txt if features or options changed
- [ ] Searched the docs for stale numbers and lists (option count, hook list, versions)
- [ ] Version bumped in `.claude-plugin/plugin.json` if users should get this (every merge to `main` is a new directory version)
