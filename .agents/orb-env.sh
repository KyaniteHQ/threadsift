_threadsift_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
_threadsift_profile="$HOME/.local/state/nix/profiles/threadsift-devenv/bin"

if [[ -z "${THREADSIFT_ORB_ACTIVATING:-}" &&
  ( "${DEVENV_ROOT:-}" != "$_threadsift_root" || ":${PATH:-}:" != *":$_threadsift_profile:"* ) &&
  ( "$PWD" == "$_threadsift_root" || "$PWD" == "$_threadsift_root/"* ) ]]; then
  export THREADSIFT_ORB_ACTIVATING=1
  if ! command -v nix >/dev/null && [[ -f "$HOME/.nix-profile/etc/profile.d/nix.sh" ]]; then
    source "$HOME/.nix-profile/etc/profile.d/nix.sh"
  fi
  if [[ ":${PATH:-}:" != *":$_threadsift_profile:"* ]]; then
    export PATH="$_threadsift_profile:$PATH"
  fi
  if [[ "${NIX_CONFIG:-}" != *'extra-experimental-features = nix-command flakes'* ]]; then
    export NIX_CONFIG="${NIX_CONFIG:+${NIX_CONFIG}$'\n'}extra-experimental-features = nix-command flakes"
  fi
  if _threadsift_env="$(cd -- "$_threadsift_root" && devenv --quiet print-dev-env)"; then
    eval "$_threadsift_env"
  else
    printf 'Threadsift development shell activation failed\n' >&2
  fi
  unset _threadsift_env THREADSIFT_ORB_ACTIVATING
fi

unset _threadsift_root _threadsift_profile
