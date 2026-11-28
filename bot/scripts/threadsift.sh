#!/usr/bin/env bash
set -euo pipefail
umask 077

stdin_is_open() { { true 3<&0; } 2> /dev/null; }
stdin_is_open || exec 0< /dev/null

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command="${1:-}"
first="${2:-}"
second="${3:-}"
third="${4:-}"

WRITE_CAP=8388608
NAME='^[a-z][a-z0-9-]{0,31}-([0-9a-f]{32})\.(json|txt)$'
ORIGIN='^(https://[A-Za-z0-9.-]+(:[0-9]{1,5})?|http://(127\.0\.0\.1|localhost):[0-9]{1,5})$'
TAG='^bot-v(0|[1-9][0-9]{0,8})$'
SHA='^[0-9a-f]{64}$'
FIRST_SELF_UPDATING=14
TASK_LOCK_WAIT=20
UPDATE_DEADLINE=120
RAW=https://raw.githubusercontent.com/KyaniteHQ/threadsift
FETCH_CAP=1048576
MANIFEST=RELEASE.sha256
RELEASED=(CHANGELOG.md SKILL.md setup.md threadsift-bookmarks.md threadsift-webhook.md threadsift.sh update.md)
ROUTINES=(threadsift-webhook threadsift-bookmarks)

route_of() {
  case "$1" in
    check) method=GET; template="/api/items"; credential=agent ;;
    topics) method=GET; template="/api/topics"; credential=agent ;;
    search) method=GET; template="/api/items"; credential=agent ;;
    save) method=POST; template="/api/items"; credential=agent ;;
    bookmarks-cursor) method=GET; template="/api/imports/{name}"; credential=agent ;;
    bookmarks-send) method=POST; template="/api/items/batch"; credential=agent ;;
    task-open) method=GET; template="/api/ai-tasks/{id}"; credential=task ;;
    task-answer) method=POST; template="/api/ai-tasks/{id}/result"; credential=task ;;
    task-intake) method=POST; template="/api/ai-tasks/{id}/intake"; credential=task ;;
    task-error) method=POST; template="/api/ai-tasks/{id}/result"; credential=task ;;
    update) method=PUT; template="/api/bot/install"; credential=agent ;;
    *) return 1 ;;
  esac
}

word_of() {
  case "$command:$1" in
    check:200|topics:200|search:200|task-open:200|bookmarks-cursor:200|bookmarks-send:200|update:200) echo ok ;;
    task-answer:204|task-intake:204|task-error:204|save:201) echo ok ;;
    save:200) echo duplicate ;;
    bookmarks-cursor:404) echo none ;;
    *:400) echo invalid ;;
    *:401) echo unauthorized ;;
    *:403) echo forbidden ;;
    *:409) echo closed ;;
    *:413) echo too-large ;;
    save:429|bookmarks-send:429) echo budget-spent ;;
    *:000) echo unreachable ;;
    *) echo failed ;;
  esac
}

reason_of() {
  case "$1" in
    unsupported-kind) sentence="The bot does not know this kind of task." ;;
    unreadable-input) sentence="The bot could not read the input of the task." ;;
    no-answer) sentence="The bot could not make an answer that fits the task." ;;
    *) return 1 ;;
  esac
}

work=""
part=""
joined=""
inputs=()
parts=()
spoken=""

