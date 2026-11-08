#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
source tools/e2e/common.sh

export CI=1 WRANGLER_SEND_METRICS=false THREADSIFT_TARGET=worker NO_COLOR=1

self=$PWD/tools/e2e/worker.sh
bucket=threadsift-files
d1_id=DB

ready_url() {
  local log=$1 offset=$2 pid=$3 url
  kill -0 -- "$pid" 2>/dev/null || kill -0 -- "-$pid" 2>/dev/null || return 2
  url=$(tail -c "+$((offset + 1))" "$log" | sed -nE 's/^\[wrangler:info\] Ready on (http:\/\/127\.0\.0\.1:[1-9][0-9]*)$/\1/p' | head -n 1)
  [[ -n $url ]] || return 1
  echo "$url"
}

start() {
  local dir=$1 port=${2:-0} offset url pid
  offset=$(wc -c <"$dir/wrangler.log")
  rm -f "$dir/explorer-checked"
  setsid pnpm exec wrangler dev --local --ip 127.0.0.1 --port "$port" --inspector-port 0 --persist-to "$dir/state" --env-file "$dir/env" >>"$dir/wrangler.log" 2>&1 &
  pid=$!
  echo "$pid" >"$dir/pid"
  url=$(wait_for 90 ready_url "$dir/wrangler.log" "$offset" "$pid") || {
    tail -n 60 "$dir/wrangler.log" >&2
    echo "wrangler dev did not report a bound address for http://127.0.0.1:$port" >&2
    return 1
  }
  echo "$url" >"$dir/url"
  wait_for_session_route "$url" 90 || {
    tail -n 60 "$dir/wrangler.log" >&2
    return 1
  }
}

stop() {
  local dir=$1
  [[ -f $dir/pid ]] || return 0
  local pid
  pid=$(<"$dir/pid")
  kill -TERM -- "-$pid" 2>/dev/null || true
  while kill -0 -- "-$pid" 2>/dev/null; do sleep 0.2; done
  rm -f "$dir/pid"
}

require_current_bundle() {
  local newer
  [[ -f dist/web/index.html ]] || {
    echo "dist/web has no bundle; run pnpm run build first" >&2
    return 1
  }
  newer=$(find web src design/system tools/theme-script.ts vite.config.ts package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json -newer dist/web/index.html -print -quit)
  [[ -z $newer ]] || {
    echo "dist/web is older than $newer; run pnpm run build first" >&2
    return 1
  }
}

explorer_api() {
  printf '%s/cdn-cgi/local/explorer/api' "$(<"$1/url")"
}

explorer_lists() {
  local api=$1 path=$2 filter=$3 name=$4 listing
  listing=$(curl --silent --show-error --fail --max-time 30 "$api/$path") || {
    echo "the Local Explorer did not answer at $api/$path" >&2
    return 1
  }
  jq -e --arg name "$name" "$filter" <<<"$listing" >/dev/null || {
    echo "the Local Explorer lists no $path entry named $name, and it answers an unknown name with an empty result" >&2
    return 1
  }
}

require_explorer_resources() {
  local dir=$1 api
  [[ ! -f $dir/explorer-checked ]] || return 0
  api=$(explorer_api "$dir")
  explorer_lists "$api" d1/database '.result | any(.uuid == $name)' "$d1_id" || return 1
  explorer_lists "$api" r2/buckets '.result.buckets | any(.name == $name)' "$bucket" || return 1
  : >"$dir/explorer-checked"
}

d1_query() {
  local dir=$1 statement=$2 response
  require_explorer_resources "$dir" || return 1
  response=$(jq -cn --arg sql "$statement" '{sql: $sql}' | curl --silent --show-error --max-time 120 --request POST --header 'content-type: application/json' --data-binary @- "$(explorer_api "$dir")/d1/database/$d1_id/raw") || return $?
  if ! jq -e '.success == true' <<<"$response" >/dev/null 2>&1; then
    printf '%s\n' "$response" >&2
    return 1
  fi
  printf '%s\n' "$response"
}

r2_object_url() {
  printf '%s/r2/buckets/%s/objects/%s' "$(explorer_api "$1")" "$bucket" "$(jq -rn --arg key "$2" '$key | @uri')"
}

r2_read() {
  local dir=$1 key=$2 body code status=0
  require_explorer_resources "$dir" || return 1
  body=$(mktemp)
  code=$(curl --silent --show-error --max-time 120 --output "$body" --write-out '%{http_code}' "$(r2_object_url "$dir" "$key")") || status=1
  if [[ $status -eq 0 ]]; then
    if [[ $code == 200 ]]; then
      cat "$body"
    elif jq -e '.errors[0].message == "The specified key does not exist."' "$body" >/dev/null 2>&1; then
      status=3
    else
      cat "$body" >&2
      status=1
    fi
  fi
  rm -f "$body"
  return "$status"
}

r2_write() {
  local dir=$1 key=$2 response
  require_explorer_resources "$dir" || return 1
  response=$(curl --silent --show-error --max-time 120 --request PUT --header 'content-type: application/octet-stream' --data-binary @- "$(r2_object_url "$dir" "$key")") || return $?
  if ! jq -e '.success == true' <<<"$response" >/dev/null 2>&1; then
    printf '%s\n' "$response" >&2
    return 1
  fi
}

launch() {
  local dir=$1
  mkdir -p "$dir/state"
  (umask 077 && : >"$dir/env")
  [[ -v SETUP_CODE ]] && (umask 077 && printf 'SETUP_CODE=%s\n' "$SETUP_CODE" >"$dir/env")
  [[ -v THREADSIFT_SECRET_KEY ]] && (umask 077 && printf 'THREADSIFT_SECRET_KEY=%s\n' "$THREADSIFT_SECRET_KEY" >>"$dir/env")
  [[ -v PASSWORD_RESET_CODE ]] && (umask 077 && printf 'PASSWORD_RESET_CODE=%s\n' "$PASSWORD_RESET_CODE" >>"$dir/env")
  pnpm exec wrangler d1 migrations apply DB --local --persist-to "$dir/state" >>"$dir/wrangler.log" 2>&1
  start "$dir"
}

case ${1:-} in
launch)
  launch "$2"
  ;;
restart)
  [[ $# -lt 3 ]] || cp "$3" "$2/env"
  stop "$2"
  start "$2" "$(instance_port "$2")"
  ;;
crash)
  echo "a crash is a container case: the Worker has no process that a stop leaves running work in" >&2
  exit 2
  ;;
logs)
  cat "$2/wrangler.log"
  ;;
sql)
  d1_query "$2" "$3" >/dev/null
  ;;
query)
  response=$(d1_query "$2" "$3")
  jq -ce '.result[0].results | . as $r | [$r.rows[] | . as $row | reduce range(0; $r.columns | length) as $i ({}; .[$r.columns[$i]] = $row[$i])]' <<<"$response"
  ;;
file-read)
  r2_read "$2" "$3"
  ;;
file-write)
  r2_write "$2" "$3"
  ;;
file-list)
  require_explorer_resources "$2"
  node tools/e2e/list-worker-files.ts "$(explorer_api "$2")" "$bucket" "$3"
  ;;
stop)
  stop "$2"
  ;;
*)
  require_current_bundle
  run_suite "$self" "$@"
  ;;
esac
