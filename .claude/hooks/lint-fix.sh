#!/usr/bin/env bash
set -uo pipefail

input=$(cat)
project=$(realpath "${CLAUDE_PROJECT_DIR:?}")
cd "$project" || exit 1
[[ -x node_modules/.bin/oxlint ]] || exit 0

if ! command -v node >/dev/null; then
  if ! command -v direnv >/dev/null; then
    echo "lint-fix: node is not on PATH and direnv is not installed; open the session from the devenv shell" >&2
    exit 1
  fi
  direnv_log=$(mktemp)
  trap 'unlink "$direnv_log"' EXIT
  env_script=$(direnv export bash 2>"$direnv_log") || {
    echo "lint-fix: direnv could not load $project/.envrc:" >&2
    cat "$direnv_log" >&2
    exit 1
  }
  eval "$env_script"
fi

file=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).tool_input?.file_path ?? "")' "$input") || exit 1
[[ -n $file && -f $file ]] || exit 0
real=$(realpath "$file")
[[ $real == "$project"/* ]] || exit 0
rel=${real#"$project"/}

lint=$(./node_modules/.bin/oxlint --fix --format=agent --no-error-on-unmatched-pattern "$rel" 2>&1)
lint_status=$?
fmt=$(./node_modules/.bin/oxfmt --no-error-on-unmatched-pattern "$rel" 2>&1)
fmt_status=$?

case $lint_status in
  0 | 1) ;;
  *)
    printf 'lint-fix: oxlint exited %s on %s:\n%s\n' "$lint_status" "$rel" "$lint" >&2
    exit 1
    ;;
esac

if ((lint_status == 0 && fmt_status == 0)); then exit 0; fi
((lint_status == 0)) || printf '%s\n' "$lint" >&2
((fmt_status == 0)) || printf 'oxfmt could not format %s:\n%s\n' "$rel" "$fmt" >&2
exit 2
