# shellcheck shell=bash

new_code() {
  node -e 'console.log(require("node:crypto").randomBytes(24).toString("base64url"))'
}

instance_port() {
  local url
  url=$(<"$1/url")
  echo "${url##*:}"
}

wait_for() {
  local tries=$1
  shift
  for _ in $(seq 1 $((tries * 5))); do
    "$@" && return 0
    [[ $? -ne 2 ]] || return 2
    sleep 0.2
  done
  return 1
}

wait_for_session_route() {
  local url=$1
  wait_for "$2" curl --silent --fail "$url/api/session" >/dev/null && return 0
  echo "the session route did not answer on $url/api/session" >&2
  return 1
}

save_logs() {
  [[ -n ${THREADSIFT_RUN_DIR:-} ]] || return 0
  "$0" logs "$1" 2>&1 | sed -E 's/^(Setup code: ).+$/\1[redacted]/' >"$THREADSIFT_RUN_DIR/logs/$2.log" || true
}

stop_all() {
  local root=$1 dir
  for dir in "$root"/fresh-* "$root"; do
    [[ -d $dir ]] || continue
    "$0" stop "$dir" || true
    save_logs "$dir" "$([[ $dir == "$root" ]] && echo main || basename "$dir")"
  done
}

run_suite() {
  local script=$1
  shift
  local code
  dir=$(mktemp -d)
  code=$(new_code)
  # shellcheck disable=SC2154
  trap 'status=$?; stop_all "$dir"; rm -rf "$dir"; exit "$status"' EXIT
  if [[ -n ${THREADSIFT_ARTIFACTS:-} ]]; then
    THREADSIFT_RUN_DIR="$THREADSIFT_ARTIFACTS/$THREADSIFT_TARGET-$(date -u +%Y%m%dT%H%M%SZ)"
    export THREADSIFT_RUN_DIR
    mkdir -p "$THREADSIFT_RUN_DIR/logs"
    echo "artifacts: $THREADSIFT_RUN_DIR"
  fi
  SETUP_CODE=$code "$script" launch "$dir"
  export THREADSIFT_BASE_URL
  THREADSIFT_BASE_URL=$(<"$dir/url")
  export THREADSIFT_INSTANCE_SCRIPT="bash $script"
  export THREADSIFT_E2E_DIR=$dir
  export THREADSIFT_SETUP_CODE=$code
  pnpm exec playwright test "$@"
}