cleanup() {
  [[ -z "$work" ]] || rm -rf -- "${work:?}"
  [[ -z "$part" ]] || rm -f -- "${part:?}"
  [[ -z "$joined" ]] || rm -f -- "${joined:?}"
  [[ ${#inputs[@]} -eq 0 ]] || rm -f -- "${inputs[@]}"
  [[ ${#parts[@]} -eq 0 ]] || rm -f -- "${parts[@]}"
}
trap cleanup EXIT

said() { spoken=yes; printf '%s\n' "$1"; }

interrupted() { [[ -n "$spoken" ]] || said failed; exit 143; }
trap interrupted TERM INT

stop() { said "$1"; [[ -z "${2:-}" ]] || echo "$2" >&2; exit 2; }

inside() {
  python3 -I -c '
import os, sys

path = os.path.realpath(sys.argv[1])
for folder in sys.argv[2:]:
    root = os.path.realpath(folder)
    if path.startswith(root + os.sep) and os.path.isfile(path):
        print(path)
        sys.exit(0)
sys.exit(1)
' "$@"
}

take() {
  taken="$(inside "$1" "$HERE/tmp")" || stop bad-input "$2 must be a file in ~/threadsift/tmp"
  inputs+=("$taken")
}

plain_dirs() {
  local dir
  for dir in tmp tasks state; do
    [[ ! -L "$HERE/$dir" ]] || stop bad-input "$dir must not be a link"
  done
  mkdir -p "$HERE/tmp" "$HERE/tasks" "$HERE/state"
}

folder_of() {
  [[ "$1" =~ ^[1-9][0-9]{0,15}$ ]] || stop bad-input "bad task id"
  folder="$HERE/tasks/$1"
}

hash_of() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

part_of() {
  made="$(mktemp "$1.part.XXXXXX")" || return 1
  parts+=("$made")
}

stored_file() {
  local made
  part_of "$2" && cat -- "$1" > "$made" && mv -T -- "$made" "$2"
}

opened_with() {
  [[ -f "$folder/task.json" && ! -f "$folder/done" && -f "$folder/token" ]] || return 1
  [[ "$(< "$folder/token")" == "$1" && -n "$(find "$folder/task.json" -maxdepth 0 -mmin -60)" ]]
}

holds_token() { [[ ! -f "$folder/token" || "$(< "$folder/token")" == "$1" ]]; }

task_locked() {
  if ! command -v flock > /dev/null; then
    [[ -e "$HERE/state/told-no-flock" ]] && return 0
    echo "flock is missing, so runs of one task are not ordered" >&2
    : > "$HERE/state/told-no-flock" || true
    return 0
  fi
  exec 8> "$HERE/tmp/open-$1.lock" || stop failed "the lock of the task cannot be opened"
  flock -w "$TASK_LOCK_WAIT" 8 &
  wait "$!" || stop failed "another run held the task for $TASK_LOCK_WAIT seconds"
}

mark_word() {
  local hex
  hex="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')" || true
  [[ "$hex" =~ ^[0-9a-f]{32}$ ]] || stop failed "no random bytes"
  said "TS_$hex"
}

written() {
  local mode="$1" name="$2" target size
  [[ "$name" =~ $NAME ]] || stop bad-input "bad file name"
  target="$HERE/tmp/$name"
  if [[ "$mode" == append ]]; then
    [[ -f "$target" && ! -L "$target" ]] || stop bad-input "append needs a file that write made"
  fi
  part="$HERE/tmp/.$name.part"
  head -c $((WRITE_CAP + 2)) 2> /dev/null > "$part" || stop bad-input "no text on standard input"
  [[ "$(tail -c 1 "$part" | od -An -tx1 | tr -d ' \n')" != 0a ]] || truncate -s -1 -- "$part"
  size="$(wc -c < "$part")"
  [[ "$mode" != append ]] || size=$((size + $(wc -c < "$target")))
  [[ "$size" -le "$WRITE_CAP" ]] || stop bad-input "the text is over 8 MiB"
  if [[ "$mode" == append ]]; then
    joined="$HERE/tmp/.$name.join"
    cat -- "$target" "$part" > "$joined" || stop failed "cannot join the parts"
    mv -T -- "$joined" "$target" || stop failed "cannot store the file"
  else
    mv -T -- "$part" "$target" || stop failed "cannot store the file"
  fi
  said ok
}

forgotten() {
  [[ "$1" =~ ^[0-9a-f]{32}$ ]] || stop bad-input "forget takes the hex of a mark"
  rm -f -- "${HERE:?}/tmp/search-$1.json" "${HERE:?}/tmp/topics-$1.json"
  said ok
}

same_address() {
  local typed
  take "$1" "the address file"
  [[ "$(basename "$taken")" =~ $NAME ]] || stop bad-input "the address file needs a name made by write"
  typed="$(< "$taken")"
  [[ "$typed" =~ $ORIGIN ]] || stop bad-input "the address must be an https address with the host, a port when it has one, and nothing after it"
  [[ "${THREADSIFT_URL:-}" =~ $ORIGIN ]] || stop not-configured "THREADSIFT_URL must be an https address with no path"
  if [[ "${typed,,}" == "${THREADSIFT_URL,,}" ]]; then said ok; else said differs; fi
}

pruned_tasks() {
  local tasks="$HERE/tasks"
  find "$HERE/tmp" -maxdepth 1 -type f -mmin +1440 -delete 2> /dev/null || true
  find "$HERE" -maxdepth 3 -type f -name '*.part.*' -mmin +1440 -delete 2> /dev/null || true
  find "$HERE" -mindepth 1 -maxdepth 1 -type d -name '.release-*' -mmin +1440 -exec rm -rf -- {} + 2> /dev/null || true
  find "$tasks" -mindepth 2 -maxdepth 2 -type f -regextype posix-extended -regex '.*/tasks/[1-9][0-9]{0,15}/done' -mmin +10080 \
    -exec sh -c 'for each; do rm -rf -- "${each%/*}"; done' _ {} + 2> /dev/null || true
  find "$tasks" -mindepth 2 -maxdepth 2 -type f -regextype posix-extended -regex '.*/tasks/[1-9][0-9]{0,15}/task\.json' -mmin +1440 \
    -exec sh -c 'for each; do [ -e "${each%/*}/done" ] || rm -rf -- "${each%/*}"; done' _ {} + 2> /dev/null || true
  find "$tasks" -mindepth 2 -maxdepth 2 -type f -regextype posix-extended -regex '.*/tasks/[1-9][0-9]{0,15}/token' -mmin +1440 -delete 2> /dev/null || true
}

tag_in() {
  local found
  [[ -f "$1" ]] || return 1
  found="$(head -c 64 -- "$1")"
  found="${found%$'\n'}"
  [[ "$found" =~ $TAG ]] || return 1
  printf '%s' "$found"
}

kept() {
  local made
  part_of "$1" && printf '%s\n' "$2" > "$made" && mv -T -- "$made" "$1"
}

sha_of() { sha256sum < "$1" | cut -d' ' -f1; }

staged_tag() {
  local found
  [[ -f "$HERE/skill/SKILL.md" && -f "$HERE/state/skill-sha" ]] || return 1
  [[ "$(sha_of "$HERE/skill/SKILL.md")" == "$(head -c 64 -- "$HERE/state/skill-sha")" ]] || return 1
  found="$(grep -o -m 1 'TAG=[^ ;]*' -- "$HERE/skill/SKILL.md" | head -n 1)" || return 1
  found="${found#TAG=}"
  [[ "$found" =~ $TAG ]] || return 1
  printf '%s' "$found"
}

again() {
  command -v timeout > /dev/null || return 0
  timeout "$UPDATE_DEADLINE" bash "$HERE/threadsift.sh" update "$1" > /dev/null 2>&1 || true
}

noticed() {
  local kind claimed found
  mkdir -p -- "$HERE/state"
  for kind in refused older routines; do
    claimed="$HERE/state/.claimed-$kind-$$"
    mv -T -- "$HERE/state/notice-$kind" "$claimed" 2> /dev/null || continue
    found="$(tag_in "$claimed")" || found=""
    rm -f -- "$claimed"
    [[ -n "$found" ]] || continue
    [[ "$kind" == routines ]] || : > "$HERE/state/told-$kind-$found"
    said "$kind $found"
    return 0
  done
  said none
}

skill_staged() {
  local found
  if found="$(staged_tag)"; then said "staged $found"; else said none; fi
}

skill_saved() (
  local found
  [[ "$1" =~ $TAG ]] || stop bad-input "skill-saved takes the tag skill-staged printed"
  mkdir -p -- "$HERE/state"
  exec 9> "$HERE/state/install.lock"
  flock -w 30 9 || stop failed "another update holds the install lock"
  found="$(staged_tag)" || { said none; exit 0; }
  [[ "$found" == "$1" ]] || stop bad-input "another skill is staged; run skill-staged again"
  rm -f -- "$HERE/skill/SKILL.md" "$HERE/state/skill-sha" "$HERE/state/skill-version"
  exec 9>&-
  again report
  said ok
)

[[ "$command" != mark ]] || { mark_word; exit 0; }

plain_dirs
pruned_tasks

case "$command" in
  forget) forgotten "$first"; exit 0 ;;
  same-address) same_address "$first"; exit 0 ;;
  write) written write "$first"; exit 0 ;;
  append) written append "$first"; exit 0 ;;
  notice) noticed; exit 0 ;;
  skill-staged) skill_staged; exit 0 ;;
  skill-saved) skill_saved "$first"; spoken=yes; exit 0 ;;
