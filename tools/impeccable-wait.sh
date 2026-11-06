#!/usr/bin/env bash
set -euo pipefail

usage() { echo "usage: tools/impeccable-wait.sh <pr> [--routes <path>...] (IMPECCABLE_WAIT_SECONDS=1800). Exit 0: review completed; 1: copy failed; 2: usage or closed PR; 3: no review or approval needed; 4: timeout; 5: API failure; 6: draft." >&2; exit 2; }
args=("$@")
wait_seconds=${IMPECCABLE_WAIT_SECONDS:-1800}
[[ $wait_seconds =~ ^[0-9]+$ ]] || usage
(($# >= 1)) && [[ $1 =~ ^[0-9]+$ ]] || usage
pr=$1
shift
routes_request=
if (($#)); then
	[[ $1 == --routes && $# -ge 2 ]] || usage
	shift
	for route in "$@"; do
		[[ $route =~ ^/[^[:space:]]*$ ]] || { echo "a route starts with / and holds no whitespace: $route" >&2; exit 2; }
	done
	routes_request="/impeccable routes $*"
fi
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
start_wait=300
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

issue_comments() {
	api "repos/$repo/issues/$pr/comments?per_page=100" --paginate --jq ".[] | $1"
}

last_impeccable_comment() {
	issue_comments 'select((.author_association == "MEMBER" or .author_association == "OWNER") and (.body | test("^/impeccable( full| routes(\\s+/\\S*)+)?\\s*$"))) | "\(.created_at) \(.body | gsub("\\s+"; " ") | rtrimstr(" "))"' |
		sort | tail -n 1
}

comment() {
	gh pr comment "$pr" --repo "$repo" --body "$1" > /dev/null || { echo "posting $1 failed; rerun the script" >&2; exit 5; }
	echo "$(date -u +%T) commented $1"
	local before=$last try
	for try in 1 2 3 4 5; do
		sleep 2
		last=$(last_impeccable_comment)
		[[ $last != "$before" ]] && break
	done
	[[ $last != "$before" ]] || { echo "the $1 comment does not show in the PR's comments; rerun the script" >&2; exit 5; }
	after=${last%% *}
}

preview_failed() {
	echo "the preview $1 for $sha failed; read $2, fix the cause or rerun it with gh run rerun <run-id> --failed, then rerun this script" >&2
	exit 1
}

check_head() {
	local now
	now=$(pr_head)
	[[ $now == "open $sha false" ]] && return
	echo "$(date -u +%T) the PR head moved from $sha to ${now#* }; restarting the wait"
	exec "$0" "${args[@]}"
}

check_deadline() {
	(($(date +%s) < deadline)) || { echo "timeout: $1" >&2; exit 4; }
}

head=$(pr_head)
read -r pr_state sha draft <<< "$head"
[[ $pr_state == open ]] || { echo "PR $pr is $pr_state; Impeccable reviews only open PRs" >&2; exit 2; }
[[ $draft != true ]] || { echo "Drafts aren’t reviewed. The review starts when this pull request is marked ready for review."; exit 6; }
echo "waiting for Impeccable's review of PR $pr at $sha: preview deployment first, then a review run, up to $wait_seconds s"

while :; do
    check_deadline "no successful copy deployment for $sha"
	statuses=$(api "repos/$repo/deployments?environment=pr-copy&task=deploy:pr-$pr&sha=$sha&per_page=100" --paginate --jq '.[].statuses_url' |
        while read -r url; do api "$url?per_page=1" --jq '.[0] // empty | "\(.created_at) \(.state) \(.log_url)"'; done | sort)
    deployment_state=$(tail -n 1 <<< "$statuses")
	if [[ -n $deployment_state ]]; then
		echo "$(date -u +%T) preview deployment: $deployment_state"
		case $deployment_state in
			*" success "*) break ;;
			*" failure "* | *" error "*) preview_failed deployment "${deployment_state##* }" ;;
		esac
	else
        build=$(api "repos/$repo/actions/workflows/gate.yml/runs?head_sha=$sha&event=pull_request&per_page=100" --jq '.workflow_runs[0] // empty | "\(.created_at) \(.status) \(.conclusion) \(.html_url)"')
        echo "$(date -u +%T) no copy deployment for $sha yet; gate: ${build:-none}"
        case $build in
            *" completed success "*)
                runs=$(api "repos/$repo/actions/workflows/pr-copy.yml/runs?event=workflow_run&per_page=100" --paginate --jq ".workflow_runs[] | select(.created_at >= \"${build%% *}\") | .id")
                for id in $runs; do
                    matched=$(api "repos/$repo/actions/runs/$id/jobs?per_page=100" --paginate --jq ".jobs[] | select(.name == \"check\" and .status == \"completed\") | .id")
                    [[ -n $matched ]] || continue
                    log=$(api "repos/$repo/actions/jobs/$matched/logs" --allow-escape-sequences)
                    [[ $log == *"HEAD_SHA: $sha"* && $log == *"PR: $pr"* ]] || continue
                    deploy_job=$(api "repos/$repo/actions/runs/$id/jobs?per_page=100" --jq '.jobs[] | select(.name == "deploy") | "\(.status) \(.conclusion)"')
                    case $deploy_job in
                        "completed failure" | "completed cancelled" | "completed timed_out" | "completed action_required") preview_failed "deploy job" "https://github.com/$repo/actions/runs/$id" ;;
                        "completed skipped") check_head ;;
                    esac
                    break
                done
                ;;
            *" completed "*) preview_failed gate "${build##* }" ;;
        esac
	fi
	check_deadline "no successful preview deployment for $sha"
	sleep 30
	check_head
