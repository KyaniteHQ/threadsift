#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
source tools/e2e/common.sh

export CI=1 WRANGLER_SEND_METRICS=false THREADSIFT_TARGET=worker NO_COLOR=1

self=$PWD/tools/e2e/worker.sh

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
  setsid pnpm exec wrangler dev --ip 127.0.0.1 --port "$port" --inspector-port 0 --persist-to "$dir/state" --env-file "$dir/env" >>"$dir/wrangler.log" 2>&1 &
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

launch() {
  local dir=$1
  mkdir -p "$dir/state"
  (umask 077 && : >"$dir/env")
  [[ -v SETUP_CODE ]] && (umask 077 && printf 'SETUP_CODE=%s\n' "$SETUP_CODE" >"$dir/env")
  [[ -v THREADSIFT_SECRET_KEY ]] && (umask 077 && printf 'THREADSIFT_SECRET_KEY=%s\n' "$THREADSIFT_SECRET_KEY" >>"$dir/env")
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
logs)
  cat "$2/wrangler.log"
  ;;
sql)
  pnpm exec wrangler d1 execute DB --local --persist-to "$2/state" --command "$3" >/dev/null
  ;;
query)
  status=0
  output=$(pnpm exec wrangler d1 execute DB --local --persist-to "$2/state" --json --command "$3") || status=$?
  if [[ $status -ne 0 ]]; then
    printf '%s\n' "$output" >&2
    exit "$status"
  fi
  if ! results=$(jq -ce '.[0].results | select(type == "array")' <<<"$output" 2>/dev/null); then
    printf '%s\n' "$output" >&2
    exit 1
  fi
  printf '%s\n' "$results"
  ;;
stop)
  stop "$2"
  ;;
*)
  require_current_bundle
  run_suite "$self" "$@"
  ;;
esac
