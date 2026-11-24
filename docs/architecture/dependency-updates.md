# Dependency updates

Renovate, the GitHub App, is the one update bot. Its configuration holds the schedule, the grouping and the release-age rule, and Renovate never merges a PR on its own. The Dependency Dashboard issue lists every pending and waiting update. `pnpm outdated` lists the npm updates before Renovate's next run.

- `oxlint` and `@oxlint/plugins` get their own PR at every update type, because both must stay on one exact version.
- `@playwright/test` is never updated by Renovate. It must match the version of nixpkgs' `playwright-driver`, whose browsers the devenv shell provides, so it moves with the `devenv.lock` update.
- When Renovate bumps pnpm, it also rewrites the `sha512` hash in `packageManager`, which the container build checks ([Container image](container-image.md), pnpm). A hash that does not match the tarball fails the container build.
- Renovate proposes an npm version only when it is 3 days old. This equals pnpm's `minimumReleaseAge`, so a PR never asks for a version that pnpm refuses to install.

## Security fixes

GitHub's Dependabot alerts and the OSV database feed Renovate's security PRs, which skip the 3-day wait. A fix younger than 3 days still fails pnpm's install, so that PR also adds the package to `minimumReleaseAgeExclude` in the pnpm workspace settings. The entry does nothing once its version is 3 days old, so the next PR that touches the package removes it. Dependabot's own version and security PRs stay off, because both bots would open a PR for the same bump.

## Update `devenv.lock` by hand

Renovate has no Nix manager or devenv rule, so it leaves `devenv.lock` alone.

1. Run `devenv update`.
2. Set `@playwright/test` to the version of the new `playwright-driver`.
3. Run the gate and both smoke targets (`devenv tasks run ci:gate`, `devenv tasks run smoke:worker`, `devenv tasks run smoke:container`).

The `devenv` CLI that the CI workflows install comes from the `nixpkgs` input that `devenv.lock` pins, so the CLI version moves with the lock.
