#!/usr/bin/env bash
set -euo pipefail

trap 'echo "tested-tree: full gate ($reason, line $LINENO)" >&2' ERR
reason='single-parent push'
repo="repos/$GITHUB_REPOSITORY"
[[ "$(git rev-parse "$GITHUB_SHA^@")" == "$BEFORE" ]]
tree=$(git rev-parse "$GITHUB_SHA^{tree}")

reason='expected one merged pull request from this repository'
pull=$(gh api "$repo/commits/$GITHUB_SHA/pulls?per_page=2" | jq -ce --arg sha "$GITHUB_SHA" --arg repo "$GITHUB_REPOSITORY" '
  select(length == 1) | .[0] | select(.merged_at and .base.ref == "main" and .head.repo.full_name == $repo and .merge_commit_sha == $sha)
')
head=$(jq -er '.head.sha | select(test("^[0-9a-f]{40}$"))' <<<"$pull")
number=$(jq -er '.number | numbers' <<<"$pull")
ref="refs/pull/$number/merge"

reason='pull request changed gate inputs or its complete file list was unavailable'
gh api "$repo/pulls/$number/files?per_page=100" --paginate --slurp | jq -e '
  def gate_input:
    . == "devenv.nix" or . == "tools/tested-tree.sh" or . == "tools/docs-skip.sh" or
    startswith(".github/workflows/") or startswith(".github/actions/") or
    startswith(".claude/skills/impeccable/scripts/");
  select(type == "array" and length > 0 and all(.[]; type == "array")) | add |
  length < 3000 and all(.[]; (.filename | gate_input | not) and
    (.status != "renamed" or (.previous_filename | gate_input | not)))
' >/dev/null

reason='expected one completed successful gate run for the head'
runs="$repo/actions/workflows/gate.yml/runs?event=pull_request&head_sha=$head&per_page=2"
run=$(gh api "$runs" | jq -ce --arg head "$head" '
  select(.total_count == 1) | .workflow_runs | select(length == 1) | .[0] |
  select(.event == "pull_request" and .head_sha == $head and .status == "completed" and .conclusion == "success")
')
id=$(jq -er '.id' <<<"$run")
attempt=$(jq -er '.run_attempt' <<<"$run")
attempt_url="$repo/actions/runs/$id/attempts/$attempt"
witness="$GITHUB_REPOSITORY/.github/workflows/check.yml"
reason='attempt missing a unique local workflow on the PR merge ref'
merge=$(gh api "$attempt_url" | jq -er --arg workflow "$witness" --arg ref "$ref" '
  select(.status == "completed" and .conclusion == "success") |
  [.referenced_workflows[] | select((.path | split("@")[0]) == $workflow)] |
  select(length == 1) | .[0] |
  select(.ref == $ref and .path == ($workflow + "@" + .sha)) | .sha | select(test("^[0-9a-f]{40}$"))
')
reason='tested merge tree or parents differ'
gh api "$repo/git/commits/$merge" | jq -e --arg tree "$tree" --arg head "$head" --arg base "$BEFORE" '
  .tree.sha == $tree and [.parents[].sha] == [$base, $head]
' >/dev/null

reason='attempt did not pass the aggregate gate with docs skipped'
jobs=$(gh api "$attempt_url/jobs?per_page=100" | jq -ce --argjson attempt "$attempt" '
  select(.total_count == (.jobs | length)) | .jobs |
  select(all(.run_attempt == $attempt and .status == "completed")) |
  select([.[] | select(.name == "gate").conclusion] == ["success"] and
         [.[] | select(.name == "docs").conclusion] == ["skipped"]) | map(.name) | sort
')
if (( attempt > 1 )); then
  reason='rerun omitted jobs from the first attempt'
  gh api "$repo/actions/runs/$id/attempts/1/jobs?per_page=100" | jq -e --argjson jobs "$jobs" '
    .total_count == (.jobs | length) and (.jobs | map(.name) | sort) == $jobs
  ' >/dev/null
fi

reason='latest attempt changed or did not finish successfully'
gh api "$repo/actions/runs/$id" | jq -e --argjson attempt "$attempt" '
  .run_attempt == $attempt and .status == "completed" and .conclusion == "success"
' >/dev/null
printf 'PR run %s attempt %s passed on tree %s\n' "$id" "$attempt" "$tree"
