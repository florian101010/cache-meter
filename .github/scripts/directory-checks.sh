#!/usr/bin/env bash
# CI tooling, not part of the mod: the file rules of Anthropic's plugin directory that a script can check
# (https://claude.com/docs/plugins/pre-submission-checklist › Files in the plugin folder, › Review what the
# plugin runs and connects to). The portal's Validate runs more; this catches the mechanical ones first.
set -euo pipefail
cd "$(dirname "$0")/../.."

fail=0
files=$(git ls-files)
count=$(printf '%s\n' "$files" | grep -c .)
if ((count > 512)); then echo "more than 512 files ($count): held for a reviewer"; fail=1; fi

while IFS= read -r f; do
  case "$f" in
    *.png | *.jpg | *.jpeg | *.gif | *.webp | *.woff | *.woff2 | *.ttf | *.otf) continue ;;
    *.ico | *.pdf | *.zip | *.gz | *.tgz | *.exe | *.dll | *.so | *.dylib | *.wasm | *.bin)
      echo "binary file the validator holds: $f"; fail=1; continue ;;
  esac
  size=$(wc -c <"$f")
  if ((size > 262144)); then echo "over 256 KiB (held for a reviewer): $f ($size bytes)"; fail=1; fi
  # Binary = holds a NUL byte (a file of blank lines is still text).
  nul=$(LC_ALL=C tr -dc '\000' <"$f" | wc -c)
  if ((nul > 0)); then echo "binary content (held for a reviewer): $f"; fail=1; fi
done <<<"$files"

for f in .npmrc bunfig.toml uv.toml; do
  if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then echo "package-source config the validator flags: $f"; fail=1; fi
done
if printf '%s\n' "$files" | grep -qE '(^|/)(package-lock\.json|npm-shrinkwrap\.json|bun\.lockb?)$'; then
  echo "lockfile: Claude Code would install packages (held for a reviewer)"; fail=1
fi
# Leftover merge-conflict markers in any tracked file (a conflicted merge once got committed).
conflicts=$(git ls-files -z | xargs -0 grep -lE '^(<<<<<<<|>>>>>>>) ' 2>/dev/null || true)
if [[ -n "$conflicts" ]]; then echo "merge-conflict markers in: $conflicts"; fail=1; fi

# grep: 0 = found, 1 = none, 2 = could not read – the last must fail, not pass.
rc=0
grep -rEn '\b(npx|bunx|uvx|pnpm dlx|yarn dlx|pipx run|uv run)\b' hooks/ .claude-plugin/plugin.json || rc=$?
if ((rc == 0)); then echo "package launcher in the plugin's hooks or manifest"; fail=1; fi
if ((rc > 1)); then echo "could not read hooks/ or .claude-plugin/plugin.json"; fail=1; fi
python3 - <<'PY' || fail=1
import json, sys
h = json.load(open('hooks/hooks.json'))
if not (isinstance(h.get('modules'), list) or isinstance(h.get('hooks'), dict)):
    sys.exit('hooks/hooks.json needs a modules array or a hooks object')
m = json.load(open('.claude-plugin/plugin.json'))
if 'hooks' in m and m['hooks'] in ('./hooks/hooks.json', 'hooks/hooks.json'):
    sys.exit('plugin.json names hooks/hooks.json, which Claude Code loads by itself')
PY

if ((fail)); then exit 1; fi
echo "directory file checks: ok ($count files)"