esac

[[ "$command" != task-intake ]] && route_of "$command" || stop bad-input "unknown command"

id=""
token=""
folder=""
taken=""
link_file=""
ids_file=""
import_name=""
thread_file=""
query_file=""
answer_file=""

case "$command" in
  save) take "$first" "the link file"; link_file="$taken"; [[ -z "$second" ]] || { take "$second" "the thread file"; thread_file="$taken"; } ;;
  search) take "$first" "the query file"; query_file="$taken" ;;
  bookmarks-send) take "$first" "the id file"; ids_file="$taken" ;;
  task-answer) take "$second" "the answer file"; answer_file="$taken" ;;
  update)
    case "$first" in
      ""|auto|report) ;;
      *) stop bad-input "update takes no word, auto or report" ;;
    esac
    installed="$(tag_in "$HERE/VERSION")" || stop bad-input "~/threadsift/VERSION holds no release tag"
    skill_tag="$installed"
    if staged_tag > /dev/null; then skill_tag="$(tag_in "$HERE/state/skill-version")" || skill_tag="$installed"; fi
    refused_tag="$(tag_in "$HERE/state/refused")" || refused_tag=""
    ;;
esac

if [[ "$command" == task-open ]]; then
  take "$first" "the event file"
  event="$taken"
  parsed="$(python3 -I - "$event" <<'PY'
