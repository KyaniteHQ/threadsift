#!/usr/bin/env bash
set -euo pipefail

[[ $# -eq 1 ]] || {
  echo "usage: tools/start-check.sh <image>" >&2
  exit 64
}
image=$1
seconds=60

podman image exists "$image" || podman pull --quiet "$image" > /dev/null

volume=$(podman volume create)
container=
cleanup() {
  [[ -z $container ]] || podman rm --force --time 0 "$container" > /dev/null || echo "start-check: could not remove container $container" >&2
  podman volume rm --force "$volume" > /dev/null || echo "start-check: could not remove volume $volume" >&2
}
trap cleanup EXIT

container=$(podman run --detach --pull=never --publish 127.0.0.1::8080 --env PORT=8080 --volume "$volume:/data" "$image")
SECONDS=0
port=$(podman port "$container" 8080/tcp | head -n 1 | sed 's/.*://')
url=http://127.0.0.1:$port/api/session

while ((SECONDS < seconds)); do
  code=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time "$((seconds - SECONDS > 2 ? 2 : seconds - SECONDS))" "$url" || true)
  if [[ $code == 200 ]]; then
    echo "start-check: $image answered 200 on /api/session after ${SECONDS} s"
    exit 0
  fi
  [[ $(podman container inspect --format '{{.State.Running}}' "$container") == true ]] || break
  sleep 1
done

echo "start-check: $image did not answer 200 on /api/session after ${SECONDS} s (limit $seconds s); container log:" >&2
podman logs --tail 40 "$container" >&2 || true
exit 1
