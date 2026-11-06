#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat >&2 <<'USAGE'
Usage: tools/impeccable-wait.sh <pr>
IMPECCABLE_WAIT_SECONDS sets the wait limit (default 1800).
Exit 0: review completed.
Exit 1: copy build or deployment failed, or its gate was cancelled.
Exit 2: usage error or closed pull request.
Exit 3: no review started or caller approval is needed.
Exit 4: wait timed out.
Exit 5: GitHub API failed.
Exit 6: draft pull request.
Exit 7: deploy job succeeded without a deployment after one more poll.
USAGE
	exit 2
}

(($# == 1)) && [[ $1 =~ ^[0-9]+$ ]] || usage
pr=$1
wait_seconds=${IMPECCABLE_WAIT_SECONDS:-1800}
[[ $wait_seconds =~ ^[0-9]+$ ]] || { echo "IMPECCABLE_WAIT_SECONDS must be a non-negative integer: $wait_seconds" >&2; exit 2; }
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner) || { echo "GitHub repository lookup failed; check gh authentication and the current repository" >&2; exit 5; }
deadline=$(($(date +%s) + wait_seconds))

api() {
	local try out
	for try in 1 2 3; do
		out=$(gh api "$@") && { [[ -z $out ]] || printf '%s\n' "$out"; return 0; }
		echo "$(date -u +%T) GitHub API call failed (try $try of 3)" >&2
		sleep 10
	done
	echo "the GitHub API failed 3 times in a row; rerun the script" >&2
	exit 5
}

pr_head() {
	api "repos/$repo/pulls/$pr" --jq '"\(.state) \(.head.sha) \(.draft)"'
}

check_head() {
	local state current_sha current_draft
	read -r state current_sha current_draft <<< "$(pr_head)"
	[[ -n $state ]] || exit 5
	[[ $state == open && $current_sha == "$sha" && $current_draft == false ]] && return
	echo "$(date -u +%T) PR $pr changed: state=$state, head=$current_sha, draft=$current_draft; restarting the wait"
	exec "$0" "$pr"
}

check_deadline() {
	(($(date +%s) < deadline)) || { echo "timeout: $1" >&2; exit 4; }
}

copy_failed() {
	check_head
	echo "the copy $1 for $sha failed; read $2, fix the cause or rerun the failed job, then rerun this script" >&2
	exit 1
}

request_review() {
	echo "$1" >&2
	printf "gh pr comment %s --body '/impeccable'\n" "$pr" >&2
	exit 3
}

read -r pr_state sha draft <<< "$(pr_head)"
[[ -n $pr_state ]] || exit 5
[[ $pr_state == open ]] || { echo "PR $pr is $pr_state; Impeccable reviews only open PRs" >&2; exit 2; }
[[ $draft != true ]] || { echo "Drafts aren’t reviewed. The review starts when this pull request is marked ready for review."; exit 6; }
echo "waiting for Impeccable's review of PR $pr at $sha: copy deployment first, then a review run, up to $wait_seconds s"

successful_run=
while :; do
	check_head
	statuses=$(api "repos/$repo/deployments?environment=pr-copy&task=deploy:pr-$pr&sha=$sha&per_page=100" --paginate --jq '.[].statuses_url' |
		while read -r url; do api "$url?per_page=1" --jq '.[0] // empty | "\(.created_at) \(.state) \(.log_url)"'; done | sort)
	deployment_state=$(tail -n 1 <<< "$statuses")
	if [[ -n $deployment_state ]]; then
		echo "$(date -u +%T) copy deployment: $deployment_state"
		case $deployment_state in
			*" success "*) break ;;
			*" failure "* | *" error "*) copy_failed deployment "${deployment_state##* }" ;;
		esac
	else
		gate=$(api "repos/$repo/actions/workflows/gate.yml/runs?head_sha=$sha&event=pull_request&per_page=100" --jq '.workflow_runs[0] // empty | "\(.created_at) \(.status) \(.conclusion) \(.html_url)"')
		echo "$(date -u +%T) no copy deployment for $sha yet; gate: ${gate:-none}"
		case $gate in
			*" completed success "*)
				copy_run=$(api "repos/$repo/actions/workflows/pr-copy.yml/runs?event=workflow_run&created=>=${gate%% *}&per_page=100" --jq "[.workflow_runs[] | select(.display_title == \"pr copy $pr $sha\")] | .[0].id // empty")
				if [[ -n $copy_run ]]; then
					deploy_job=$(api "repos/$repo/actions/runs/$copy_run/jobs?per_page=100" --jq '.jobs[] | select(.name == "deploy") | "\(.status) \(.conclusion)"')
					case $deploy_job in
						"completed skipped") check_head ;;
						"completed success")
							if [[ $successful_run == "$copy_run" ]]; then
								check_head
								echo "copy deploy run $copy_run succeeded but no deployment exists for PR $pr at $sha after one more poll; read https://github.com/$repo/actions/runs/$copy_run" >&2
								exit 7
							fi
							successful_run=$copy_run
							;;
						"completed "*) copy_failed "deploy job" "https://github.com/$repo/actions/runs/$copy_run" ;;
					esac
				fi
				;;
			*" completed cancelled "*)
				check_head
				echo "gate for $sha was cancelled; read ${gate##* }; rerun the gate or wait on the new head" >&2
				exit 1
				;;
			*" completed "*) copy_failed gate "${gate##* }" ;;
		esac
	fi
	check_deadline "no successful copy deployment for $sha"
	sleep 30
	check_head
