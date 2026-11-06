#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
source tools/e2e/common.sh

export CI=1 WRANGLER_SEND_METRICS=false THREADSIFT_TARGET=worker

self=$PWD/tools/e2e/worker.sh

start() {
  local dir=$1 port=${2:-0} url=
  [[ ! -f $dir/start.log ]] || cat "$dir/start.log" >>"$dir/wrangler.log"
  setsid pnpm exec wrangler dev --ip 127.0.0.1 --port "$port" --inspector-port 0 --persist-to "$dir/state" --env-file "$dir/env" >"$dir/start.log" 2>&1 &
  echo $! >"$dir/pid"
  for _ in $(seq 1 450); do
    url=$(sed -nE 's/.*Ready on (http:\/\/127\.0\.0\.1:[1-9][0-9]*).*/\1/p' "$dir/start.log" | head -n 1)
    [[ -z $url ]] || break
    sleep 0.2
  done
  if [[ -z $url ]]; then
    tail -n 60 "$dir/start.log" >&2
    echo "wrangler dev did not report its bound address" >&2
    return 1
  fi
  echo "${url##*:}" >"$dir/port"
  echo "$url" >"$dir/url"
  wait_for_session_route "$url" 90 || {
    tail -n 60 "$dir/start.log" >&2
    echo "wrangler dev did not answer on $url" >&2
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
  start "$2" "$(<"$2/port")"
  ;;
logs)
  cat "$2/wrangler.log"
  cat "$2/start.log"
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
  require_current_bundle
  run_suite "$self" "$@"
  ;;
esac
