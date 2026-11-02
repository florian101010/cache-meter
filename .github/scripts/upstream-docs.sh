#!/usr/bin/env bash
# CI tooling, not part of the mod: the official pages this mod is built on (list: docs/upstream-docs.txt),
# compared with the copies last read, kept on the branch upstream-docs (one <page>.md each, plus READ).
# The copies live off main: the plugin directory installs everything on main, and holds files over 256 KiB.
#   --check (default): print every page whose content changed or could not be fetched; exit 1 if any.
#                      The full diff goes to upstream-docs.diff (gitignored).
#   --write:           after you have read the changes (CONTRIBUTING › Keeping up): store the pages as
#                      read now, stamp READ with the date and `claude --version`, commit on upstream-docs.
#                      Pushing stays yours: git -C .upstream-docs push
# The copies are taken from https://code.claude.com/docs/en/<page>.md and normalized, so that a change of
# the site's markup alone (link form, callout syntax, indentation) is no change of content.
# Exit: 0 = nothing changed / written, 1 = changed or unreachable / not written, 2 = usage or setup error.
set -euo pipefail

cd "$(dirname "$0")/../.."
LIST=docs/upstream-docs.txt
BASE=https://code.claude.com/docs/en
SNAP=${UPSTREAM_DOCS_DIR:-.upstream-docs}
DIFF=upstream-docs.diff
MODE=${1:---check}
case "$MODE" in --check | --write) ;; *) echo "usage: $0 [--check | --write]" >&2; exit 2 ;; esac

if [[ ! -d "$SNAP" ]]; then
  echo "no copies at $SNAP – first: git fetch origin upstream-docs && git worktree add $SNAP upstream-docs" >&2
  exit 2
fi

# Links to other doc pages lose their host and .md (/docs/en/x, https://code.claude.com/docs/en/x.md → x),
# anchors stay; callout openers and closers (<Note>, > [!NOTE]) and the blockquote mark go. Comparison
# below ignores whitespace and blank lines, which covers re-indented callout bodies.
normalize() {
  perl -pe '
    s{\]\((?:https://code\.claude\.com)?/docs/en/([^)\s#]*?)(?:\.md)?(#[^)\s]*)?\)}{"](" . $1 . ($2 // "") . ")"}ge;
    s{^\s*>\s?\[!(?:NOTE|WARNING|TIP|INFO|IMPORTANT|CAUTION)\]\s*$}{};
    s{^\s*</?(?:Note|Warning|Tip|Info|Check)>\s*$}{};
    s{^>\s?}{};
  '
}

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
: >"$DIFF"
changed=0
unreachable=0
pages=()
while read -r page _; do
  # Comment and empty lines carry no page.
  [[ -z "${page}" || "${page}" == \#* ]] && continue
  pages+=("$page")
  mkdir -p "$TMP_DIR/new/$(dirname "$page")"
  if ! curl -sfL --retry 2 --max-time 30 -o "$TMP_DIR/page" "$BASE/$page.md"; then
    echo "unreachable  $BASE/$page.md"
    unreachable=1
    changed=1
    continue
  fi
  normalize <"$TMP_DIR/page" >"$TMP_DIR/new/$page.md"
  if [[ ! -f "$SNAP/$page.md" ]]; then
    echo "new          $BASE/$page"
    changed=1
    continue
  fi
  # diff: 0 = same, 1 = different, 2 = trouble – the last must stop, not count as a change.
  rc=0
  diff -u -w -B --label "read: $page" --label "now: $page" "$SNAP/$page.md" "$TMP_DIR/new/$page.md" >>"$DIFF" || rc=$?
  if ((rc == 1)); then
    echo "changed      $BASE/$page"
    changed=1
  elif ((rc > 1)); then
    echo "could not compare $page" >&2
    exit 2
  fi
done <"$LIST"

if [[ "$MODE" == --check ]]; then
  ((changed)) && echo "diff: $DIFF"
  exit "$changed"
fi

# --write. An unreachable page keeps its old copy; writing would hide that it was never compared.
if ((unreachable)); then echo "not written: a page was unreachable" >&2; exit 1; fi
# symbolic-ref, not rev-parse: it also names a branch without commits yet (the first write).
if [[ "$(git -C "$SNAP" symbolic-ref --short HEAD 2>&1)" != upstream-docs ]]; then
  echo "not written: $SNAP is not a checkout of the branch upstream-docs" >&2
  exit 2
fi
version=$(claude --version | head -n 1 | cut -d " " -f 1)
# Copies of pages no longer listed go; README.md and READ stay.
while IFS= read -r -d '' old; do
  rel=${old#"$SNAP"/}
  rel=${rel%.md}
  keep=0
  for page in "${pages[@]}"; do [[ "$page" == "$rel" ]] && keep=1; done
  ((keep)) || rm -f "$old"
done < <(find "$SNAP" -path "$SNAP/.git" -prune -o -name '*.md' ! -name README.md -print0)
cp -R "$TMP_DIR/new/." "$SNAP/"
printf 'Read %s against Claude Code %s.\n' "$(date +%F)" "$version" >"$SNAP/READ"
git -C "$SNAP" add -A
if git -C "$SNAP" diff --cached --quiet; then
  echo "nothing to write: the copies are current"
  exit 0
fi
git -C "$SNAP" commit -q -m "docs(upstream): read $(date +%F) against Claude Code $version"
echo "committed on upstream-docs – push with: git -C $SNAP push"
