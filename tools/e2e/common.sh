free_port() {
  node -e 'const s = require("node:net").createServer().listen(0, "127.0.0.1", () => { console.log(s.address().port); s.close(); })'
}

new_code() {
  node -e 'console.log(require("node:crypto").randomBytes(24).toString("base64url"))'
}

wait_for_session_route() {
  local url=$1 tries=$2
  for _ in $(seq 1 "$tries"); do
    curl --silent --fail "$url/api/session" >/dev/null && return 0
    sleep 1
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
  local dir code
  dir=$(mktemp -d)
  code=$(new_code)
  trap 'status=$?; stop_all "$dir"; rm -rf "$dir"; exit "$status"' EXIT
  SETUP_CODE=$code "$script" launch "$dir"
  export THREADSIFT_BASE_URL
  THREADSIFT_BASE_URL=$(<"$dir/url")
  export THREADSIFT_RESTART="bash $script restart $dir"
  export THREADSIFT_INSTANCE_SCRIPT="bash $script"
  export THREADSIFT_E2E_DIR=$dir
  export THREADSIFT_SETUP_CODE=$code
  [[ -f $dir/exec ]] && export THREADSIFT_APP_EXEC="$(<"$dir/exec")"
  pnpm exec playwright test "$@"
}
