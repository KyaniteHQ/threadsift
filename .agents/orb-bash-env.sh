if [[ -z "${THREADSIFT_ORB_BASH_ENV_ACTIVE:-}" ]]; then
  export THREADSIFT_ORB_BASH_ENV_ACTIVE=1
  if [[ -n "${THREADSIFT_ORB_PREVIOUS_BASH_ENV:-}" &&
    ! "$THREADSIFT_ORB_PREVIOUS_BASH_ENV" -ef "${BASH_SOURCE[0]}" ]]; then
    eval "source \"$THREADSIFT_ORB_PREVIOUS_BASH_ENV\""
  fi
  source "$(dirname -- "${BASH_SOURCE[0]}")/orb-env.sh"
  unset THREADSIFT_ORB_BASH_ENV_ACTIVE
fi
