#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

export CI=1 WRANGLER_SEND_METRICS=false

free_port() {
  node -e 'const s = require("node:net").createServer().listen(0, "127.0.0.1", () => { console.log(s.address().port); s.close(); })'
}

wait_ready() {
  local port=$1
  for _ in $(seq 1 90); do
    curl --silent --fail "http://127.0.0.1:$port/api/items" >/dev/null && return 0
    sleep 1
  done
  echo "wrangler dev did not answer on port $port" >&2
  return 1
}

start() {
  local state=$1 port=$2 inspector=$3
  setsid pnpm exec wrangler dev --port "$port" --inspector-port "$inspector" --persist-to "$state" >>"$state/wrangler.log" 2>&1 &
  echo $! >"$state/pid"
  wait_ready "$port"
}

stop() {
  local state=$1
  [[ -f $state/pid ]] || return 0
  local pid
  pid=$(<"$state/pid")
  kill -TERM -- "-$pid" 2>/dev/null || true
  while kill -0 -- "-$pid" 2>/dev/null; do sleep 0.2; done
  rm -f "$state/pid"
}

if [[ ${1:-} == restart ]]; then
  stop "$2"
  start "$2" "$3" "$4"
  exit 0
fi

state=$(mktemp -d)
port=$(free_port)
inspector=$(free_port)
cleanup() {
  local status=$?
  [[ $status -eq 0 ]] || tail -n 60 "$state/wrangler.log" >&2 || true
  stop "$state"
  rm -rf "$state"
  exit "$status"
}
trap cleanup EXIT

pnpm exec wrangler d1 migrations apply DB --local --persist-to "$state"
start "$state" "$port" "$inspector"

export THREADSIFT_BASE_URL="http://127.0.0.1:$port"
export THREADSIFT_RESTART="bash $PWD/tools/e2e/worker.sh restart $state $port $inspector"

pnpm exec playwright test "$@"
