#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bot="$root/bot"
skill="$bot/skills/threadsift/SKILL.md"
sums="$bot/SHA256SUMS"
mode="${1:-refresh}"

computed_sums() {
  (cd "$bot" && sha256sum setup.md update.md) 
  (cd "$bot/scripts" && sha256sum threadsift.sh)
}

pinned() {
  grep -o "$1=[^ ;]*" "$skill" | head -n 1 | cut -d= -f2
}

sums_hash() {
  sha256sum "$sums" | cut -d' ' -f1
}

tag_known() {
  git -C "$root" rev-parse -q --verify "refs/tags/$1" > /dev/null 2>&1 ||
    git -C "$root" fetch --quiet --depth=1 origin "refs/tags/$1:refs/tags/$1" > /dev/null 2>&1
}

sums_at() {
  git -C "$root" show "$1:bot/SHA256SUMS"
}

released_tag() {
  local tag
  tag="$(pinned TAG)"
  [[ "$tag" != unreleased ]] && tag_known "$tag" && echo "$tag"
}

changelog_release() {
  local version="$1" temp
  temp="$(mktemp)"
  sed -E "s/^## Unreleased$/## Unreleased\n\n## bot-v$version/" "$bot/CHANGELOG.md" > "$temp"
  cat "$temp" > "$bot/CHANGELOG.md"
  rm -f "${temp:?}"
}

pin() {
  local tag="$1" hash="$2" temp
  temp="$(mktemp)"
  sed -E "s/TAG=[^ ;]+ SUMS_SHA256=[^ ;]+/TAG=$tag SUMS_SHA256=$hash/" "$skill" > "$temp"
  cat "$temp" > "$skill"
  rm -f "${temp:?}"
}

case "$mode" in
  refresh)
    if tag="$(released_tag)" && [[ "$(computed_sums)" != "$(sums_at "$tag")" ]]; then
      echo "a hashed file changed after $tag; run tools/bot-release.sh release" >&2
      exit 1
    fi
    computed_sums > "$sums"
    pin "$(pinned TAG)" "$(sums_hash)"
    ;;
  release)
    version=$(( $(< "$bot/VERSION") + 1 ))
    echo "$version" > "$bot/VERSION"
    computed_sums > "$sums"
    pin "bot-v$version" "$(sums_hash)"
    changelog_release "$version"
    echo "bot-v$version"
    ;;
  check)
    version="$(< "$bot/VERSION")"
    tag="$(pinned TAG)"
    [[ "$tag" == unreleased || "$tag" == "bot-v$version" ]] || { echo "SKILL.md pins tag $tag but bot/VERSION is $version" >&2; exit 1; }
    [[ "$(computed_sums)" == "$(< "$sums")" ]] || { echo "bot/SHA256SUMS does not match setup.md, update.md and scripts/threadsift.sh; run tools/bot-release.sh" >&2; exit 1; }
    [[ "$(pinned SUMS_SHA256)" == "$(sums_hash)" ]] || { echo "SKILL.md pins another SHA256SUMS hash; run tools/bot-release.sh" >&2; exit 1; }
    if tag="$(released_tag)"; then
      [[ "$(sums_at "$tag" | sha256sum | cut -d' ' -f1)" == "$(pinned SUMS_SHA256)" ]] || { echo "a hashed file changed after $tag, so the bootstrap line cannot install it; run tools/bot-release.sh release" >&2; exit 1; }
    fi
    ;;
  *)
    echo "usage: tools/bot-release.sh [refresh|release|check]" >&2
    exit 64
    ;;
esac
