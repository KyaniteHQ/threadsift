#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
source tools/e2e/common.sh

export THREADSIFT_TARGET=container

image=${THREADSIFT_E2E_IMAGE:?run inside the devenv shell for this checkout}
self=$PWD/tools/e2e/container.sh

require_current_image() {
  local built newer
  built=$(podman image inspect --format '{{index .Labels "threadsift.built-at"}}' "$image" 2>/dev/null) || built=
  [[ $built =~ ^[0-9]+$ ]] || {
    echo "$image is missing or was not built by image:build; run devenv tasks run image:build first" >&2
    return 1
  }
  newer=$(find Containerfile package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json vite.config.ts tools/theme-script.ts design/system migrations src web -type f -newermt "@$built" -print -quit)
  [[ -z $newer ]] || {
    echo "$image is older than $newer; run devenv tasks run image:build first" >&2
    return 1
  }
}

seed_volume() {
  local volume=$1 seed=$2
  podman volume create "$volume" >/dev/null
  podman run --rm --entrypoint cp --volume "$volume:/data" --volume "$(dirname "$seed"):/seed:ro,z" "$image" "/seed/$(basename "$seed")" /data/threadsift.db
}

launch() {
  local dir=$1 name volume url
  mkdir -p "$dir"
  name="threadsift-e2e-$$-$RANDOM"
  volume="$name-data"
  [[ -z ${THREADSIFT_SEED_DB:-} ]] || seed_volume "$volume" "$THREADSIFT_SEED_DB"
  local env_args=()
  [[ -v SETUP_CODE ]] && env_args=(--env SETUP_CODE)
  [[ -v THREADSIFT_SECRET_KEY ]] && env_args+=(--env THREADSIFT_SECRET_KEY)
  [[ -v PASSWORD_RESET_CODE ]] && env_args+=(--env PASSWORD_RESET_CODE)
  [[ -v CLAUDE_CODE_OAUTH_TOKEN ]] && env_args+=(--env CLAUDE_CODE_OAUTH_TOKEN)
  podman run --detach --name "$name" --publish "127.0.0.1::8080" --volume "$volume:/data" "${env_args[@]}" "$image" >/dev/null
  echo "$name" >"$dir/name"
  echo "$volume" >"$dir/volume"
  url=http://$(podman port "$name" 8080/tcp)
  echo "$url" >"$dir/url"
  echo "podman exec -i $name" >"$dir/exec"
  wait_for_session_route "$url" 60 || {
    podman logs "$name" >&2
    return 1
  }
}

case ${1:-} in
launch)
  launch "$2"
  ;;
restart)
  if [[ $# -lt 3 ]]; then
    podman restart "$(<"$2/name")" >/dev/null
  else
    name=$(<"$2/name")
    volume=$(<"$2/volume")
    port=$(instance_port "$2")
    podman logs "$name" >>"$2/server.log" 2>&1
    podman rm --force "$name" >/dev/null
    podman run --detach --name "$name" --publish "127.0.0.1:$port:8080" --volume "$volume:/data" --env-file "$3" "$image" >/dev/null
  fi
  wait_for_session_route "$(<"$2/url")" 60
  ;;
crash)
  name=$(<"$2/name")
  podman kill --signal KILL "$name" >/dev/null
  podman start "$name" >/dev/null
  wait_for_session_route "$(<"$2/url")" 60
  ;;
logs)
  [[ ! -f $2/server.log ]] || cat "$2/server.log"
  [[ ! -f $2/name ]] || podman logs "$(<"$2/name")" 2>&1
  ;;
sql)
  podman exec -i "$(<"$2/name")" node -e 'const { DatabaseSync } = require("node:sqlite"); new DatabaseSync("/data/threadsift.db", { timeout: 5000 }).exec(process.argv[1])' "$3"
  ;;
query)
  podman exec -i "$(<"$2/name")" node -e 'const { DatabaseSync } = require("node:sqlite"); console.log(JSON.stringify(new DatabaseSync("/data/threadsift.db", { timeout: 5000 }).prepare(process.argv[1]).all()))' "$3"
  ;;
file-read)
  podman exec -i "$(<"$2/name")" node --input-type=module-typescript - "/data/files/$3" <tools/e2e/read-container-file.ts
  ;;
file-write)
  podman exec -i "$(<"$2/name")" sh -c 'mkdir -p -- "$(dirname -- "$1")" && cat >"$1"' sh "/data/files/$3"
  ;;
file-list)
  podman exec -i "$(<"$2/name")" node --input-type=module-typescript - "$3" <tools/e2e/list-container-files.ts
  ;;
stop)
  [[ -f $2/name ]] || exit 0
  podman logs "$(<"$2/name")" >>"$2/server.log" 2>&1 || true
  podman rm --force "$(<"$2/name")" >/dev/null 2>&1 || true
  podman volume rm --force "$(<"$2/volume")" >/dev/null 2>&1 || true
  rm -f "$2/name"
  ;;
*)
  require_current_image
  run_suite "$self" "$@"
  ;;
esac
