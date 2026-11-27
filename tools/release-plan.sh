#!/usr/bin/env bash
set -euo pipefail

usage="usage: tools/release-plan.sh <tag> [--changelog <file>] [--outputs <file>] [--notes <file>]"
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
changelog=$root/CHANGELOG.md
outputs=
notes=

fail() {
  echo "release-plan: $*" >&2
  exit 1
}

[[ $# -ge 1 ]] || {
  echo "$usage" >&2
  exit 64
}
tag=$1
shift
while [[ $# -gt 0 ]]; do
  [[ $# -ge 2 ]] || {
    echo "$usage" >&2
    exit 64
  }
  case "$1" in
    --changelog) changelog=$2 ;;
    --outputs) outputs=$2 ;;
    --notes) notes=$2 ;;
    *)
      echo "$usage" >&2
      exit 64
      ;;
  esac
  shift 2
done
if [[ -n $notes ]]; then
  : "${IMAGE:?set IMAGE to the image name, as the release workflow does, to write the notes}"
fi

number='(0|[1-9][0-9]*)'
identifier='(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)'
stable_pattern="^v$number\\.$number\\.$number\$"
[[ $tag =~ ^v$number\.$number\.$number(-$identifier(\.$identifier)*)?$ ]] ||
  fail "$tag is not a version tag: write v<major>.<minor>.<patch>, add -<pre-release> for a release candidate, and leave out +<build>"
major=${BASH_REMATCH[1]}
minor=${BASH_REMATCH[2]}
patch=${BASH_REMATCH[3]}
version=${tag#v}
candidate=true
[[ ! $tag =~ $stable_pattern ]] || candidate=false

key() {
  printf '%010d%010d%010d' "$1" "$2" "$3"
}
own_key=$(key "$major" "$minor" "$patch")
newer_any=
newer_in_major=
newer_in_minor=
previous=
previous_key=
while IFS= read -r other; do
  [[ -n $other && $other != "$tag" ]] || continue
  IFS=. read -r other_major other_minor other_patch <<< "${other#v}"
  other_key=$(key "$other_major" "$other_minor" "$other_patch")
  if [[ $other_key > $own_key ]]; then
    newer_any=$other
    if ((other_major == major)); then
      newer_in_major=$other
      if ((other_minor == minor)); then
        newer_in_minor=$other
      fi
    fi
  elif [[ $other_key < $own_key && $other_key > $previous_key ]]; then
    previous=$other
    previous_key=$other_key
  fi
done < <(git -C "$root" tag --list 'v*' | grep -E "$stable_pattern" || true)

image_tags=$version
move_release=false
latest=false
decisions=()
moving() {
  local name=$1 newer=$2
  if [[ $candidate == true ]]; then
    decisions+=("stay     image tag $name: a release candidate moves no moving tag")
  elif [[ -n $newer ]]; then
    decisions+=("stay     image tag $name: $newer is newer")
  else
    decisions+=("move     image tag $name to $version")
    image_tags+=" $name"
  fi
}

if [[ $candidate == true ]]; then
  decisions+=("$tag is a release candidate of $major.$minor.$patch.")
else
  decisions+=("$tag is a stable release.")
fi
decisions+=("publish  image tag $version")
moving "$major.$minor" "$newer_in_minor"
moving "$major" "$newer_in_major"
moving latest "$newer_any"
if [[ $candidate == true ]]; then
  decisions+=("stay     branch release: a release candidate never moves it")
elif [[ -n $newer_any ]]; then
  decisions+=("stay     branch release: $newer_any is newer")
else
  decisions+=("move     branch release to the commit of $tag")
  move_release=true
  latest=true
fi

if [[ $candidate == true ]]; then
  section="## Unreleased"
  heading_pattern="^## Unreleased\$"
else
  section="## $tag"
  heading_pattern="^## ${tag//./\\.}(: .+)?\$"
fi
[[ -f $changelog ]] || fail "$changelog does not exist; the notes of the GitHub Release come from its section \"$section\""
headings=$(grep -nE "$heading_pattern" "$changelog" || true)
[[ -n $headings ]] || fail "$changelog has no section headed \"$section\"; the notes of the GitHub Release come from it"
[[ $(wc -l <<< "$headings") -eq 1 ]] || fail "$changelog has more than one section headed \"$section\""
heading_line=${headings%%:*}
heading=${headings#*:}
headline=
[[ $heading != *": "* ]] || headline=${heading#*": "}
body=$(awk -v start="$heading_line" '
  NR > start && /^## / { exit }
  NR > start {
    lines[++count] = $0
    if ($0 ~ /[^[:space:]]/) {
      if (!first) first = count
      last = count
    }
  }
  END { for (line = first; first && line <= last; line++) print lines[line] }
' "$changelog")
[[ $candidate == true || -n $body ]] || fail "the section \"$section\" of $changelog is empty"

if [[ $candidate == true || $patch != 0 ]]; then
  [[ -z $headline ]] || fail "\"$heading\" has a headline, and only a stable release with patch 0 takes one; remove \": $headline\""
  title="Threadsift $version"
else
  title="Threadsift $major.$minor${headline:+: $headline}"
fi

kind="GitHub Release"
[[ $candidate == false ]] || kind="GitHub prerelease"
marks=
[[ $latest == false ]] || marks=", marked latest"
since=
[[ $candidate == true || -z $previous ]] || since=", and the pull requests since $previous"
printf '%s\n' "${decisions[@]}"
echo "create   $kind \"$title\"$marks, with the notes of \"$section\" in $(basename "$changelog")$since"

if [[ -n $outputs ]]; then
  {
    echo "version=$version"
    echo "image_tags=$image_tags"
    echo "move_release=$move_release"
    echo "prerelease=$candidate"
    echo "latest=$latest"
    echo "title=$title"
    echo "notes_start_tag=${since:+$previous}"
  } >> "$outputs"
fi

if [[ -n $notes ]]; then
  also=
  read -r -a moved <<< "${image_tags#"$version"}"
  if ((${#moved[@]} > 0)); then
    also=$(printf ", \`%s\`" "${moved[@]}")
    also=", also tagged ${also#, }"
  fi
  {
    [[ -z $body ]] || printf '%s\n\n' "$body"
    printf "Image: \`%s:%s\`%s, for \`linux/amd64\` and \`linux/arm64\`.\n" "$IMAGE" "$version" "$also"
  } > "$notes"
fi
