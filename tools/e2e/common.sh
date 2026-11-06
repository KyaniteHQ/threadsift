# shellcheck shell=bash

new_code() {
  node -e 'console.log(require("node:crypto").randomBytes(24).toString("base64url"))'
}

wait_for_session_route() {
  local url=$1 tries=$2
  for _ in $(seq 1 $((tries * 5))); do
    curl --silent --fail "$url/api/session" >/dev/null && return 0
    sleep 0.2
  done
  return 1
}

stop_all() {
  local root=$1 dir
  for dir in "$root"/fresh-* "$root"; do
    [[ -d $dir ]] && "$0" stop "$dir" || true
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
  SETUP_CODE=$code "$script" launch "$dir"
  export THREADSIFT_BASE_URL
  THREADSIFT_BASE_URL=$(<"$dir/url")
  export THREADSIFT_INSTANCE_SCRIPT="bash $script"
  export THREADSIFT_E2E_DIR=$dir
  export THREADSIFT_SETUP_CODE=$code
  if [[ -n ${THREADSIFT_ARTIFACTS:-} ]]; then
    THREADSIFT_RUN_DIR="$THREADSIFT_ARTIFACTS/$THREADSIFT_TARGET-$(date -u +%Y%m%dT%H%M%SZ)"
    export THREADSIFT_RUN_DIR
    mkdir -p "$THREADSIFT_RUN_DIR"
    echo "artifacts: $THREADSIFT_RUN_DIR"
  fi
  pnpm exec playwright test "$@"
}
