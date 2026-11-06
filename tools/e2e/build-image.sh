#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

: "${THREADSIFT_PODMAN_POLICY:?run inside the devenv shell for this checkout}"
: "${THREADSIFT_CHECKOUT:?run inside the devenv shell for this checkout}"
: "${THREADSIFT_E2E_IMAGE:?run inside the devenv shell for this checkout}"

images=$(podman images --filter label=threadsift.checkout --format $'{{.Id}}\t{{index .Labels "threadsift.checkout"}}\t{{.IsDangling}}' | sort -u)
while IFS=$'\t' read -r image checkout dangling; do
  [[ -n $image ]] || continue
  if [[ ! -d $checkout || ( $checkout == "$THREADSIFT_CHECKOUT" && $dangling == true ) ]]; then
    podman image rm --ignore "$image" || printf 'kept %s of %s: podman could not remove it\n' "$image" "$checkout" >&2
  fi
done <<<"$images"

exec podman build --signature-policy "$THREADSIFT_PODMAN_POLICY" \
  --label "threadsift.built-at=$(date +%s)" --label "threadsift.checkout=$THREADSIFT_CHECKOUT" \
  --tag "$THREADSIFT_E2E_IMAGE" --file Containerfile .
