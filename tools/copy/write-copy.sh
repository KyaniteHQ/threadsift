#!/usr/bin/env bash
set -euo pipefail

[[ $# -eq 1 ]] || {
  echo "usage: tools/copy/write-copy.sh <brief file>" >&2
  exit 64
}
brief=$1
[[ -s $brief ]] || {
  echo "write-copy: $brief is missing or empty" >&2
  exit 64
}
brief=$(realpath "$brief")
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

[[ -r PRODUCT.md ]] || {
  echo "write-copy: PRODUCT.md is missing" >&2
  exit 65
}
voice=$(awk '/^### Interface voice$/ { found = 1; next } found && /^(#|##|###)[[:space:]]/ { exit } found' PRODUCT.md)
[[ -n ${voice//[[:space:]]/} ]] || {
  echo "write-copy: PRODUCT.md has no Interface voice section" >&2
  exit 65
}

models=(gemini-4-neon-high gemini-4-argon-high gemini-3.8-flash-high)

available=$(timeout 20 agy models 2>&1) || true
for model in "${models[@]}"; do
  grep -q "^$model[[:space:]]" <<<"$available" || {
    echo "write-copy: agy is not installed, is signed out, or no longer lists $model; run agy once in a terminal" >&2
    exit 69
  }
done

prompt="Use the humanizer skill: read .agents/skills/humanizer/SKILL.md in this workspace and follow it. Read PRODUCT.md and GLOSSARY.md. To see where a text shows, you may read DESIGN.md and the files under design/system and design/prototype, and for interface practice https://github.com/GoogleChrome/modern-web-guidance. Change no file. Then write the text the brief below asks for, in the order it asks. Every text follows the voice rules below; where the humanizer skill and a voice rule differ, the voice rule wins. Return only that text, with no preamble and no notes.

<voice-rules>
$voice
</voice-rules>

<brief>
$(cat "$brief")
</brief>"

for model in "${models[@]}"; do
  out=$(agy -p "$prompt" --model "$model" --output-format json --print-timeout 10m) || true
  text=$(jq -r '.response // empty' <<<"$out" 2>/dev/null) || text=
  if [[ $(jq -r '.status // empty' <<<"$out" 2>/dev/null) == SUCCESS && -n ${text//[[:space:]]/} ]]; then
    printf '%s\n' "$text"
    echo "write-copy: written by $model" >&2
    exit 0
  fi
  error=$(jq -r '.error // (.denied_actions // [] | map(.action) | if length > 0 then "agy denied " + join(", ") else empty end) // ("status " + (.status // "missing") + (if (.response // "") != "" then ": " + .response else "" end))' <<<"$out" 2>/dev/null) || error=$out
  if grep -Eiq '(^|[^0-9])429([^0-9]|$)|rate.?limit|quota|resource.?exhausted' <<<"$error"; then
    echo "write-copy: $model is rate limited; trying the next model" >&2
    continue
  fi
  printf 'write-copy: %s failed: %s\n' "$model" "${error:-no output}" >&2
  exit 1
done

echo "write-copy: every model is rate limited; try again later" >&2
exit 75