done

deployed_at=${deployment_state%% *}
while :; do
	check_head
	run=$(api "repos/$repo/commits/$sha/check-runs?check_name=Impeccable&filter=all" --jq '[.check_runs[]] | sort_by(.started_at) | last // empty | "\(.id) \(.started_at) \(.status) \(.conclusion) \(.completed_at)"')
	echo "$(date -u +%T) review run: ${run:-none}"
	read -r run_id run_started run_status run_conclusion run_completed <<< "$run"
	if [[ $run_status == completed ]]; then
		[[ $run_conclusion != action_required ]] || request_review "Impeccable needs the caller to request a review; read its check."
		[[ $run_completed < $deployed_at ]] || break
		requested=$(api "repos/$repo/issues/$pr/comments?per_page=100" --paginate --jq '.[] | select((.body | test("^\\s*/impeccable\\s*$")) and .created_at > "'"$deployed_at"'") | .created_at' | tail -n 1)
		[[ -n $requested ]] || request_review "The review ended before this copy deployed; request a new review."
		echo "review requested at $requested; waiting for its run"
	fi
	if (($(date +%s) >= deadline)) && [[ -z $run ]]; then
		request_review "No Impeccable review started on $sha within the wait."
	fi
	check_deadline "no completed review run for $sha"
	sleep 30
	check_head
done

check_head
api "repos/$repo/check-runs/$run_id" --jq '"\(.conclusion): \(.output.title)\n\(.output.summary)"'
review=$(api "repos/$repo/issues/$pr/comments?per_page=100" --paginate --jq '.[] | select(.user.login == "impeccable-reviews[bot]" and (.body | contains("<!-- impeccable-review-summary -->"))) | {url: .html_url, updated_at, body} | @json' | tail -n 1)
if [[ -z $review || $(jq -r .updated_at <<< "$review") < $run_started ]]; then
	echo "no review comment for this run"
else
	jq -r .url <<< "$review"
	jq -r .body <<< "$review" |
		grep -oE "[0-9]+ of [0-9]+ changed pages opened|Not seen\.\*\* [^<]*|Not reachable[^<]*|[^>]*didn.t show the part you changed[^<]*|[^>]*couldn.t see this change[^<]*" || true
fi