import json, re, sys

try:
    with open(sys.argv[1]) as handle:
        event = json.load(handle)
    if not isinstance(event, dict):
        sys.exit(1)
    kind = event.get("kind")
    if kind == "ping":
        print("ping")
        sys.exit(0)
    task = event.get("taskId")
    token = event.get("callbackToken")
    if isinstance(task, bool) or not isinstance(task, (int, str)):
        sys.exit(1)
    task = str(task)
    if not (isinstance(kind, str) and isinstance(token, str)):
        sys.exit(1)
    if not (re.fullmatch(r"[1-9][0-9]{0,15}", task) and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", token) and re.fullmatch(r"[a-z][a-z_]{0,39}", kind)):
        sys.exit(1)
    print(task, token, kind)
except Exception:
    sys.exit(1)
PY
  )" || stop bad-input "the event is not a task of this Instance"
  [[ "$parsed" != ping ]] || { said ping; exit 0; }
  read -r id token _ <<< "$parsed"
  folder_of "$id"
  task_locked "$id"
  if [[ -f "$folder/done" && "$(< "$folder/done")" == "$(hash_of "$token")" ]]; then
    said already-done
    exit 0
  fi
  if opened_with "$token"; then
    said already-open
    exit 0
  fi
fi

URL="${THREADSIFT_URL:-}"
[[ "$URL" =~ $ORIGIN ]] || stop not-configured "THREADSIFT_URL must be an https address with no path"

work="$(mktemp -d)"
request="$work/request"
response="$work/response"
options=()
path="$template"
out=""

if [[ "$credential" == agent ]]; then
  token="${THREADSIFT_AGENT_TOKEN:-}"
  [[ -n "$token" ]] || stop not-configured "THREADSIFT_AGENT_TOKEN is not set"
fi

if [[ "$command" == task-open ]]; then
  path="${template//\{id\}/$id}"