done

deployed_at=$(date -d "${deployment_state%% *}" +%s)
last=$(last_impeccable_comment)
after=${last%% *}
after=${after:-1970-01-01T00:00:00Z}
if [[ -n $routes_request ]]; then
	if [[ ${last#* } != "$routes_request" ]] || (($(date -d "$after" +%s) < deployed_at)); then
		comment "$routes_request"
	fi
elif grep -qE ' (failure|error) ' <<< "$statuses" && (($(date -d "$after" +%s) < deployed_at)); then
	echo "$(date -u +%T) an earlier preview deployment of $sha failed, so a run from before the redeploy does not count"
	comment "/impeccable"
fi

while :; do
    check_deadline "no completed review run for $sha"
	run=$(api "repos/$repo/commits/$sha/check-runs?check_name=Impeccable&filter=all" \
		--jq "[.check_runs[] | select(.started_at > \"$after\")] | sort_by(.started_at) | last // empty | \"\(.id) \(.started_at) \(.status) \(.conclusion) \(.completed_at)\"")
	echo "$(date -u +%T) review run after $after: ${run:-none}"
	read -r run_id run_started run_status run_conclusion run_completed <<< "$run"
	if [[ $run_status == completed && $run_conclusion == action_required ]]; then
		[[ ${last#* } == "/impeccable full" ]] && { echo "Impeccable asked for a go again after /impeccable full; read the check" >&2; exit 3; }
		[[ -n $routes_request ]] && { echo "Impeccable asked for a go after $routes_request; read the check, because /impeccable full would review every changed page" >&2; exit 3; }
		comment "/impeccable full"
	elif [[ $run_status == completed ]] && (($(date -d "$run_completed" +%s) < deployed_at)); then
		echo "$(date -u +%T) review run $run_id ended before the preview deployment of $sha succeeded, so it did not see the preview"
		comment "/impeccable"
	elif [[ $run_status == completed ]]; then
		break
	elif [[ -z $run ]]; then
		commented_at=$(date -d "$after" +%s)
		if ((commented_at >= deployed_at && $(date +%s) - commented_at > start_wait)); then
			echo "no review run started within 5 min of the $after ${last#* } comment; say in a PR comment that the design review did not run" >&2
			exit 3
		elif ((commented_at < deployed_at && $(date +%s) - deployed_at > start_wait)); then
			comment "/impeccable"
		fi
	fi
	check_deadline "no completed review run for $sha"
	sleep 30
	check_head
done

check_head
api "repos/$repo/check-runs/$run_id" --jq '"\(.conclusion): \(.output.title)\n\(.output.summary)"'
review=$(issue_comments 'select(.user.login == "impeccable-reviews[bot]" and (.body | contains("<!-- impeccable-review-summary -->"))) | {url: .html_url, updated_at, body} | @json' | tail -n 1)
if [[ -z $review || $(jq -r .updated_at <<< "$review") < $run_started ]]; then
	echo "no review comment for this run"
else
	jq -r .url <<< "$review"
	jq -r .body <<< "$review" |
		grep -oE "[0-9]+ of [0-9]+ changed pages opened|Not seen\.\*\* [^<]*|Not reachable[^<]*|[^>]*didn.t show the part you changed[^<]*|[^>]*couldn.t see this change[^<]*" || true
fi
