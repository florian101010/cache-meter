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
- [ ] README, docs/how-it-works.md and CHANGELOG.md updated; version bumped in `.claude-plugin/plugin.json` if users should get this