elif [[ "$credential" == task ]]; then
  folder_of "$first"
  id="$first"
  task_locked "$id"
  [[ -f "$folder/token" ]] || stop bad-input "no token file"
  token="$(< "$folder/token")"
  [[ -f "$folder/task.json" ]] || stop bad-input "run task-open first"
  kind="$(python3 -I -c 'import json,re,sys; print(re.fullmatch(r"[a-z][a-z_]{0,39}", json.load(open(sys.argv[1]))["kind"]).group(0))' "$folder/task.json" 2>/dev/null)" || stop bad-input "task.json is not readable"
  if [[ "$kind" == x_intake ]]; then
    [[ "$command" == task-answer ]] || stop bad-input "an X link task takes an answer or none"
    command=task-intake
    route_of "$command"
  fi
  path="${template//\{id\}/$id}"
fi

[[ "$command" != bookmarks-cursor ]] || path="${template//\{name\}/x-bookmarks}"

[[ "$token" =~ ^[A-Za-z0-9_-]{1,64}$ ]] || stop bad-input "bad credential"

case "$command" in
  check) options=(--get --data-urlencode "url=https://example.com/") ;;
  update)
    if [[ -n "$refused_tag" ]]; then refused_json="\"$refused_tag\""; else refused_json=null; fi
    printf '{"version":"%s","skill":"%s","refused":%s}' "$installed" "$skill_tag" "$refused_json" > "$request"
    options=(--header "Content-Type: application/json" --data-binary "@$request")
    ;;
  topics)
    [[ "$first" =~ ^[0-9a-f]{32}$ ]] || stop bad-input "topics takes the hex of a fresh mark"
    out="$HERE/tmp/topics-$first.json"
    ;;
  search)
    [[ "$(basename "$query_file")" =~ $NAME ]] || stop bad-input "the query file needs a name made by write"
    out="$HERE/tmp/search-${BASH_REMATCH[1]}.json"
    query="$(python3 -I -c '
import sys

text = open(sys.argv[1]).read().rstrip("\n")
if text.strip() == "" or "\n" in text or "\r" in text:
    sys.exit(1)
print(text)
' "$query_file")" || stop bad-input "the query must be one line"
    options=(--get --data-urlencode "q=$query")
    ;;
  save|task-intake|task-answer|task-error|bookmarks-send)
    mode="$command"
    arg1="" arg2=""
    case "$command" in
      save) arg1="$link_file"; arg2="$thread_file" ;;
      bookmarks-send)
        case "$second:$third" in
          :) ;;
          cursor:) import_name=x-bookmarks ;;
          cursor:all) import_name=x-bookmarks-all ;;
          *) stop bad-input "the words after the file are cursor, or cursor all" ;;
        esac
        arg1="$ids_file"; arg2="$import_name"
        ;;
      task-error)
        reason_of "$second" || stop bad-input "unknown reason word"
        arg1="$sentence"
        ;;
      *) arg1="$answer_file" ;;
    esac
    if ! python3 -I - "$mode" "$arg1" "$arg2" > "$request" 2> "$work/reasons" <<'PY'
import json, re, sys

mode, first, extra = sys.argv[1:4]

def load(path):
    with open(path) as handle:
        return json.load(handle)

try:
    if mode == "task-error":
        body = {"error": first}
    elif mode == "task-intake":
        body = load(first)
        if not isinstance(body, dict):
            sys.exit("the answer must be a JSON object")
    elif mode == "task-answer":
        body = {"result": load(first)}
    elif mode == "bookmarks-send":
        found = load(first)
        ids = found.get("ids") if isinstance(found, dict) and list(found) == ["ids"] else None
        if not (isinstance(ids, list) and 1 <= len(ids) <= 100 and all(isinstance(each, str) and re.fullmatch(r"[0-9]{1,30}", each) for each in ids)):
            sys.exit("the file must hold only ids, 1 to 100 post ids as digit strings")
        body = {"links": [{"url": f"https://x.com/i/status/{each}"} for each in ids]}
        if extra:
            body["import"] = {"name": extra, "cursor": ids[0]}
    else:
        with open(first) as handle:
            link = handle.read().rstrip("\n")
        if not re.fullmatch(r"https?://[^\s\x00-\x1f\x7f]{1,2000}", link):
            sys.exit("the link must be one http or https URL on one line")
        body = {"url": link}
        if extra:
            with open(extra) as handle:
                body["content"] = handle.read()
    json.dump(body, sys.stdout)
