#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
source tools/e2e/common.sh

image=threadsift:e2e
self=$PWD/tools/e2e/container.sh

launch() {
  local dir=$1 name volume port
  mkdir -p "$dir"
  name="threadsift-e2e-$$-$RANDOM"
  volume="$name-data"
  port=$(free_port)
  local env_args=()
  [[ -v SETUP_CODE ]] && env_args=(--env SETUP_CODE)
  podman run --detach --name "$name" --publish "127.0.0.1:$port:8080" --volume "$volume:/data" "${env_args[@]}" "$image" >/dev/null
  echo "$name" >"$dir/name"
  echo "$volume" >"$dir/volume"
  echo "http://127.0.0.1:$port" >"$dir/url"
  echo "podman exec -i $name" >"$dir/exec"
  wait_for_session_route "http://127.0.0.1:$port" 60 || {
    podman logs "$name" >&2
    echo "the container did not answer on port $port" >&2
    return 1
  }
}

case ${1:-} in
launch)
  launch "$2"
  ;;
restart)
  podman restart "$(<"$2/name")" >/dev/null
  wait_for_session_route "$(<"$2/url")" 60
  ;;
logs)
  podman logs "$(<"$2/name")" 2>&1
  ;;
sql)
  podman exec -i "$(<"$2/name")" node -e 'const { DatabaseSync } = require("node:sqlite"); new DatabaseSync("/data/threadsift.db").exec(process.argv[1])' "$3"
  ;;
query)
  podman exec -i "$(<"$2/name")" node -e 'const { DatabaseSync } = require("node:sqlite"); console.log(JSON.stringify(new DatabaseSync("/data/threadsift.db").prepare(process.argv[1]).all()))' "$3"
  ;;
stop)
  [[ -f $2/name ]] || exit 0
  podman rm --force "$(<"$2/name")" >/dev/null 2>&1 || true
  podman volume rm --force "$(<"$2/volume")" >/dev/null 2>&1 || true
  rm -f "$2/name"
  ;;
*)
  run_suite "$self" "$@"
  ;;
esac
