#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

image=threadsift:e2e
name="threadsift-e2e-$$"
volume="$name-data"
port=$(node -e 'const s = require("node:net").createServer().listen(0, "127.0.0.1", () => { console.log(s.address().port); s.close(); })')

cleanup() {
  podman rm --force "$name" >/dev/null 2>&1 || true
  podman volume rm --force "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT

podman run --detach --name "$name" --publish "127.0.0.1:$port:8080" --volume "$volume:/data" "$image" >/dev/null

export THREADSIFT_BASE_URL="http://127.0.0.1:$port"
export THREADSIFT_RESTART="podman restart $name"
export THREADSIFT_TARGET=container
export THREADSIFT_APP_EXEC="podman exec -i $name"

for _ in $(seq 1 60); do
  curl --silent --fail "$THREADSIFT_BASE_URL/api/items" >/dev/null && break
  sleep 1
done
curl --silent --fail "$THREADSIFT_BASE_URL/api/items" >/dev/null || {
  podman logs "$name" >&2
  echo "the container did not answer on $THREADSIFT_BASE_URL" >&2
  exit 1
}

pnpm exec playwright test "$@"
