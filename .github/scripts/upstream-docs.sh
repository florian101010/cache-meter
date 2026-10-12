#!/usr/bin/env bash
# CI tooling, not part of the mod: the official documentation this mod is built on, by content hash (docs/upstream-docs.txt).
#   --check (default): print every page whose content changed or could not be fetched; exit 1 if any.
#   --write:           rewrite the hashes after you have read the changes (CONTRIBUTING › Keeping up).
set -euo pipefail

cd "$(dirname "$0")/../.."
FILE=docs/upstream-docs.txt
BASE=https://code.claude.com/docs/en
MODE=${1:---check}
case "$MODE" in --check | --write) ;; *) echo "usage: $0 [--check | --write]" >&2; exit 2 ;; esac

if command -v sha256sum >/dev/null 2>&1; then hash() { sha256sum | cut -c1-16; }; else hash() { shasum -a 256 | cut -c1-16; }; fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
changed=0
unreachable=0
while read -r old page; do
  # Comment and empty lines are copied as they are.
  if [[ -z "${old}" || "${old}" == \#* ]]; then
    printf '%s\n' "${old}${page:+ $page}" >>"$TMP_DIR/new"
    continue
  fi
  # Hashed byte for byte from the file: a command substitution would drop trailing newlines.
  if ! curl -sfL --retry 2 --max-time 30 -o "$TMP_DIR/page" "$BASE/$page.md"; then
    echo "unreachable  $BASE/$page.md"
    unreachable=1
    printf '%s  %s\n' "$old" "$page" >>"$TMP_DIR/new"
    changed=1
    continue
  fi
  new=$(hash <"$TMP_DIR/page")
  if [[ "$new" != "$old" ]]; then
    echo "changed      $BASE/$page"
    changed=1
  fi
  printf '%s  %s\n' "$new" "$page" >>"$TMP_DIR/new"
done <"$FILE"

if [[ "$MODE" == --write ]]; then
  # An unreachable page keeps its old hash; writing would hide that it was never compared.
  if ((unreachable)); then echo "not written: a page was unreachable" >&2; exit 1; fi
  cp "$TMP_DIR/new" "$FILE"
  echo "wrote $FILE"
  exit 0
fi
exit "$changed"
