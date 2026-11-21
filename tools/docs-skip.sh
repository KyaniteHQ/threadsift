#!/usr/bin/env bash
set -euo pipefail

skipped() {
  case "$1" in
    AGENTS.md|README.md|docs/*.md|docs/assets/*.png|docs/assets/*.gif) ;;
    *) return 1 ;;
  esac
}

case "${1:-}" in
  classify)
    matched=false
    while IFS= read -r -d '' path; do
      skipped "$path" || exit 1
      matched=true
    done
    [[ $matched == true ]]
    ;;
  delete)
    root=$(git rev-parse --show-toplevel)
    cd "$root"
    git ls-files -z | {
      count=0
      while IFS= read -r -d '' path; do
        skipped "$path" || continue
        rm -f -- "$path"
        ((count += 1))
      done
      if ((count == 0)); then
        echo 'The docs-only skip list matched no tracked files.' >&2
        exit 1
      fi
    }
    ;;
  *) echo 'usage: tools/docs-skip.sh [classify|delete]' >&2; exit 64 ;;
esac
