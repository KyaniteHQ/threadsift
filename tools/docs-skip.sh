#!/usr/bin/env bash
set -euo pipefail

scan() {
  local path matched=false
  while IFS= read -r -d '' path; do
    case "$path" in
      AGENTS.md|README.md|docs/*.md|docs/assets/*.png|docs/assets/*.gif)
        matched=true
        if [[ $1 == delete ]]; then rm -f -- "$path"; fi
        ;;
      *)
        if [[ $1 == classify ]]; then return 1; fi
        ;;
    esac
  done
  if [[ $matched == false && $1 == delete ]]; then
    echo 'The docs-only skip list matched no tracked files.' >&2
  fi
  [[ $matched == true ]]
}

case "${1:-}" in
  classify) scan classify ;;
  delete)
    root=$(git rev-parse --show-toplevel)
    cd "$root"
    git ls-files -z | scan delete
    ;;
  *) echo 'Usage: docs-skip.sh classify | delete' >&2; exit 2 ;;
esac