except SystemExit:
    raise
except Exception as failure:
    print(type(failure).__name__, file=sys.stderr)
    sys.exit(5)
PY
    then
      cat "$work/reasons" >&2
      said bad-input
      exit 2
    fi
    options=(--header "Content-Type: application/json" --data-binary "@$request")
    ;;
esac

curl --disable --silent --show-error --max-redirs 0 --max-time 60 \
  --request "$method" \
  --config <(printf 'header = "Authorization: Bearer %s"\n' "$token") \
  ${options[@]+"${options[@]}"} \
  --output "$response" --write-out '%{http_code}' \
  "$URL$path" > "$work/status" 2> /dev/null &
if wait "$!"; then status="$(< "$work/status")"; else status=000; fi

word="$(word_of "$status")"

if [[ "$word" == invalid ]]; then
  if [[ -n "$folder" && -d "$folder" ]]; then stored_file "$response" "$folder/errors.txt"; else cat "$response" >&2; fi
fi

shaped() {
  python3 -I -c '
import json, re, sys

body = json.load(open(sys.argv[1]))
mode = sys.argv[2]
if not isinstance(body, dict):
    sys.exit(1)
if mode in ("check", "search"):
    ok = isinstance(body.get("items"), list)
elif mode == "bookmarks-cursor":
    ok = isinstance(body.get("cursor"), str)
elif mode == "bookmarks-send":
    sent = len(json.load(open(sys.argv[3]))["links"])
    ok = isinstance(body.get("results"), list) and len(body["results"]) == sent and all(isinstance(each, dict) and each.get("outcome") in ("added", "known", "refused") for each in body["results"])
elif mode == "topics":
    ok = isinstance(body.get("topics"), list)
elif mode == "update":
    expected = body.get("expected")
    ok = isinstance(expected, dict) and isinstance(body.get("autoInstall"), bool) and all(
        isinstance(expected.get(key), str) for key in ("tag", "manifestSha256")
    )
else:
    ok = (
        isinstance(body.get("taskId"), int)
        and isinstance(body.get("kind"), str)
        and re.fullmatch(r"[a-z][a-z_]{0,39}", body["kind"]) is not None
        and isinstance(body.get("instructions"), str)
        and isinstance(body.get("input"), str)
        and isinstance(body.get("schema"), dict)
    )
sys.exit(0 if ok else 1)
' "$response" "$command" "$request" 2> /dev/null
}

if [[ "$word" == ok && ( "$method" == GET || "$command" == bookmarks-send || "$command" == update ) ]] && ! shaped; then word=failed; fi

fetched() {
  local status
  status="$(curl --disable --silent --proto =https --max-redirs 0 --max-time 15 --max-filesize "$FETCH_CAP" \
    --output "$2" --write-out '%{http_code}' "$RAW/$1" 2> /dev/null)" || return 1
  case "$status" in
    200) return 0 ;;
    404) return 4 ;;
    *) return 1 ;;
  esac
}

source_of() {
  case "$1" in
    SKILL.md) echo bot/skills/threadsift/SKILL.md ;;
    threadsift.sh) echo bot/scripts/threadsift.sh ;;
    threadsift-*.md) echo "bot/routines/$1" ;;
    *) echo "bot/$1" ;;
  esac
}

listed() {
  local line name sum expected
  declare -gA sums=()
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^([0-9a-f]{64})\ \ ([A-Za-z0-9._-]{1,64})$ ]] || return 1
    sum="${BASH_REMATCH[1]}"
    name="${BASH_REMATCH[2]}"
    [[ "$name" != *..* && -z "${sums[$name]+set}" ]] || return 1
    sums[$name]="$sum"
  done < "$1"
  expected="$(printf '%s\n' "${RELEASED[@]}")"
  [[ "$(printf '%s\n' "${!sums[@]}" | LC_ALL=C sort)" == "$expected" ]]
}

