#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

images=$(podman images --filter label=threadsift.checkout --format $'{{.Id}}\t{{index .Labels "threadsift.checkout"}}' | sort -u)
while IFS=$'\t' read -r image checkout; do
  [[ -n $image && ! -d $checkout ]] || continue
  podman image rm --ignore "$image"
done <<<"$images"

exec podman build --signature-policy "$THREADSIFT_PODMAN_POLICY" \
  --label "threadsift.built-at=$(date +%s)" --label "threadsift.checkout=$DEVENV_ROOT" \
  --tag "$THREADSIFT_E2E_IMAGE" --file Containerfile .
