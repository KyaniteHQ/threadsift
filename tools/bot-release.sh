#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bot="$root/bot"
skill="$bot/skills/threadsift/SKILL.md"
sums="$bot/SHA256SUMS"
expected="$root/src/features/bot/core/expected-bot-release.ts"
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

sums_at() {
  git -C "$root" show "$1:bot/SHA256SUMS"
}

released_tag() {
  local tag status=0
  tag="$(pinned TAG)"
  if git -C "$root" rev-parse -q --verify "refs/tags/$tag" > /dev/null 2>&1; then
    echo "$tag"
    return 0
  fi
  git -C "$root" ls-remote --exit-code --tags origin "refs/tags/$tag" > /dev/null 2>&1 || status=$?
  case "$status" in
    0)
      git -C "$root" fetch --quiet --depth=1 origin "refs/tags/$tag:refs/tags/$tag" > /dev/null 2>&1 || status=$?
      ;;
    2)
      return 0
      ;;
  esac
  if [[ "$status" != 0 ]]; then
    echo "could not look up the tag $tag on origin (git exit $status), so the release state is unknown" >&2
    return 1
  fi
  echo "$tag"
}

expected_module() {
  printf 'export const EXPECTED_BOT_RELEASE = {\n  tag: "%s",\n  sumsSha256: "%s",\n  skillSha256: "%s",\n} as const;\n' \
    "$(pinned TAG)" "$(sums_hash)" "$(sha256sum "$skill" | cut -d' ' -f1)"
}

expected_written() {
  mkdir -p "$(dirname "$expected")"
  expected_module > "$expected"
}

pin() {
  local tag="$1" hash="$2"
  sed -E -i "s/TAG=[^ ;]+ SUMS_SHA256=[^ ;]+/TAG=$tag SUMS_SHA256=$hash/" "$skill"
}

case "$mode" in
  refresh)
    tag="$(released_tag)"
    if [[ -n "$tag" && "$(computed_sums)" != "$(sums_at "$tag")" ]]; then
      echo "a hashed file changed after $tag; run tools/bot-release.sh release" >&2
      exit 1
    fi
    computed_sums > "$sums"
    pin "$(pinned TAG)" "$(sums_hash)"
    expected_written
    ;;
  release)
    version=$(( $(< "$bot/VERSION") + 1 ))
    echo "$version" > "$bot/VERSION"
    computed_sums > "$sums"
    pin "bot-v$version" "$(sums_hash)"
    expected_written
    sed -E -i "s/^## Unreleased$/## Unreleased\n\n## bot-v$version/" "$bot/CHANGELOG.md"
    echo "bot-v$version"
    ;;
  check)
    version="$(< "$bot/VERSION")"
    tag="$(pinned TAG)"
    [[ "$tag" == "bot-v$version" ]] || { echo "SKILL.md pins tag $tag but bot/VERSION is $version" >&2; exit 1; }
    [[ "$(computed_sums)" == "$(< "$sums")" ]] || { echo "bot/SHA256SUMS does not match setup.md, update.md and scripts/threadsift.sh; run tools/bot-release.sh" >&2; exit 1; }
    [[ "$(pinned SUMS_SHA256)" == "$(sums_hash)" ]] || { echo "SKILL.md pins another SHA256SUMS hash; run tools/bot-release.sh" >&2; exit 1; }
    tag="$(released_tag)"
    if [[ -n "$tag" ]]; then
      [[ "$(sums_at "$tag" | sha256sum | cut -d' ' -f1)" == "$(pinned SUMS_SHA256)" ]] || { echo "a hashed file changed after $tag, so the bootstrap line cannot install it; run tools/bot-release.sh release" >&2; exit 1; }
    fi
    [[ -f "$expected" && "$(expected_module)" == "$(< "$expected")" ]] || { echo "the bot release the Instance expects is not the tag and hashes of bot/; run tools/bot-release.sh" >&2; exit 1; }
    ;;
  *)
    echo "usage: tools/bot-release.sh [refresh|release|check]" >&2
    exit 64
    ;;
esac