prompt_of() { python3 -I -c 'import sys; print(open(sys.argv[1]).read().split("Prompt:\n\n", 1)[1].strip())' "$1" 2> /dev/null; }

routines_changed() {
  local tag="$1" stage="$2" name prompt
  [[ "$(tag_in "$HERE/state/pending-routines" || true)" != "$tag" ]] || return 0
  for name in "${ROUTINES[@]}"; do
    prompt="$(prompt_of "$stage/$name.md")" || return 0
    [[ -n "$prompt" && -f "$HERE/setup.md" ]] || return 0
    grep -q -F -- "$prompt" "$HERE/setup.md" || return 0
  done
  return 1
}

released() (
  local tag="$1" manifest="$2" old="$3" name outcome=0
  for name in sha256sum curl mktemp flock; do command -v "$name" > /dev/null || exit 1; done
  mkdir -p -- "$HERE/state" "$HERE/routines" "$HERE/skill" || exit 1
  exec 9> "$HERE/state/install.lock"
  flock -n 9 || exit 1
  stage="$(mktemp -d "$HERE/.release-XXXXXXXX")" || exit 1
  trap 'rm -rf -- "${stage:?}"' EXIT
  fetched "$tag/bot/$MANIFEST" "$stage/$MANIFEST" || exit $?
  [[ "$(sha_of "$stage/$MANIFEST")" == "$manifest" ]] || exit 3
  listed "$stage/$MANIFEST" || exit 5
  for name in "${RELEASED[@]}"; do
    fetched "$tag/$(source_of "$name")" "$stage/$name" || outcome=$?
    [[ "$outcome" == 0 ]] || exit 1
    [[ "$(sha_of "$stage/$name")" == "${sums[$name]}" ]] || exit 3
  done
  if routines_changed "$tag" "$stage"; then kept "$HERE/state/pending-routines" "$tag" || exit 1; else rm -f -- "$HERE/state/pending-routines"; fi
  chmod 700 "$stage/threadsift.sh" || exit 1
  for name in CHANGELOG.md setup.md update.md threadsift.sh; do mv -T -- "$stage/$name" "$HERE/$name" || exit 1; done
  for name in "${ROUTINES[@]}"; do mv -T -- "$stage/$name.md" "$HERE/routines/$name.md" || exit 1; done
  staged_tag > /dev/null || kept "$HERE/state/skill-version" "$old" || exit 1
  kept "$HERE/state/skill-sha" "${sums[SKILL.md]}" || exit 1
  mv -T -- "$stage/SKILL.md" "$HERE/skill/SKILL.md" || exit 1
  kept "$HERE/VERSION" "$tag" || exit 1
  rm -f -- "$HERE/state/refused" "$HERE/state/notice-refused" "$HERE/state/notice-older" "$HERE"/state/told-refused-* "$HERE"/state/told-older-*
)

told_once() {
  local kind="$1" tag="$2"
  [[ -e "$HERE/state/told-$kind-$tag" || "$(tag_in "$HERE/state/notice-$kind" || true)" == "$tag" ]] ||
    kept "$HERE/state/notice-$kind" "$tag" || true
}

refused_release() {
  local tag="$1" mode="$2"
  kept "$HERE/state/refused" "$tag" || true
  if [[ "$mode" == auto ]]; then
    told_once refused "$tag"
  else
    : > "$HERE/state/told-refused-$tag" || true
    rm -f -- "$HERE/state/notice-refused"
  fi
}

stale_notices_dropped() {
  local kind
  for kind in refused older; do
    [[ "$(tag_in "$HERE/state/notice-$kind" || true)" == "$1" ]] || rm -f -- "$HERE/state/notice-$kind"
  done
}

routines_told() {
  local tag="$1" mode="$2"
  if [[ "$mode" == auto ]]; then
    [[ "$(tag_in "$HERE/state/pending-routines" || true)" != "$tag" ]] ||
      mv -T -- "$HERE/state/pending-routines" "$HERE/state/notice-routines" || true
  elif [[ "$mode" == "" ]]; then
    rm -f -- "$HERE/state/pending-routines" "$HERE/state/notice-routines"
  fi
}

