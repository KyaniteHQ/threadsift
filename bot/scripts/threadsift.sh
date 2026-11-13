#!/usr/bin/env bash
set -euo pipefail
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command="${1:-}"
first="${2:-}"
second="${3:-}"
third="${4:-}"

WRITE_CAP=8388608
NAME='^[a-z][a-z0-9-]{0,31}-([0-9a-f]{32})\.(json|txt)$'

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
    *) return 1 ;;
  esac
}

word_of() {
  case "$command:$1" in
    check:200|topics:200|search:200|task-open:200|bookmarks-cursor:200|bookmarks-send:200) echo ok ;;
    task-answer:204|task-intake:204|task-error:204|save:201) echo ok ;;
    save:200) echo duplicate ;;
    bookmarks-cursor:404) echo none ;;
    *:400) echo invalid ;;
    *:401) echo unauthorized ;;
    *:403) echo forbidden ;;
    *:409) echo closed ;;
    *:413) echo too-large ;;
    save:429|bookmarks-send:429) echo budget-spent ;;
    save:503|bookmarks-send:503) echo updating ;;
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

cleanup() {
  [[ -z "$work" ]] || rm -rf -- "${work:?}"
  [[ -z "$part" ]] || rm -f -- "${part:?}"
  [[ -z "$joined" ]] || rm -f -- "${joined:?}"
  [[ ${#inputs[@]} -eq 0 ]] || rm -f -- "${inputs[@]}"
}
trap cleanup EXIT

stop() { echo "$1"; [[ -z "${2:-}" ]] || echo "$2" >&2; exit 2; }

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
  [[ "$1" =~ ^[0-9]{1,16}$ ]] || stop bad-input "bad task id"
  folder="$HERE/tasks/$1"
}

hash_of() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

stored_file() {
  cat -- "$1" > "$2.part" && mv -T -- "$2.part" "$2"
}

mark_word() {
  local hex
  hex="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')" || true
  [[ "$hex" =~ ^[0-9a-f]{32}$ ]] || stop failed "no random bytes"
  echo "TS_$hex"
}

written() {
  local mode="$1" name="$2" target size
  [[ "$name" =~ $NAME ]] || stop bad-input "bad file name"
  plain_dirs
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
  find "$HERE/tmp" -maxdepth 1 -type f -mmin +1440 -delete 2> /dev/null || true
  echo ok
}

forgotten() {
  [[ "$1" =~ ^[0-9a-f]{32}$ ]] || stop bad-input "forget takes the hex of a mark"
  plain_dirs
  rm -f -- "${HERE:?}/tmp/search-$1.json" "${HERE:?}/tmp/topics-$1.json"
  echo ok
}

pruned_tasks() {
  local dir
  while IFS= read -r -d '' dir; do
    [[ "$dir" =~ /tasks/[0-9]{1,16}$ ]] || continue
    if [[ -f "$dir/done" ]]; then
      [[ -z "$(find "$dir/done" -maxdepth 0 -mmin +10080)" ]] || rm -rf -- "${dir:?}"
    elif [[ -f "$dir/token" ]]; then
      find "$dir/token" -maxdepth 0 -mmin +1440 -delete 2> /dev/null || true
    fi
  done < <(find "$HERE/tasks" -mindepth 1 -maxdepth 1 -type d -print0)
}

case "$command" in
  mark) mark_word; exit 0 ;;
  forget) forgotten "$first"; exit 0 ;;
  write) written write "$first"; exit 0 ;;
  append) written append "$first"; exit 0 ;;
esac

[[ "$command" != task-intake ]] && route_of "$command" || stop bad-input "unknown command"

plain_dirs

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
    if not (re.fullmatch(r"[0-9]{1,16}", task) and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", token) and re.fullmatch(r"[a-z][a-z_]{0,39}", kind)):
        sys.exit(1)
    print(task, token, kind)
except Exception:
    sys.exit(1)
PY
  )" || stop bad-input "the event is not a task of this Instance"
  [[ "$parsed" != ping ]] || { echo ping; exit 0; }
  read -r id token _ <<< "$parsed"
  folder_of "$id"
  if [[ -f "$folder/done" && "$(< "$folder/done")" == "$(hash_of "$token")" ]]; then
    echo already-done
    exit 0
  fi
  if [[ -f "$folder/task.json" && ! -f "$folder/done" && -n "$(find "$folder/task.json" -maxdepth 0 -mmin -60)" ]]; then
    echo already-open
    exit 0
  fi
  pruned_tasks
fi

URL="${THREADSIFT_URL:-}"
[[ "$URL" =~ ^(https://[A-Za-z0-9.-]+(:[0-9]{1,5})?|http://(127\.0\.0\.1|localhost):[0-9]{1,5})$ ]] || stop not-configured "THREADSIFT_URL must be an https address with no path"

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
      echo bad-input
      exit 2
    fi
    options=(--header "Content-Type: application/json" --data-binary "@$request")
    ;;
esac

status="$(curl --disable --silent --show-error --max-redirs 0 --max-time 60 \
  --request "$method" \
  --config <(printf 'header = "Authorization: Bearer %s"\n' "$token") \
  ${options[@]+"${options[@]}"} \
  --output "$response" --write-out '%{http_code}' \
  "$URL$path" 2>/dev/null)" || status=000

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

if [[ "$word" == ok && ( "$method" == GET || "$command" == bookmarks-send ) ]] && ! shaped; then word=failed; fi

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
    task-open)
      kind="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["kind"])' "$response")"
      mkdir -p "$folder"
      printf '%s' "$token" > "$work/token"
      stored_file "$work/token" "$folder/token"
      stored_file "$response" "$folder/task.json"
      rm -f "${folder:?}"/errors.txt
      word="ok $id $kind"
      ;;
  esac
fi

case "$command:$word" in
  task-open:closed|task-answer:ok|task-answer:closed|task-intake:ok|task-intake:closed|task-error:ok|task-error:closed)
    mkdir -p "$folder"
    printf '%s' "$(hash_of "$token")" > "$work/done"
    stored_file "$work/done" "$folder/done"
    rm -f "${folder:?}"/token
    ;;
esac

echo "$word"
