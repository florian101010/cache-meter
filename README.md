# upstream-docs

Copies of the official Claude Code pages Cache Meter relies on, as last read by a maintainer – not part of the mod, never merged into `main`.

- The page list: [`docs/upstream-docs.txt`](https://github.com/florian101010/cache-meter/blob/main/docs/upstream-docs.txt) on `main`.
- `READ`: when the copies were read, and against which Claude Code.
- Each `<page>.md` is `https://code.claude.com/docs/en/<page>.md`, normalized by [`.github/scripts/upstream-docs.sh`](https://github.com/florian101010/cache-meter/blob/main/.github/scripts/upstream-docs.sh): links to other doc pages without host and `.md`, callout markers removed. The text is Anthropic's.
- The weekly workflow `Upstream` compares the live pages with these copies and opens an issue with the diff; after reading it, a maintainer runs `upstream-docs.sh --write` and pushes this branch (CONTRIBUTING › Keeping up).

The copies live on this branch rather than on `main` because the plugin directory installs everything on `main` and holds files over 256 KiB for review.