followed() {
  local tag="$1" manifest="$2" auto="$3" installed="$4" mode="$5" outcome=0
  [[ "$tag" =~ $TAG && "$manifest" =~ $SHA && "$installed" =~ $TAG ]] || { echo failed; return 0; }
  mkdir -p -- "$HERE/state"
  stale_notices_dropped "$tag"
  if [[ "$tag" == "$installed" ]]; then
    routines_told "$tag" "$mode"
    echo "current $tag"
    return 0
  fi
  if [[ "$mode" != "" ]] && (( ${tag#bot-v} < ${installed#bot-v} )); then
    [[ "$mode" != auto ]] || told_once older "$tag"
    echo "older $tag"
    return 0
  fi
  if [[ "$mode" == report || ( "$mode" == auto && "$auto" != on ) ]]; then echo "waits $tag"; return 0; fi
  (( ${tag#bot-v} >= FIRST_SELF_UPDATING )) || { echo failed; return 0; }
  released "$tag" "$manifest" "$installed" || outcome=$?
  case "$outcome" in
    0)
      routines_told "$tag" "$mode"
      again report
      echo "installed $tag"
      ;;
    3)
      refused_release "$tag" "$mode"
      again report
      echo "refused $tag"
      ;;
    4) echo "waits $tag" ;;
    *) echo failed ;;
  esac
}

expected_of() {
  python3 -I -c '
import json, sys

body = json.load(open(sys.argv[1]))
expected = body["expected"]
print(expected["tag"], expected["manifestSha256"], "on" if body["autoInstall"] else "off")
' "$1" 2> /dev/null
}

if [[ "$command" == save && ( "$word" == ok || "$word" == duplicate ) ]]; then
  saved_id="$(python3 -I -c '
import json, sys

body = json.load(open(sys.argv[1]))
item = body["item"]["id"]
if isinstance(item, bool) or not isinstance(item, int) or body["url"] != f"/items/{item}":
    sys.exit(1)
print(item)
' "$response" 2> /dev/null)" && word="$word $saved_id /items/$saved_id" || word=failed
fi

if [[ "$word" == ok ]]; then
  case "$command" in
    search|topics)
      stored_file "$response" "$out"
      if [[ "$command" == search ]]; then
        python3 -I -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1]))["items"] else 1)' "$response" || word=none
      fi
      ;;
    bookmarks-cursor)
      word="$(python3 -I -c 'import json,re,sys; print(re.fullmatch(r"[0-9]{1,30}", json.load(open(sys.argv[1]))["cursor"]).group(0))' "$response" 2> /dev/null)" || word=failed
      ;;
    bookmarks-send)
      word="ok $(python3 -I -c 'import json,sys; r=[each["outcome"] for each in json.load(open(sys.argv[1]))["results"]]; print(r.count("added"), r.count("known"), r.count("refused"))' "$response")"
      ;;
    update)
      if read -r expected_tag manifest auto_on < <(expected_of "$response"); then
        word="$(followed "$expected_tag" "$manifest" "$auto_on" "$installed" "$first")"
      else
        word=failed
      fi
      ;;
    task-open)
      kind="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["kind"])' "$response")"
      mkdir -p "$folder"
      printf '%s' "$token" > "$work/token"
      stored_file "$work/token" "$folder/token"
      stored_file "$response" "$folder/task.json"
      rm -f "${folder:?}"/errors.txt "${folder:?}"/done
      word="ok $id $kind"
      ;;
  esac
fi

case "$command:$word" in
  task-open:closed|task-answer:ok|task-answer:closed|task-intake:ok|task-intake:closed|task-error:ok|task-error:closed)
    if holds_token "$token"; then
      mkdir -p "$folder"
      printf '%s' "$(hash_of "$token")" > "$work/done"
      stored_file "$work/done" "$folder/done"
      rm -f "${folder:?}"/token
    fi
    ;;
esac

said "$word"
exec 8>&-

case "$command" in
  bookmarks-cursor|task-answer|task-intake|task-error) again auto ;;
esac
