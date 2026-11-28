# Development environment

devenv owns everything a contributor or CI runs. You need Nix, devenv and direnv, and run `direnv allow` once for each clone or worktree. The agent edit hook finds Node through that shell, and the git hooks run through the `with-node` script of the devenv configuration.

## What devenv provides

| Feature | What it does |
|---|---|
| `languages.javascript`, `packages` | `nodejs_26`, and pnpm through corepack, so the shell, CI and Workers Builds run the pnpm version of `packageManager` |
| `processes` | `devenv up` starts the Node server, the Vite web app (it proxies `/api` to that server) and `wrangler dev`, each on its own allocated port. `devenv processes list` prints the ports, and any number of worktrees can run at once |
| `scripts` | `worker-local <state dir> <port> [flags]` applies the D1 migrations and starts `wrangler dev --local` |
| `tasks` | the gate, the builds, the smoke and live runs (below) |
| `git-hooks` | before each commit, `oxlint --fix` and `oxfmt` on the staged files. Before each push, `pnpm run check` and `pnpm test` |
| `env` | `CONTAINERS_STORAGE_CONF` and the Playwright browser path (below) |

`worker-local` is the one script. The `worker` process runs it on a persistent state folder, and the Playwright `webServer` runs it on a fresh one.

## Tasks

`devenv tasks run ci:gate` is the gate. It runs `ci:check`, `ci:test`, `ci:build`, `ci:audit`, `design:check` and `extension:package`. `devenv test` is not the gate, because it also starts the dev processes. It does run the commit hooks on every file.

`devenv tasks list` shows every task. [Testing](testing.md) lists the smoke and live runs, and [CI, releases and rollback](ci-releases-and-rollback.md) describes the jobs that run them.

`devenv tasks run x-api:probe` sends one capped probe to the X API with the owner's Bearer token, and every request spends the owner's X credit. Only the owner runs it, by hand; no workflow and no gate task runs it, and no other task selects it. It needs `X_API_PROBE`, `X_API_POST_IDS`, `X_API_CAP_USD`, `X_API_CAP_POSTS`, `X_API_BEARER_TOKEN` and `X_API_RUNS_DIR` in its environment, and `X_API_DRY_RUN=1` prints the plan without a request. [CI, releases and rollback](ci-releases-and-rollback.md#x-api-probe) describes each variable and the caps.

## Corepack and Node

Corepack comes from the unmodified `pkgs.corepack`, whose launcher uses Node 24. App commands still use `nodejs_26`. `cache.nixos.org` serves the unmodified package, so a cold runner skips its build and install checks. Overriding Corepack to use Node 26 changes its derivation and loses that.

## Playwright browsers

The npm `@playwright/test` version must match nixpkgs' `playwright-driver`, so the shell takes the browsers from nixpkgs. The `playwright-driver.browsers` override turns off Firefox and WebKit, because both smoke specs and the Extension's package command drive Chromium only. The shell keeps Chromium, its headless shell and ffmpeg. The override cuts the profile's closure by about 1 GiB.

## Podman storage and signature policy

- Storage. `CONTAINERS_STORAGE_CONF` points at a `storage.conf` that holds only an empty `[storage]` table. With the variable set, Podman reads no other `storage.conf`, so rootless Podman keeps its default paths on every host. Without it, Podman 6 takes `graphroot` from the host's `/etc/containers/storage.conf` for rootless runs too, and the GitHub `ubuntu-26.04` runner's file names `/var/lib/containers/storage`, which the runner user cannot write. The variable also hides your own `~/.config/containers/storage.conf` inside the shell. The source is `Options` in [containers/container-libs, storage v1.64.2](https://github.com/podman-container-tools/container-libs/blob/storage/v1.64.2/storage/types/options.go#L142), the storage version of Podman 6.1.4.
- Signature policy. Podman refuses to pull or build on a host where it finds no policy file; [containers-policy.json(5)](https://github.com/containers/image/blob/main/docs/containers-policy.json.5.md) names the places it reads. The image build tasks pass `--signature-policy` with a policy file from the Nix store, so the build needs none from the host. The start check pulls an image the host's store lacks without that flag, so that pull uses the host's own policy. On the GitHub runner the pull passed in the gate's `image` job on `main` on 2026-11-21, after the job removed every local image.
