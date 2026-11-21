# CI, releases and rollback

The workflows build, publish and check Threadsift, and one keeps a Cloudflare copy current. This page describes what each job does and why it is built that way.

## Contents

- [Gate](#gate)
- [Setup action and caches](#setup-action-and-caches)
- [Nix input downloads](#nix-input-downloads)
- [Merging](#merging)
- [Secrets and forks](#secrets-and-forks)
- [Contributor licence agreement](#contributor-licence-agreement)
- [Live demo](#live-demo)
- [Live check](#live-check)
- [Image](#image)
- [Start check](#start-check)
- [Releases](#releases)
- [Rollback](#rollback)

```text
docs only     -> documentation checks -> aggregate `gate`
full gate     -> check + smoke(worker) + smoke(container) -> aggregate `gate`
code on main  -> full gate or matching pull request gate -> deploy (live Worker)
                                                        \-> image (ghcr.io :sha-<sha>, :main)
tag v*        -> release: build amd64 + arm64 -> publish index, move `release`
manual        -> live check (Worker and container, environment post-merge)
```

## Gate

The gate workflow runs on every pull request and on every push to `main`.

| Job | Runs | Limit |
|---|---|---|
| `changes` | selects documentation checks, a full gate or a matching pull request gate | 5 minutes |
| `docs` | runs `ci:check` for a docs-only change, including formatting and doc references | 10 minutes |
| `check` | calls the reusable core workflow, which runs `devenv tasks run ci:gate` after one install ([Development environment](development-environment.md), Tasks), including the design check `impeccable detect --github web` | 10 minutes |
| `smoke` | the browser smoke spec, one runner for the Worker and one for the container image | 15 minutes |
| `gate` | checks the job results for the mode that `changes` selects | 2 minutes |

- A pull request qualifies for documentation checks only when both its branch changes since the common ancestor and its changes in the tested merge affect only allowlisted documentation. A push compares the old and new tips. Missing history or an empty comparison rules out documentation checks. A push with an empty comparison can still reuse a pull request gate. A force-push or a manual run takes the full gate.
- On `main`, the previous tip's push run must also have succeeded before the docs-only push arrived. Otherwise the full gate runs, including deployment and image publication after it passes, so docs cannot overtake an unfinished code deployment.
- For a docs-only change, only `changes`, `docs` and `gate` run. The docs job runs `pnpm run check:docs-skip`. If a test, smoke or build names a path on the allowlist, the check fails and reports which path to remove. Paths assembled at runtime can escape the check. The pre-push hook still runs the full core suite.
- When an unforced push does not qualify on paths alone for documentation checks, `changes` looks for a squash commit whose only parent is the previous tip of `main`. GitHub must associate that commit with exactly one pull request, merged into `main` from this repository, and record it as the pull request's merge commit. Fork runs can restore caches that earlier commits on the same pull request wrote.
- The pull request must leave workflows, local actions, devenv task definitions, the tree comparison script and the design-check engine scripts unchanged, including renames. GitHub must return one gate run for the merged head. Its latest successful attempt must record the local reusable core workflow once, with the pull request's merge ref and the resolved commit SHA. That commit must have the pushed tree and exactly two parents, the previous tip of `main` followed by the pull request head. A later update to the branch cannot substitute another tree. [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses)
- The attempt must finish every job, pass `gate` and skip `docs`. On a pull request that requires the core check and both smoke targets to pass. A rerun must include the same jobs as the first attempt and still be the latest successful attempt when the lookup finishes. Missing or ambiguous evidence, including a lookup that exceeds 90 seconds, selects the full gate.
- A match skips the core check and both smoke targets on the push. Once `gate` accepts the result, deployment and image publication can proceed. The push trusts the pull request's dependency audit and container smoke results regardless of the run's age. The next full gate checks current advisories and runs container smoke with the layers available then.
- When `check` fails, the upload step collects whatever the shard runner wrote, including per-shard JUnit reports and a text diagnosis for each failed shard. The `core-tests` artifact expires after 7 days. If the job fails before the core tests start, the upload step warns that it found no files and produces no artifact. The parent process records a shard's signal even if the shard stops before it finishes its XML. Set `THREADSIFT_JUNIT_DIR` to an empty directory to collect the reports locally.
- Fail-fast is off, so a failed target leaves the other running. A failed smoke run uploads Playwright's `test-results` as the artifact `smoke-<target>` for 7 days.
- A newer push cancels the older run of the same pull request.
- The core tests share the `check` job with the build, audit and design check. Container smoke finished last among the jobs that `gate` waits for in each of three hosted runs on 2026-11-21.
- On 2026-11-21, Playwright reported 1.1 minutes in each of two local runs of `devenv tasks run smoke:container`. Both runs used the same 5 s job-loop poll.
- No core test exercises the random-byte failure of `mark`. The `check` job uses the default `unprivileged-userns: "false"` in the setup action. The smoke and image jobs enable it. A [local check on 2026-11-21](open-items-and-unverified-claims.md#threadsift-bot-share-target-and-bot-script) shows the command and the failure.
- The image builds while `ci:install` runs, because the `container:build` task reads only the `Containerfile` and the source tree, so the build does not wait behind the install.
- The image build passes `--jobs 0`, so Podman builds the stages in parallel.
- The container start gets 60 s in the Playwright configuration, so Playwright fails before the job's budget ends. A start timeout leaves no test output, and the job log records the failure.

The hosted runs on 2026-11-21 measured the following wall times, in seconds. The core test task is part of `check`.

| Gate run | `check` | Core test task | Container smoke | Worker smoke |
|---|---|---|---|---|
| [44931363097](https://github.com/KyaniteHQ/threadsift/actions/runs/44931363097) | 167 | 87.5 | 171 | 98 |
| [44934357522](https://github.com/KyaniteHQ/threadsift/actions/runs/44934357522) | 139 | 61.4 | 159 | 100 |
| [44934665337](https://github.com/KyaniteHQ/threadsift/actions/runs/44934665337) | 167 | 91.4 | 198 | 109 |

The devenv setup step took 50 to 53 s in `check`, 32 to 56 s in container smoke and 45 to 57 s in Worker smoke across those runs.

## Setup action and caches

The setup action installs Nix and the `devenv` CLI, and caches the pnpm store and Nix's fetch cache.

- Corepack. The unmodified `pkgs.corepack` is available from `cache.nixos.org`, so cold runners avoid its build and install checks.
- pnpm store. pnpm 12 reads `pnpm_config_store_dir` for the cached store and ignores `npm_config_store_dir`.
- Nix store. The setup action uses binary caches. Restoring a cached devenv closure increased the median setup time in every job in five alternating pairs of manual gate runs on 2026-11-21. Each pair ran the [action without a store cache](https://github.com/KyaniteHQ/threadsift/actions/runs/44926470981) at `039827b4` and the [cached variant](https://github.com/KyaniteHQ/threadsift/actions/runs/44926483697) on a branch that adds only the closure cache to that action. Every restore hit the cache.

| Hosted setup step | Binary caches alone, median (range) | With cached closure, median (range) |
|---|---|---|
| `check` | 53 s (40 to 61 s) | 58 s (54 to 68 s) |
| Container smoke | 52 s (43 to 69 s) | 57 s (53 to 68 s) |
| Worker smoke | 55 s (50 to 60 s) | 61 s (48 to 79 s) |

## Nix input downloads

`nix profile add` and the first `devenv` command download each locked GitHub input as a tarball from `api.github.com`. A cold runner makes at most 5 such requests for each job: 1 in `nix profile add` (devenv-nixpkgs, which holds the `devenv` package) and 4 in `devenv` (devenv, devenv-nixpkgs, nixpkgs and git-hooks.nix, all from `devenv.lock`).

- Cache. The setup action caches `~/.cache/nix`, Nix's tarball and fetcher caches (about 108 MB compressed), under a key that hashes `devenv.lock` and the action file, which holds the Nix installer pin. A job that restores it makes 0 requests. A cold full gate runs 3 jobs that set up devenv (`check`, and `smoke` for each target) and makes at most 15 requests. A docs-only gate sets up devenv once. A warm gate makes 0. The deploy and each live check run the same install, so each makes at most 5 cold and 0 warm.
- The 429 is not the hourly quota. The workflow token's `GET /rate_limit` read a `limit` of 5000 with 54 used (2026-11-08), and [another author](https://www.d12frosted.io/posts/2026-06-29-chasing-a-github-429) got the same 429 with 0 of 5000 used. The cause is probably GitHub's anti-abuse limit on the addresses that runners share (an inference, because GitHub shows no counter for it). The cache cuts the requests that meet the throttle.
- When the cache misses. A change to `devenv.lock` or the installer pin gives a new key, and the `restore-keys` prefix restores the newest cache of an older key. A cache made by a pull request run is visible only to that pull request's merge-ref runs, and a run on any branch restores the default branch's caches ([GitHub dependency caching](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#restrictions-for-accessing-a-cache)). On a reused push that still heads `main`, a successful `deploy` can seed the Nix fetch cache and the pnpm store. A successful `image` can seed the Nix fetch cache. A cold pnpm store fetches packages at install.
- Only a full core check on `main` seeds the design-check engine cache there. If the cache misses and no local engine is available, the launcher downloads and verifies the pinned engine. Changing its version requires a full push gate.
- Retries. Nix retries a throttled download 5 times, then fails the job. The action adds no retry, because a retry on the same address hides a throttle and does not avoid it. Rerun the job.

## Merging

`main` requires one aggregate `gate` job. On a pull request it requires `docs` alone to pass, or both `check` and `smoke` to pass with `docs` skipped. Only a push with a matching pull request gate can skip all three jobs. The workflows use no workflow-level `paths` filter, because a skipped workflow leaves its required checks pending. [Dependency updates](dependency-updates.md) says when Renovate opens its pull requests.

## Secrets and forks

- Gate and live-check checkouts discard checkout credentials.
- The build and test jobs of pull requests receive no repository secrets.
- The live deploy uses the `main`-only environment `live`. The live check uses the `main`-only environment `post-merge`.
- The review of a change runs on the owner's machine and never in CI. OpenAI's CI guide says "Do not use this workflow for public or open-source repositories" about ChatGPT sign-in ([CI/CD auth](https://learn.chatgpt.com/docs/auth/ci-cd-auth)).

## Contributor licence agreement

The CLA workflow uses `pull_request_target` and `issue_comment` to write to the base repository for fork pull requests. It uses temporary GitHub tokens and performs no checkout.

- The owner and `renovate[bot]` are exempt. Every other pull request needs its author's signature, and the action checks the commit authors it sees. An author with no commit attributed to their account must add one to sign.
- The author's signature covers co-authored work they submit under section 7 of the agreement.
- The action reads at most 100 commits, and the workflow rejects a pull request with more. Squash it first.
- The folder `version1` identifies the agreement version a signature covers. Give a changed agreement a new folder, and keep the old ledger and agreement in Git history. The ledger keeps the comment id and timestamp, so it still holds the original record if a signer edits or deletes the comment.
- GitHub reports `issue_comment` runs on the head of `main`. Check the `pull_request_target` run for the pull request and its current head commit. If two pull requests share a head commit, GitHub can show one result on both, so verify the run named for the pull request number before merging ([GitHub required check behavior](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)).
- The pinned action reads only the first 30 pull request comments. If the signing phrase came after them, or the prompt does not appear, open a fresh pull request and sign there before other discussion.

Setup for a repository that uses this workflow:

1. Before the workflow reaches `main`, create the `cla-signatures` branch from `main` and seed the signature file with an empty `signedContributors` array. [Version 2.6.1](https://github.com/contributor-assistant/github-action/blob/ca4a40a7d1004f18d9960b404b97e5f30a505a08/src/setupClaCheck.ts) of the action fails when the file is missing.
2. In the repository's Actions policies, scope a **Restrict events** rule to this workflow and allow `pull_request_target` and `issue_comment`. GitHub enforces its public-repository default block on `pull_request_target` from 2 December 2026 ([default policy](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target#default-policy-for-pull_request_target)).
3. Require the `cla` check on `main` right after the merge, and reopen or update older pull requests to start their check.

## Live demo

The `deploy` job of the gate workflow runs only on a push to `main`, after `gate` passes, in the environment `live`.

```text
checkout -> main still at this SHA? --no--> skip every later step
               | yes
               v
   build web bundle -> try to record the current deployment
                    -> apply migrations
                    -> wrangler deploy --env live --keep-vars
                    -> GET /api/session at the reported deploy target, up to 11 tries, 5 s apart, until 200
             deploy or session check fails -> check rollback conditions below
```

- Skip when `main` moved. The first step compares the run's SHA with the head of `main`, so two quick merges end on the newer one. The check is a step of `deploy` and not a job before it, because a job that `deploy` needs finishes before `deploy` waits in the concurrency group. A run that then waited behind another deploy would publish an older commit ([`jobs.<job_id>.needs`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)).
- The `live-deploy` concurrency group never cancels a running deploy and sets `queue: max`, so it holds up to 100 pending runs and replaces none. Without `queue: max`, a later run replaces the pending one, whatever its commit, and the newest merge could lose its deploy to a rerun of an older commit ([`concurrency`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)).
- Failure. A deploy or health-check failure fails the run on `main`, even after a successful [rollback](#rollback). Wrangler can publish the version before it finishes setting up triggers.
- Migrations first, so a failed migration never publishes code that needs the new schema. Wrangler rolls the failing migration back and keeps the earlier ones (`wrangler d1 migrations apply --help`, Wrangler 4.162.0).

This order has a cost, because the Worker that is still live runs on the new schema until `wrangler deploy` ends. A migration that adds a `NOT NULL` column with no default, or a foreign key, makes that Worker's writes to the table fail with `NOT NULL constraint failed` or `FOREIGN KEY constraint failed`. The migration that added `source` to the thread tables was one: every thread write fails in that window, and its job retries up to `MAX_ATTEMPTS` (3) attempts. An Export that the old Worker finishes in the window names the new migration in its manifest but holds records without `source`, so no Restore accepts it. Take no Export while such a deploy runs, and Export again after it. The container applies a migration in the one process that then serves, so it has no window.

### Names and variables

- Names. `env.live` in the Worker configuration names the Worker `threadsift-live` (the top-level name plus `-live`), the D1 database `threadsift-live`, the Queue `threadsift-live-jobs` as producer and consumer, the bucket `threadsift-live-files` and the `AI` binding. An environment inherits `main`, `assets`, `triggers`, `limits` and `alias`, but not bindings or variables ([Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/), [configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)). It carries no `database_id`, because `wrangler d1 migrations apply --remote` looks the database up by `database_name` through the Cloudflare API. It sets `workers_dev` and inherits the top-level observability settings, including `redact_query_string`. The database and the Queue exist already. For a new Instance in another account, `pnpm run deploy --secrets-file <file>` creates the missing D1 database before migrations, and Wrangler creates the bucket and Queue during the deploy ([Cloudflare deploy button](cloudflare-deploy-button.md)).
- Variables and secrets. The configuration holds no variable and no secret. `THREADSIFT_PUBLIC_ORIGIN` is a variable of the live Worker, set to its own `https://` origin. `--keep-vars` stops the deploy from deleting it, because a deploy without the flag deletes every variable the configuration does not name ([wrangler deploy](https://developers.cloudflare.com/workers/wrangler/commands/workers/)). A deploy never deletes secrets, and this one passes no `--secrets-file`, so the Worker keeps `THREADSIFT_SECRET_KEY` and every other secret. Never replace that key against existing encrypted data.
- Recovery. For a missing Worker, restore `threadsift-live` with its original `THREADSIFT_SECRET_KEY` before deploying. For a missing database, restore its data from a backup. For a missing Queue, recreate `threadsift-live-jobs` and its consumer binding. These are manual operations, because a deploy cannot decide which lost data or queued work is recoverable. The deploy seeds no demo owner or demo Items and keeps whatever the live database holds.

## Live check

The live-check workflow runs by manual dispatch on `main` before a release. It runs independently of the gate and the deploy, once for each target in the environment `post-merge`. A failure fails the workflow. It runs the live spec against the same Worker and container that the smoke spec starts. On both targets the spec sets up the owner, saves the workflow's `GITHUB_TOKEN` as the GitHub token, and Pastes `https://www.sqlite.org/whentouse.html` and `https://github.com/KyaniteHQ/threadsift`. The app fetches both from the real internet.

### Worker, no model

Each Paste carries a caller-sent Digest ([the v1 spec](../spec.md), Agent output per Item), which waits for the fetched text and publishes without a Provider call. The spec waits until both Items are read with `fetch: ok`, then checks that each Item shows its sent Topic, Summary, Key points and Tags. It saves no Provider, and `wrangler dev --local` runs no `ai` binding call ([AI tasks and Providers](ai-tasks-and-providers.md), Workers AI binding). The Worker run therefore does not prove the HTTP and Workers AI executors, the scheduled handler, the `topic_overview` task, Try again or Related Items on the Worker. The container run proves the Worker's AI tasks.

### Container, Claude Code

- Install. The image ships no CLI ([Providers guide](../guides/providers.md), Use Claude Code on the container). The `live:container` task sets `THREADSIFT_LIVE=1`. The Playwright configuration then starts the image with `--env CLAUDE_CODE_OAUTH_TOKEN` and a command that runs `npm install --global @anthropic-ai/claude-code` into the data volume before the app starts, so the app finds the CLI at its first start. The install runs without the token, the setup code and the secret key in its environment, prints `claude --version` into the log, and passes `--min-release-age=3`, the same 3-day rule as pnpm and Renovate. A release that breaks the executor therefore fails the next run after it ages in.
- Model. The spec saves the `claude-code` Provider with the model `claude-haiku-5-5` (`CLAUDE_MODEL` in the spec) to keep the check's use of the owner's subscription low, and checks that the saved settings keep it.
- Steps. The spec presses Verify as the guide does, which makes one real Digest, so a refusal such as `provider-busy` fails the run at once. It waits up to 5 minutes for one Digest, then up to 5 minutes until `GET /api/topics/<key>` for that Digest's Topic answers a written overview (`overview.text` is not null, so the `topic_overview` job ran). It then Pastes `https://www.sqlite.org/wal.html`, waits for its Digest, writes the first article's Digest again (`POST /api/items/<id>/digest`) and waits up to 5 minutes until the first article lists the second as a Related Item. The container's job loop runs the Digest jobs, so they need no scheduler request. Claude Code is the only Provider, so it wrote each published Digest.
- Token. `CLAUDE_CODE_OAUTH_TOKEN` comes from `claude setup-token` on the owner's Claude subscription ([the v1 spec](../spec.md), AI providers). Locally it comes from the owner's secret store. In CI it is a secret of the `post-merge` environment, and the workflow passes it to the container job only. An empty value fails the `live:image` task before the image builds, with a message that names the variable and `claude setup-token`. The check is part of `live:image` and not a separate task ordered with `before`, because devenv would run such a task in every run that builds the image, `smoke:container` included ([devenv tasks](https://devenv.sh/tasks/)).
- Plan limit. A plan at its usage limit answers the CLI with HTTP 429. The executor maps it to `provider-busy`, so Verify fails with that refusal, the container log holds `cli-refused` with reason `provider-busy`, and the Digest wait is never reached.
- Job timeout. `timeout-minutes: 30` is above the 20-minute test timeout, the 3-minute server start, the devenv setup and an image build.

## Image

The `image` job of the gate workflow publishes the amd64 image after the full gate passes on the same tree, on a push to `main` or a manual dispatch with publishing enabled. The release workflow builds both architectures with provenance attestations.

- Runner. It is pinned to `ubuntu-26.04` and not `ubuntu-latest`, so its kernel setting changes only when a Renovate pull request moves the pin and its `image` run passes ([runner image announcement](https://github.com/actions/runner-images/issues/14748)).
- Tooling. Podman comes from the devenv shell, so `devenv.lock` sets its version. The shell also sets the storage paths Podman uses ([Development environment](development-environment.md), Podman storage and signature policy).
- Build. The `image:build` task is `container:build` without the smoke label and its prune.
- Layer cache. Container smoke reads cached layers anonymously from the public image package. A miss builds the layer locally. Publishing on a fresh runner writes cache layers without importing them, so each new published build fetches the current Debian packages. A failed cache write fails publication. Rerun the image job once the registry is available.
- Tags. The job keeps immutable `:sha-<full commit sha>` tags and moves `:main` only to a digest that passes the start check. A rerun reuses the existing `:sha-<full commit sha>` digest and start-checks it again. The `main-head` action stops an older commit from moving `:main`.
- Queue. The concurrency group `image-publish` holds the whole job, so runs build one after another.
- Manual run. Run the gate workflow by hand (`workflow_dispatch`) with `publish` left `false` to build and start-check without a push. `publish: true` works only on `main`.
- Visibility. A new package starts private and GitHub has no API to change that. The owner makes `ghcr.io/kyanitehq/threadsift` public once in the package settings.

## Start check

`tools/start-check.sh <image>` starts the image and waits up to 60 s for `/api/session` to answer 200. The 60 s count from the container start, not from the pull ([Testing](../testing.md)). CI runs it on every image it publishes, and it runs the same way on a developer machine, so a host that keeps a new image can call it before the switch.

`tools/image-digest.sh <reference>` prints a registry tag's digest. It prints nothing when the tag does not exist, and it fails when the registry cannot answer, so no step takes an outage for a missing tag.

## Releases

The release workflow handles version tags and is separate from the gate workflow, so an ordinary push to `main` never moves the `release` branch. Both of its jobs run only in `KyaniteHQ/threadsift`.

1. A `v*` tag must name a commit on `main`. The build fails before publication when that ancestry check fails.
2. One build job for each architecture pushes its image by digest with provenance, records the digest, start-checks the digest and, on amd64, runs the container smoke on it.
3. The publish job checks that `release` can advance by fast-forward, validates a dry-run image index (both platforms and two attestation manifests), publishes the version tag and moves `release` to the tagged commit.

The `release` concurrency group serializes whole runs, and their order is not guaranteed. The publish checkout keeps full history, so later releases advance `release` with a fast-forward push. If publication succeeds but the branch push fails, rerun the failed publish job. It reuses the recorded digests, and creating the same index again is idempotent. Each build records its pushed digest before the runtime checks, so those artifacts also identify untagged versions that a failed check leaves for manual cleanup.

Verified on 2026-11-17 with two pre-release runs ([first](https://github.com/KyaniteHQ/threadsift/actions/runs/44159949236), [second](https://github.com/KyaniteHQ/threadsift/actions/runs/44164286715)): `docker buildx imagetools inspect` showed both platforms and two attestation manifests, the native arm64 start checks answered 200, `release` advanced to the tagged commit's direct child, and an [ordinary main run](https://github.com/KyaniteHQ/threadsift/actions/runs/44162780681) left it unchanged.

## Rollback

The container can run an older image tag. Cloudflare can restore an older Worker version with `wrangler rollback`. Neither undoes a migration.

Before migrating, the live job tries to record the version serving all traffic. A first deploy, split traffic or a failed lookup leaves rollback unavailable. Migrations, publication and the session check still run. Both session checks use the target Wrangler reports for this deploy. If Wrangler reports no usable URL, the job fails before probing or rolling back.

A failed health check or a deploy error starts recovery. The recorded deployment must come from outside this run and must postdate the newest D1 migration. D1 records whole seconds, so a deployment in the same second cannot qualify. The deployment history must show this attempt serving all traffic immediately after the recorded deployment. A migration read error, an intervening deployment or a current deployment from another run requires manual recovery. After rollback, the job verifies the version ID and checks the same session URL for HTTP 200.

The `live-deploy` concurrency group serializes these jobs. Dashboard and CLI deploys bypass it. Keep manual deploys out of the period from the final history check until `wrangler rollback` finishes, because Wrangler cannot make its write conditional on the current deployment.

An older build cannot write the rows of a table whose migration added a `NOT NULL` column or a key. After such a migration, a rollback needs data from before it:

- Worker. Use D1 Time Travel to a minute before the migration ([Export, backup and restore](export-backup-and-restore.md)). Writes after that minute are lost.
- Container. Copy the database file before the upgrade.

The migration that added `source` to the thread tables is one such migration. The migration that dropped the trigger `items_restoring` and the column `restores.writing` is another: an older Worker then refuses no Paste during a Restore and fails every Restore slice. Roll back across it only while no Restore holds the library, or use Time Travel as above.
