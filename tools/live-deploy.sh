#!/usr/bin/env bash
set -euo pipefail

run="GitHub Actions ${GITHUB_RUN_ID:?}/"
message="${run}${GITHUB_RUN_ATTEMPT:?}"

wrangler() {
  pnpm exec wrangler "$@" --env live
}

stop() {
  echo "$1" >&2
  exit 1
}

single_version() {
  jq -ers 'select(length == 1) | .[0].versions | select(type == "array" and length == 1)
    | .[0] | select(.percentage == 100) | .version_id
    | select(test("^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$"))'
}

check_session() {
  local attempt code
  for ((attempt=1; attempt<=11; attempt++)); do
    if code=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 20 "$session_url") && [[ "$code" == 200 ]]; then
      return 0
    fi
    if ((attempt < 11)); then sleep 5; fi
  done
  return 1
}

previous=$(wrangler deployments status --json) && version=$(single_version <<<"$previous") || version=''

deploy_output=$(mktemp)
trap 'rm -f "$deploy_output"' EXIT
wrangler d1 migrations apply DB --remote
deploy_status=0
WRANGLER_OUTPUT_FILE_PATH="$deploy_output" wrangler deploy --keep-vars --message "$message" || deploy_status=$?
session_url=$(jq -ers 'map(select(.type == "deploy")) | select(length == 1) | .[0].targets[0]
  | select(test("^https://[A-Za-z0-9.-]+(:[0-9]+)?/?\\z")) | rtrimstr("/") + "/api/session"' "$deploy_output") ||
  stop 'Deploy was not checked and rollback was skipped because Wrangler did not report a usable deploy target.'

if ((deploy_status == 0)); then
  if check_session; then exit 0; fi
  echo 'The deployed Worker did not pass the /api/session check.' >&2
else
  echo 'Wrangler deploy failed. Checking whether this run went live.' >&2
fi

[[ -n "$version" ]] || stop 'Rollback skipped because the earlier Worker had no confirmed version serving all traffic.'
if ! jq -e --arg run "$run" '(.annotations["workers/message"] // "")
  | (startswith($run) or startswith("Rollback of " + $run)) | not' <<<"$previous" >/dev/null; then
  stop 'Rollback skipped because the earlier deployment could not be distinguished from this run.'
fi
latest=$(wrangler d1 execute DB --remote --json --command \
  'SELECT CASE WHEN COUNT(*) = COUNT(unixepoch(applied_at)) THEN COALESCE(MAX(unixepoch(applied_at)), -1) END AS latest FROM d1_migrations' |
  jq -ers 'select(length == 1) | .[0] | select(type == "array" and length == 1) | .[0] | select(.success == true)
    | .results | select(type == "array" and length == 1) | .[0].latest | numbers') ||
  stop 'Rollback skipped because the latest D1 migration time could not be verified.'
jq -e --argjson latest "$latest" '.created_on | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601 > $latest' <<<"$previous" >/dev/null ||
  stop 'Rollback skipped because the earlier deployment could not be dated after the latest D1 migration.'

current=$(wrangler deployments list --json |
  jq -ces --argjson previous "$previous" --arg message "$message" 'select(length == 1) | .[0]
    | select(type == "array" and length >= 2)
    | select(($previous.id | type == "string" and length > 0) and .[-2].id == $previous.id)
    | last | select(.annotations["workers/message"] == $message)') &&
  active=$(single_version <<<"$current") && [[ "$active" != "$version" ]] ||
  stop 'Rollback skipped because the deployment history does not confirm this attempt immediately followed the recorded deployment.'

wrangler rollback "$version" --message "Rollback of $message"
restored=$(wrangler deployments status --json | single_version) && [[ "$restored" == "$version" ]] ||
  stop 'Rollback could not confirm that the recorded Worker version was restored.'
check_session || stop 'Restored the earlier version but /api/session did not answer 200.'
stop 'Restored the earlier Worker version and /api/session answered 200. The deployment failed.'
