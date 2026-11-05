#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
source tools/e2e/common.sh

export CI=1 WRANGLER_SEND_METRICS=false THREADSIFT_TARGET=worker

self=$PWD/tools/e2e/worker.sh

start() {
  local dir=$1
  setsid pnpm exec wrangler dev --port "$(<"$dir/port")" --inspector-port "$(<"$dir/inspector")" --persist-to "$dir/state" --env-file "$dir/env" >>"$dir/wrangler.log" 2>&1 &
  echo $! >"$dir/pid"
  wait_for_session_route "$(<"$dir/url")" 90 || {
    tail -n 60 "$dir/wrangler.log" >&2
    echo "wrangler dev did not answer on $(<"$dir/url")" >&2
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

launch() {
  local dir=$1 port
  mkdir -p "$dir/state"
  port=$(free_port)
  echo "$port" >"$dir/port"
  free_port >"$dir/inspector"
  echo "http://127.0.0.1:$port" >"$dir/url"
  (umask 077 && : >"$dir/env")
  [[ -v SETUP_CODE ]] && (umask 077 && printf 'SETUP_CODE=%s\n' "$SETUP_CODE" >"$dir/env")
  pnpm exec wrangler d1 migrations apply DB --local --persist-to "$dir/state" >>"$dir/wrangler.log" 2>&1
  start "$dir"
}

case ${1:-} in
launch)
  launch "$2"
  ;;
restart)
  stop "$2"
  start "$2"
  ;;
logs)
  cat "$2/wrangler.log"
  ;;
sql)
  pnpm exec wrangler d1 execute DB --local --persist-to "$2/state" --command "$3" >/dev/null
  ;;
query)
  pnpm exec wrangler d1 execute DB --local --persist-to "$2/state" --json --command "$3" | jq -c '.[0].results'
  ;;
stop)
  stop "$2"
  ;;
*)
  run_suite "$self" "$@"
  ;;
esac
