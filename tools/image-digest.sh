#!/usr/bin/env bash
set -euo pipefail

[[ $# -eq 1 ]] || {
  echo "usage: tools/image-digest.sh <registry image reference>" >&2
  exit 64
}
errors=$(mktemp)
trap 'rm -f "$errors"' EXIT

if skopeo inspect --no-tags --format '{{.Digest}}' "docker://$1" 2> "$errors"; then
  exit 0
fi
if grep -Eiq 'manifest unknown|name unknown|not found|requested access to the resource is denied|unauthorized' "$errors"; then
  exit 0
fi
cat "$errors" >&2
exit 1
