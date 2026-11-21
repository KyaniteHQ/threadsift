#!/usr/bin/env bash
set -euo pipefail

environment=${1:?expected a Wrangler environment}
message="GitHub Actions ${GITHUB_RUN_ID:?}/${GITHUB_RUN_ATTEMPT:?}"

wrangler() {
  pnpm exec wrangler "$@" --env "$environment"
}

migration_ledger() {
  wrangler d1 execute DB --remote --json --command 'SELECT id, name FROM d1_migrations ORDER BY id' |
    jq -ces 'select(length == 1) | .[0] | select(type == "array" and length == 1) | .[0]
      | select(.success == true) | .results
      | select(type == "array" and all(.[]; (.id | type == "number") and (.name | type == "string")))'
}

live_version() {
  wrangler deployments status --json |
    jq -ers --arg message "${1:-}" 'select(length == 1) | .[0]
      | select($message == "" or .annotations["workers/message"] == $message)
      | .versions | select(type == "array" and length == 1) | .[0]
      | select(.percentage == 100) | .version_id
      | select(test("^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$"))'
}

check_session() {
  local code
  [[ -n "$1" ]] || return 1
  code=$(curl --silent --output /dev/null --write-out '%{http_code}' --fail \
    --max-time 20 --retry 10 --retry-delay 5 --retry-all-errors "${1%/}/api/session") && [[ "$code" == 200 ]]
}

stop() {
  echo "$1" >&2
  exit 1
}

before=$(migration_ledger) || before=''
wrangler d1 migrations apply DB --remote
after=$(migration_ledger) || after=''
previous=$(live_version) || previous=''
export WRANGLER_OUTPUT_FILE_PATH
WRANGLER_OUTPUT_FILE_PATH=$(mktemp)
trap 'rm -f "$WRANGLER_OUTPUT_FILE_PATH"' EXIT

url=''
if wrangler deploy --keep-vars --message "$message"; then
  url=$(jq -ers 'map(select(.type == "deploy")) | last.targets[0] | select(type == "string" and startswith("https://"))' "$WRANGLER_OUTPUT_FILE_PATH") || url=''
  if check_session "$url"; then
    exit 0
  fi
  echo 'The deployed Worker did not pass the /api/session check.' >&2
else
  echo 'Wrangler deploy failed. Checking whether this run went live.' >&2
fi

[[ -n "$before" && -n "$after" ]] || stop 'Rollback skipped because the D1 migration ledger could not be read.'
[[ "$before" == "$after" ]] || stop 'Rollback skipped because the D1 migration ledger changed.'
[[ -n "$previous" ]] || stop 'Rollback skipped because the earlier Worker version is unknown or had split traffic.'
current=$(live_version "$message") && [[ "$current" != "$previous" ]] ||
  stop 'Rollback skipped because this run could not be identified as the current deployment.'

wrangler rollback "$previous" --message "Rollback of $message"
[[ "$(live_version)" == "$previous" ]] || stop 'Rollback did not restore the recorded Worker version.'
if [[ -z "$url" ]]; then
  url=$(wrangler versions view "$previous" --json |
    jq -er '.resources.bindings[] | select(.name == "THREADSIFT_PUBLIC_ORIGIN" and .type == "plain_text") | .text
      | select(test("^https://[a-z0-9-]+\\.[a-z0-9-]+\\.workers\\.dev/?$"))') ||
    stop 'Restored the earlier version but could not determine its workers.dev URL.'
fi
check_session "$url" || stop 'Restored the earlier version but /api/session did not answer 200.'
stop 'Restored the earlier Worker version and /api/session answered 200. The deployment failed.'
