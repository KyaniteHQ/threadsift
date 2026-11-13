#!/usr/bin/env bash
set -euo pipefail
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command="${1:-}"
first="${2:-}"
second="${3:-}"

route_of() {
  case "$1" in
    check) method=GET; template="/api/items"; credential=agent ;;
    topics) method=GET; template="/api/topics"; credential=agent ;;
    search) method=GET; template="/api/items"; credential=agent ;;
    save) method=POST; template="/api/items"; credential=agent ;;
    task-open) method=GET; template="/api/ai-tasks/{id}"; credential=task ;;
    task-answer) method=POST; template="/api/ai-tasks/{id}/result"; credential=task ;;
    task-intake) method=POST; template="/api/ai-tasks/{id}/intake"; credential=task ;;
    task-error) method=POST; template="/api/ai-tasks/{id}/result"; credential=task ;;
  esac
}

word_of() {
  case "$command:$1" in
    check:200|topics:200|search:200|task-open:200) echo ok ;;
    task-answer:204|task-intake:204|task-error:204|save:201) echo ok ;;
    save:200) echo duplicate ;;
    *:400) echo invalid ;;
    *:401) echo unauthorized ;;
    *:403) echo forbidden ;;
    *:409) echo closed ;;
    *:413) echo too-large ;;
    save:429) echo budget-spent ;;
    save:503) echo updating ;;
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

folder_of() {
  [[ "$1" =~ ^[0-9]{1,16}$ ]] || stop bad-input "bad task id"
  folder="$HERE/tasks/$1"
}

hash_of() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

case "$command" in
  check|topics|search|save|task-open|task-answer|task-error) route_of "$command" ;;
  *) stop bad-input "unknown command" ;;
esac

URL="${THREADSIFT_URL:-}"
[[ "$URL" =~ ^(https://[A-Za-z0-9.-]+(:[0-9]{1,5})?|http://(127\.0\.0\.1|localhost):[0-9]{1,5})$ ]] || stop not-configured "THREADSIFT_URL must be an https address with no path"

work="$(mktemp -d)"
trap 'rm -rf "${work:?}"' EXIT
request="$work/request"
response="$work/response"
options=()
folder=""
id=""
token=""
path="$template"
mkdir -p "$HERE/tmp"

if [[ "$credential" == agent ]]; then
  token="${THREADSIFT_AGENT_TOKEN:-}"
  [[ -n "$token" ]] || stop not-configured "THREADSIFT_AGENT_TOKEN is not set"
fi

if [[ "$command" == task-open ]]; then
  event="$(inside "$first" "$HERE/tmp")" || stop bad-input "the event file must be a file in ~/threadsift/tmp"
  if parsed="$(python3 -I - "$event" <<'PY'
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
  )"; then
    rm -f -- "$event"
  else
    rm -f -- "$event"
    stop bad-input "the event is not a task of this Instance"
  fi
  [[ "$parsed" != ping ]] || { echo ping; exit 0; }
  read -r id token _ <<< "$parsed"
  folder_of "$id"
  if [[ -f "$folder/done" && "$(< "$folder/done")" == "$(hash_of "$token")" ]]; then
    echo already-done
    exit 0
  fi
  mkdir -p "$folder"
  printf '%s' "$token" > "$folder/token"
  rm -f "${folder:?}"/task.json "${folder:?}"/answer.json "${folder:?}"/errors.txt
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

[[ "$token" =~ ^[A-Za-z0-9_-]{1,64}$ ]] || stop bad-input "bad credential"

case "$command" in
  check) options=(--get --data-urlencode "url=https://example.com/") ;;
  search)
    file="$(inside "$first" "$HERE/tmp")" || stop bad-input "the query file must be a file in ~/threadsift/tmp"
    query="$(python3 -I -c '
import sys

text = open(sys.argv[1]).read().rstrip("\n")
if text.strip() == "" or "\n" in text or "\r" in text:
    sys.exit(1)
print(text)
' "$file")" || stop bad-input "the query must be one line"
    options=(--get --data-urlencode "q=$query")
    ;;
  save|task-intake|task-answer|task-error)
    mode="$command"
    arg1="" arg2=""
    case "$command" in
      save)
        arg1="$(inside "$first" "$HERE/tmp")" || stop bad-input "the link file must be a file in ~/threadsift/tmp"
        if [[ -n "$second" ]]; then arg2="$(inside "$second" "$HERE/tmp")" || stop bad-input "the thread file must be a file in ~/threadsift/tmp"; fi
        ;;
      task-error)
        reason_of "$second" || stop bad-input "unknown reason word"
        arg1="$sentence"
        ;;
      *)
        arg1="$(inside "$second" "$folder" "$HERE/tmp")" || stop bad-input "the answer file must be a file in the task folder or in ~/threadsift/tmp"
        ;;
    esac
    if ! python3 -I - "$mode" "$arg1" "$arg2" > "$request" 2> "$work/reasons" <<'PY'
import json, re, sys

mode, first, second = sys.argv[1:4]

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
    else:
        with open(first) as handle:
            link = handle.read().rstrip("\n")
        if not re.fullmatch(r"https?://[^\s\x00-\x1f\x7f]{1,2000}", link):
            sys.exit("the link must be one http or https URL on one line")
        body = {"url": link}
        if second:
            with open(second) as handle:
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
  if [[ -n "$folder" ]]; then cat "$response" > "$folder/errors.txt"; else cat "$response" >&2; fi
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
' "$response" "$command" 2> /dev/null
}

if [[ "$word" == ok && "$method" == GET ]] && ! shaped; then word=failed; fi

if [[ "$word" == ok ]]; then
  case "$command" in
    search|topics)
      cat "$response" > "$HERE/tmp/$command.json"
      if [[ "$command" == search ]]; then
        python3 -I -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1]))["items"] else 1)' "$response" || word=none
      fi
      ;;
    task-open)
      cat "$response" > "$folder/task.json"
      kind="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["kind"])' "$response")"
      word="ok $id $kind"
      ;;
  esac
fi

case "$command:$word" in
  task-open:closed|task-answer:ok|task-answer:closed|task-intake:ok|task-intake:closed|task-error:ok|task-error:closed)
    printf '%s' "$(hash_of "$token")" > "$folder/done"
    rm -f "${folder:?}"/token
    ;;
esac

echo "$word"
