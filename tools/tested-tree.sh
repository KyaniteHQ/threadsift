#!/usr/bin/env bash
set -euo pipefail

repo="repos/$GITHUB_REPOSITORY"
[[ "$(git rev-parse "$GITHUB_SHA^@")" == "$BEFORE" ]]
tree=$(git rev-parse "$GITHUB_SHA^{tree}")

pull=$(gh api "$repo/commits/$GITHUB_SHA/pulls?per_page=2" | jq -ce --arg sha "$GITHUB_SHA" '
  select(length == 1) | .[0] | select(.merged_at and .base.ref == "main" and .merge_commit_sha == $sha)
')
head=$(jq -er '.head.sha | select(test("^[0-9a-f]{40}$"))' <<<"$pull")
ref=$(jq -er '"refs/pull/\(.number)/merge"' <<<"$pull")

runs="$repo/actions/workflows/gate.yml/runs?event=pull_request&head_sha=$head&per_page=2"
run=$(gh api "$runs" | jq -ce --arg head "$head" '
  select(.total_count == 1) | .workflow_runs | select(length == 1) | .[0] |
  select(.event == "pull_request" and .head_sha == $head and .status == "completed" and .conclusion == "success")
')
id=$(jq -er '.id' <<<"$run")
attempt=$(jq -er '.run_attempt' <<<"$run")
attempt_url="$repo/actions/runs/$id/attempts/$attempt"
witness="$GITHUB_REPOSITORY/.github/workflows/check.yml"
merge=$(gh api "$attempt_url" | jq -er --arg workflow "$witness" --arg ref "$ref" '
  select(.status == "completed" and .conclusion == "success") |
  [.referenced_workflows[] | select((.path | split("@")[0]) == $workflow)] |
  select(length == 1) | .[0] |
  select(.ref == $ref and .path == ($workflow + "@" + .sha)) | .sha | select(test("^[0-9a-f]{40}$"))
')
gh api "$repo/git/commits/$merge" | jq -e --arg tree "$tree" --arg head "$head" --arg base "$BEFORE" '
  .tree.sha == $tree and [.parents[].sha] == [$base, $head]
' >/dev/null

gh api "$attempt_url/jobs?per_page=100" | jq -e --argjson attempt "$attempt" '
  select(.total_count == (.jobs | length)) |
  ["check / core", "smoke (container)", "smoke (worker)"] as $required |
  [.jobs[] | select(.name as $name | $required | index($name))] |
  (map(.name) | sort) == $required and
  all(.run_attempt == $attempt and .status == "completed" and .conclusion == "success")
' >/dev/null

gh api "$repo/actions/runs/$id" | jq -e --argjson attempt "$attempt" '
  .run_attempt == $attempt and .status == "completed" and .conclusion == "success"
' >/dev/null
printf 'PR run %s attempt %s passed on tree %s\n' "$id" "$attempt" "$tree"
