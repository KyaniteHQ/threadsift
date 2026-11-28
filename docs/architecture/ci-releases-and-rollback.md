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
- [X API probe](#x-api-probe)
- [Image](#image)
- [Start check](#start-check)
- [Releases](#releases)
- [Rollback](#rollback)

```text
docs only     -> documentation checks -> aggregate `gate`
full gate     -> check + smoke(worker) + smoke(container) -> aggregate `gate`
code on main  -> full gate or matching pull request gate -> deploy (live Worker)
                                                        \-> image (ghcr.io :sha-<sha>, :main)
tag v*        -> release: plan -> build amd64 + arm64 --\
                          Extension files ----------------> publish index and image tags, move `release`, GitHub Release
                                                           -> stable tag only: Extension stores (environment extension-stores)
manual        -> live check (Worker and container, environment post-merge)
manual        -> release: Extension files -> dry run of the Extension stores (environment extension-stores)
daily         -> Extension store status (environment extension-stores)
```

## Gate

The gate workflow runs on every pull request and on every push to `main`.

| Job | Runs | Limit |
|---|---|---|
| `changes` | selects documentation checks, a full gate or a matching pull request gate | 5 minutes |
| `docs` | runs `ci:check` for a docs-only change, including formatting and doc references | 10 minutes |
| `check` | calls the reusable core workflow, which runs `ci:check` and the Extension's package command `extension:package`, which loads the Chrome zip in Chromium, removes the files on the docs-only skip list, then runs the other gate tasks ([Development environment](development-environment.md), Tasks), including the design check `impeccable detect --github web` | 10 minutes |
| `smoke` | the browser smoke spec, one runner for the Worker and one for the container image | 15 minutes |
| `gate` | checks the job results for the mode that `changes` selects | 2 minutes |

- A pull request qualifies for documentation checks only when both its branch changes since the common ancestor and its changes in the tested merge affect only files on the docs-only skip list. A push compares the old and new tips. Missing history or an empty comparison rules out documentation checks. A push with an empty comparison can still reuse a pull request gate. A force-push or a manual run takes the full gate.
- On `main`, the previous tip's push run must also have succeeded before the docs-only push arrived. Otherwise the full gate runs, including deployment and image publication after it passes, so docs cannot overtake an unfinished code deployment.
- For a docs-only change, only `changes`, `docs` and `gate` run.
- In a full gate, the core workflow runs `ci:check` and `extension:package` on the complete checkout, because the package command archives the tracked files and the source archive must hold the README the store reviewer reads. It then removes tracked files on the docs-only skip list before the tests, builds, audit and design check. The smoke, image and deploy jobs remove those files right after checkout. If a job that docs mode skips fails because it needs a missing file, remove that path from the list. Local gate tasks and the pre-push hook keep the files.
- When an unforced push does not qualify on paths alone for documentation checks, `changes` looks for a squash commit whose only parent is the previous tip of `main`. GitHub must associate that commit with exactly one pull request, merged into `main` from this repository, and record it as the pull request's merge commit. Fork runs can restore caches that earlier commits on the same pull request wrote.
- The pull request must leave workflows, local actions, devenv task definitions, the script that owns the docs-only skip list, the tree comparison script and the design-check engine scripts unchanged, including renames. GitHub must return one gate run for the merged head. Its latest successful attempt must record the local reusable core workflow once, with the pull request's merge ref and the resolved commit SHA. That commit must have the pushed tree and exactly two parents, the previous tip of `main` followed by the pull request head. A later update to the branch cannot substitute another tree. [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses)
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
- Retries. Nix makes up to 5 attempts at a throttled download, then fails the job. The action adds no retry, because a retry on the same address hides a throttle and does not avoid it. Rerun the job.

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
checkout -> remove files on the docs-only skip list
         -> main still at this SHA? --no--> skip every later step
               | yes
               v
   build web bundle -> try to record the current deployment
                    -> apply migrations
                    -> wrangler deploy --env live --keep-vars
                    -> GET /api/session at the reported deploy target, up to 11 tries, 5 s apart, until 200
             deploy or session check fails -> check rollback conditions below
```

- Skip when `main` moved. After removing the files on the docs-only skip list, the deploy job compares the run's SHA with the head of `main`, so two quick merges end on the newer one. The check is a step of `deploy` and not a job before it, because a job that `deploy` needs finishes before `deploy` waits in the concurrency group. A run that then waited behind another deploy would publish an older commit ([`jobs.<job_id>.needs`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)).
- The `live-deploy` concurrency group never cancels a running deploy and sets `queue: max`, so it holds up to 100 pending runs and replaces none. Without `queue: max`, a later run replaces the pending one, whatever its commit, and the newest merge could lose its deploy to a rerun of an older commit ([`concurrency`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)).
- Failure. A deploy or health-check failure fails the run on `main`, even after a successful [rollback](#rollback). Wrangler can publish the version before it finishes setting up triggers.
- Migrations first, so a failed migration never publishes code that needs the new schema. Wrangler rolls the failing migration back and keeps the earlier ones (`wrangler d1 migrations apply --help`, Wrangler 4.166.0).

This order has a cost, because the Worker that is still live runs on the new schema until `wrangler deploy` ends. A migration that adds a `NOT NULL` column with no default, or a foreign key, makes that Worker's writes to the table fail with `NOT NULL constraint failed` or `FOREIGN KEY constraint failed`. The migration that added `source` to the thread tables was one: every thread write fails in that window, and its job retries up to `MAX_ATTEMPTS` (3) attempts. An Export that the old Worker finishes in the window names the new migration in its manifest but holds records without `source`, so no Restore accepts it. Take no Export while such a deploy runs, and Export again after it. A migration that renames a table the previous Worker reads has the same cost. After the one that renamed the thread tables to `threads` and `thread_comments`, in a local run of the previous build on the migrated database, the Item list, the Reader, search and every Paste answered 500 and wrote nothing, the Highlights page answered 200, and an Export job failed each attempt. The container applies a migration in the one process that then serves, so it has no window.

### A migration that copies a table

The migration that renamed the thread tables copies `reddit_comments` into `thread_comments` and drops the old table at its end, so the database holds two copies of every comment until the file commits. A rename in place (`ALTER TABLE ... RENAME TO`) would avoid the copy, but it keeps the old CHECK constraint names, such as `reddit_threads_source_check`, so the schema would differ from a database built fresh from the migrations ([SQLite ALTER TABLE](https://www.sqlite.org/lang_altertable.html)).

- Room. The migration needs free room of about the size of the comments table with its indexes. In a local run with 500,000 comments, those took 224 MB, 1.3 times the bytes that `sum(length(body))` counts, and the database file grew from 224 MB to 445 MB on `node:sqlite` and on local D1. A D1 database holds at most 10 GB on Workers Paid and 500 MB on Free ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)), so the size that `wrangler d1 info threadsift-live` reports plus the size of the comments table must stay below the plan's limit. A container needs the same free room on the volume of its database.
- Time. D1 gives a query 30 seconds, and its docs say that a query that changes hundreds of thousands of rows will exceed its limits ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)). Local D1 applied the file to the same 500,000 comments in about 6 s, against about 2 s for a run with nothing to apply.
- Ids that collide. The migration removes `t1_` from each comment id, and the unique index `thread_comments_id` refuses two comments of one Item and generation that end with the same id, such as `t1_ab` and `ab`. The app never writes both forms, so only a hand-built Restore can hold them. A collision stops the migration, and the database stays as it was before the file: D1 rolls the file back and the deploy stops before `wrangler deploy`, and the container exits at start on every start, until the rows are fixed with the previous image running. Before the merge, list the colliding ids on the live database:

  ```sh
  pnpm exec wrangler d1 execute DB --env live --remote --command "select item_id, generation, group_concat(id) as ids from reddit_comments group by item_id, generation, case when id glob '[tT]1_[A-Za-z0-9]*' and substr(id, 4) not glob '*[^A-Za-z0-9]*' and length(id) <= 32 then substr(id, 4) else id end having count(*) > 1"
  ```

  For a container, run the same `select` on a copy of its database file. An empty result lets the migration run. For each row it returns, take an Export, delete that Item in the Reader (its Highlights and Note go with it), deploy, and Paste its link again.
- A Restore that runs. The migration changes the record files of an Export, so a Restore that still runs when the deploy applies the migration ends `failed` with `other-release`, and the rows it wrote stay until the owner cancels it ([Export, backup and restore](export-backup-and-restore.md)). Let a running Restore end before the merge.

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

## X API probe

`devenv tasks run x-api:probe` sends one named probe to the X API with the owner's Bearer token, and its requests can spend the owner's X credit. Only the owner runs it, by hand. No workflow runs it, no gate task runs it, and no core test or smoke check calls the X API. The task sets `wantedBy = [ ]` and has a namespace of its own, so only its own name, or the `x-api` prefix, selects it: another task run with `--mode after` or `--mode all`, or a prefix such as `live`, never starts it. Each probe answers a question that X's docs leave open:

| Probe | Question | Requests |
|---|---|---|
| S1 | Which names the API takes: `tweet.fields` and `note_tweet` from the docs pages, or `post.fields`, `note_post` and the `username` expansion from the OpenAPI document. Whether a usage read costs anything | a usage read, a balance read, then two lookups of one long post with a photo and a quote, one with each set of names |
| S2 | Whether expanded users and quoted posts are billed | a lookup of one post without expansions, a balance read, a lookup of a second post with expansions |
| S3 | What a deleted, a protected and a suspended post return | three single lookups and one batch lookup of the three ids |

The task refuses S4 to S7, which are not defined yet. Every probe starts and ends with a balance read (`GET /2/usage/credits`).

Results of the probes of 2026-11-26:

- **S1** ran 3 times. The usage read (`GET /2/usage/tweets`) answered 503 in all 3, so its price is unknown; the first 2 runs ended there, before a lookup. In the third run both sets of names worked, and each answer used the names of its request. Its two lookups together cost 0.02 USD, the table price of one lookup of that post (1 post, 1 quoted post, 1 user), as billing each resource once per UTC day predicts. The photo added no charge that the balance can show. The lookup asked for `author_id` and `username` and returned 1 user for a post that quotes its own author, so the run does not show what `username` adds.
- **S2** ran once. The users and the quoted posts in `includes` are billed: the lookup without expansions moved the balance by 0.01 USD, one 0.005 USD post seen through the balance's 0.01 USD step, and the lookup with expansions (1 post, 1 quoted post, 2 users) moved it by 0.03 USD, its table price.
- **S3** ran once. Each lookup of a deleted, a protected and a suspended post answered 200 with an `errors` entry and no `data`, and none answered 404. The deleted post's entry is `resource-not-found`; the protected and the suspended post's entries are the same `not-authorized-for-resource`. The run cost nothing.
- **Balance reads** showed no cost: across the 5 runs every change of the balance matched the lookups' table prices within 0.01 USD. In 3 of 3 cases a balance read 60 s after lookups showed their charge; a shorter wait is not measured.

The task reads its input from the environment, as the other live tasks do:

| Variable | Value |
|---|---|
| `X_API_PROBE` | `S1`, `S2` or `S3` |
| `X_API_POST_IDS` | different post ids, comma-separated: 1 for S1; 2 for S2, the plain one first; 3 for S3, in the order deleted, protected, suspended |
| `X_API_FIELD_NAMES` | S2 only: `tweet` or `post`, the names to send |
| `X_API_CAP_USD`, `X_API_CAP_POSTS` | the caps of the run, at most 2 USD and 400 posts |
| `X_API_BEARER_TOKEN` | the app's Bearer token from the owner's secret store, set in the environment of this one command |
| `X_API_RUNS_DIR` | an absolute folder that git ignores or that is outside every git work tree, such as a runs folder in the owner's private folder |
| `X_API_DRY_RUN` | `1` prints each planned request with its worst-case cost and sends nothing. It needs no token and no runs folder. Any other value is refused |

The task refuses to start when a variable is missing or wrong, when a cap is above the ceiling, or when the worst case of the probe is above a cap. The refusal names the variable, never its value, and exits 1. A cap of 0 sends no request, not even a balance read, and exits 0. The token goes only into the `authorization` header. The task never prints it, and it replaces the token, its URL-encoded form and any `Bearer` value with `[redacted]` in every file it writes.

How the task bounds the spend:

- **Prices.** A post costs 0.005 USD and a user 0.010 USD per resource returned ([pricing](https://docs.x.com/x-api/getting-started/pricing)). Every amount is shown with 6 decimals, the precision of the caps. The measured spend has the precision of `total_balance`, which X returns with 2 decimals, so it is exact only to 0.01 USD.
- **Assumptions.** Where X's docs leave a price or a bound open, the task counts the most the docs allow, prints each such number under the plan, and writes it to `plan.json` and `summary.json`. A usage or balance read counts 0.200 USD, the highest charge on the pricing page, because the page does not price the [usage endpoints](https://docs.x.com/x-api/usage/introduction). The `username` expansion counts 4 users for each id, the author and the authors of 3 referenced posts, because the OpenAPI document does not describe it. Media, polls, places, topics and calls are not on the price table, so they count 0. The results above leave these counts in place, because the usage read's price and the bound of the `username` expansion are still not measured.
- **Worst case of a lookup.** Each id returns its own post. `referenced_tweets.id` or `referenced_posts` adds 3 posts for each id, because a post can reply to, quote and repost, the three kinds of `referenced_tweets` in the [data dictionary](https://docs.x.com/x-api/fundamentals/data-dictionary). `author_id` adds 1 user and `referenced_tweets.id.author_id` adds 3.
- **Counting.** The task counts every collection of `includes` by kind, the included posts under both `tweets` (the docs pages) and `posts` (the OpenAPI document), each post id once. An answer it cannot count, such as one with an unknown `includes` collection, is charged its worst case and stops the run.
- **Before each request.** The spend charged so far, the request's worst case and the worst case of the last balance read must fit both caps. Otherwise the task skips to the last balance read. The run also stops after the first balance read when the balance is below the probe's worst case.
- **An answer above the plan.** When a lookup returns more billable posts or users than the plan counted for it, the task skips to the last balance read and exits 1.
- **One send for each request.** The task sends with Node's `https.request` and `agent: false`, a new connection for each request, and never repeats a request on any status. It does not use `fetch`, because Node's `fetch` sends a request again after a 421 on a reused connection, as the 421 step of [HTTP-network-or-cache fetch](https://fetch.spec.whatwg.org/#http-network-or-cache-fetch) in the Fetch standard asks. A 401, a 429, a status above 599, no answer within 30 s or a network failure ends the run with the answer saved, and so does a 5xx to any request but a usage read. Any other status is saved. A usage read that answers it, a 5xx included, stays charged at its worst case and the run goes on; such a run does not show whether a usage read costs anything, and its balance-lag check rests on the lookups alone. A lookup that answers it goes on only when its answer can be counted. A balance read that is not a 200 with `data.total_balance` ends the run, as Balance lag says.
- **Balance lag.** Each balance read after the first waits 60 s, because the balance may lag the requests. A balance read that is not a 200 with `data.total_balance` stops the run and exits 1; when the last one fails, the summary says the measured spend is unknown.
- **Billing once a day.** X bills a post or a user once per UTC day ([pricing](https://docs.x.com/x-api/getting-started/pricing#deduplication)), so a second lookup of the same post on one day costs nothing. S1's second lookup reads the same post with the other set of names, so its counted spend exceeds its measured spend. S2 and S3 need posts that nothing read earlier the same UTC day.

The runs folder is checked before the first request. The task resolves the real path of `X_API_RUNS_DIR`, refuses a link whose target is missing, and asks git with no inherited `GIT_*` variable whether the nearest existing folder is in a work tree. Inside a work tree, git must report every file the run will write as ignored. After it creates the run folder, the task checks again that its real path is the one it checked.

Each run writes a folder `<UTC time>-<probe>` in `X_API_RUNS_DIR`, with mode 0700 and files with mode 0600. It holds `plan.json` (the requests, their worst cases, the assumptions and, for a probe with a usage read, `onUsageFailure`, the rule for a usage read that fails), one file for each request (the status, the rate-limit headers and the body), and `summary.json`: the resources counted by kind; the counted spend at table prices and with the usage reads, and whether every request was counted; the spend charged for the caps, which uses the worst case of a request without an answer, of an answer that cannot be counted, and of an answer that is not a 200 to a usage or balance read; and the measured spend, the first balance minus the last. When a usage read failed and the run went on, `summary.json` and the terminal's last line also hold `usageQuestion`, which names the status and repeats what such a run does not show. The terminal shows only counts, post ids, problem types and balances, never post text. The task exits 0 when the probe finished with both balances read, a run whose usage read failed included, and 1 otherwise.

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

The release workflow handles version tags and is separate from the gate workflow, so an ordinary push to `main` never moves the `release` branch. Its jobs run only in `KyaniteHQ/threadsift`.

`tools/release-plan.sh <tag>` decides what a tag moves, and both the `plan` and the `publish` job call it. It reads the repository's `v*` tags and the root changelog, prints each decision and changes nothing, so it also runs on a machine with no tag pushed. `--changelog <file>` reads another changelog, such as a draft.

| Tag | Image tags | `release` branch | GitHub Release | Extension stores |
|---|---|---|---|---|
| `v1.4.2` | publishes `1.4.2`, moves `1.4`, `1` and `latest` | moves to the tagged commit | a release marked latest | submits `1.4.2` to both, unless a newer stable tag exists |
| `v1.5.0-rc.1` (any tag with `-`) | publishes `1.5.0-rc.1` only | stays | a prerelease | none |

- Every Cloudflare copy follows the `release` branch, so a release candidate never moves it. A release candidate never reaches an Extension store either, because WXT writes `1.0.0-rc.1` as manifest version `1.0.0`, and Chrome refuses a later upload whose version did not rise. An image tag holds at most 128 characters and no `+`, so the plan refuses a longer version and a tag with `+<build>` before anything builds.
- A moving tag stays when a newer stable tag in its range exists, so a run of an older tag that ends last moves nothing back. A stable tag counts as newer from the moment it is pushed, so a stable tag whose run fails blocks the moving tags of every older tag until it is deleted. Delete it, fix the cause on `main`, and tag again; the plan reads the changelog at the tagged commit, so a fix needs a new tag anyway.
- A stable release takes its notes from its own section of the root changelog, `## <tag>`, and a release candidate from `## Unreleased`, because the changelog keeps every change since the last stable release there until that release is cut. A minor release's heading may carry a headline for its title, as in `## v1.1.0: <headline>`.

1. The `plan` job runs the plan, writes it to the job summary and fails before any build when the tag or the changelog section is wrong.
2. A `v*` tag must name a commit on `main`. The build fails before publication when that ancestry check fails.
3. One build job for each architecture pushes its image by digest with provenance, records the digest, start-checks the digest and, on amd64, runs the container smoke on it. Beside them, the `extension` job runs the Extension's package command ([Extension and Threadsift bot](extension-and-threadsift-bot.md#package-for-the-stores)) and keeps the two store zips and the source archive as the artifact `extension-files`.
4. The publish job runs the plan again, because a tag pushed while the build ran changes which moving tags move. When `release` moves, it checks that `release` can advance by fast-forward. It validates a dry-run image index (both platforms and two attestation manifests), publishes the version tag and the moving tags in one index, checks that each tag names that index, and moves `release` when the plan says so.
5. The publish job then creates the GitHub Release as a draft with the files the plan names, checks that the draft lists exactly those files as uploaded, and only then publishes it, because once the repository turns on immutable releases a published release takes no new file ([gh release create](https://cli.github.com/manual/gh_release_create), Immutable Releases). The plan names the Extension's three files of the tag's version, so a tag whose Extension carries another version stops here.
6. For a stable tag with no newer stable tag, and only when `publish` succeeded, the `stores` job then submits those same files to the Chrome Web Store and Firefox Add-ons ([Extension stores](#extension-stores)).

The `release` concurrency group serializes whole runs, and their order is not guaranteed. The publish checkout keeps full history, so later releases advance `release` with a fast-forward push. If publication succeeds but the branch push fails, rerun the failed publish job. It reuses the recorded digests, and creating the same index again is idempotent. Rerun only the failed jobs, never all jobs: a new build pushes new digests, and the publish job then refuses to point the version tag, which never moves, at them. A rerun deletes a draft that an earlier attempt left and creates it again, and passes over a published GitHub Release only when it carries every file the plan names. Each build records its pushed digest before the runtime checks, so those artifacts also identify untagged versions that a failed check leaves for manual cleanup.

Verified on 2026-11-17 with two tag runs ([first](https://github.com/KyaniteHQ/threadsift/actions/runs/44159949236), [second](https://github.com/KyaniteHQ/threadsift/actions/runs/44164286715)): `docker buildx imagetools inspect` showed both platforms and two attestation manifests, the native arm64 start checks answered 200, the fast-forward push advanced `release` to the tagged commit's direct child, and an [ordinary main run](https://github.com/KyaniteHQ/threadsift/actions/runs/44162780681) left it unchanged. No tag has yet run the plan, the moving tags or the GitHub Release steps ([Open items and unverified claims](open-items-and-unverified-claims.md)).

### Extension stores

The `stores` job submits the Extension to the Chrome Web Store and Firefox Add-ons. It runs after `publish` succeeded for a stable tag that no newer stable tag follows, because a store refuses a version below the one it holds, in the environment `extension-stores`, as `node tools/extension-stores.ts submit <tag>`. It uploads the files of the `extension-files` artifact, the same files `publish` attached to the GitHub Release. The command calls `wxt submit`, which is `publish-browser-extension` 6.2.0: for Chrome, Chrome Web Store API v2 `upload`, then `publish`, which submits the version for review and publishes it after approval; for Firefox, Add-ons API v5 `upload`, then a listed version with the source archive. A Chrome review still pending for an earlier version is cancelled first, and Chrome allows 6 cancels a day ([cancel a submission](https://developer.chrome.com/docs/webstore/cancel-review)). Both stores run even when one fails, and the job fails when either upload or submission fails.

Neither store publishes at once. Chrome reviews every upload, "within a few days, but it can take up to a few weeks" ([review process](https://developer.chrome.com/docs/webstore/review-process)). Firefox signs and publishes within 24 hours, or later when it picks the upload for a manual review ([signing and distribution](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)). So the job promises that each stable release is submitted to both stores in its run, not the day the stores show it.

The command refuses a real upload, before it reads any credential, unless the run is a `push` of that tag (`GITHUB_EVENT_NAME` and `GITHUB_REF`), the tag has no `-`, the Extension's package carries the tag's version, and no newer stable tag is on `origin`. It then needs the three files in WXT's output folder and the sign-in values below. It names each missing variable and prints no value. Before `wxt submit`, it reads both stores and leaves out a store that already holds the version: Chrome when its published or submitted revision carries it as `PENDING_REVIEW`, `STAGED`, `PUBLISHED` or `PUBLISHED_TO_TESTERS`, and Firefox when the version exists in any status, because Firefox refuses a version number it already has. So a rerun of the job after one store failed submits only the other, and never cancels a review of the same version. When either read fails, it uploads nothing. After `wxt submit`, it reads each store's state again, prints a table with one row for each store, a failed read included, and adds it to the job summary, as the daily status run does.

- **Manual dry run.** Run the release workflow by hand on `main`, with `dry_run` left on. The `stores` job runs for a manual run on `main` only. Only the `extension` and `stores` jobs run: `extension` builds the files from `main`, and `stores` runs `wxt submit --dry-run`, which signs in to both stores (Chrome `fetchStatus`, the Firefox add-on's detail) and uploads nothing, then reads each store's state. A manual run with `dry_run` off fails at the refusal.
- **Environment.** `extension-stores` lets only `v*` tags and the default branch deploy, and it has no required reviewer, so a release needs no click. Create it with those rules before the first run that names it, because a run that names a missing environment creates it with no protection rules ([Managing environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)). The `stores` job names it for a stable tag and for a manual run on `main`, and the status job only on `main` once a stable tag exists. A manual run on a `v*` tag would run that tag's code with the environment's values and skip the check that the tag's commit is on `main`, so neither job runs for it; protect `v*` tags with a tag ruleset as well, because the environment admits every `v*` tag ([rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)).

| Name | Kind | Holds |
|---|---|---|
| `CHROME_PUBLISHER_ID`, `CHROME_EXTENSION_ID` | variable | the Chrome Web Store publisher and item |
| `GCP_WORKLOAD_IDENTITY_PROVIDER`, `CHROME_SERVICE_ACCOUNT_EMAIL` | variable | the Google Cloud workload identity provider and the service account the Chrome Developer Dashboard lists |
| `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` | secret | the service account's key, only when the store refuses the short-lived token |
| `FIREFOX_EXTENSION_ID` | variable | the add-on's numeric id on Firefox Add-ons |
| `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET` | secret | the key and secret from the Add-ons API Credentials page |

- **Chrome sign-in.** When `GCP_WORKLOAD_IDENTITY_PROVIDER` is set, `google-github-actions/auth` v3.0.0 (Apache-2.0, Google) trades the run's GitHub OIDC token for a one-hour access token of the service account with the scope `https://www.googleapis.com/auth/chromewebstore`, so the environment stores no Chrome key. Chrome's API accepts a service account, and a short-lived token by impersonation ([service accounts](https://developer.chrome.com/docs/webstore/service-accounts)); whether it accepts this token is not observed yet. Without the provider the step is skipped and the command signs in with the key secrets.
- **Firefox add-on id.** The Add-ons API v5 add-on and version routes take an add-on id, slug or guid ([Add-ons API](https://mozilla.github.io/addons-server/topics/api/addons.html)). `wxt submit` strips the braces of a guid, and Firefox Add-ons looks a guid up only in the braced form ([`Addon.get_lookup_field`](https://github.com/mozilla/addons-server/blob/a2900ac9c4fef3c99ba06849f3754e930c2d6894/src/olympia/addons/models.py#L1993-L2003)), so the variable holds the numeric `id` that the add-on detail route answers. The status read fails when the add-on's `guid` is not the Extension's Gecko ID.
- **Firefox sign-in.** Each call carries a JWT signed with HS256 by the secret, valid for at most 5 minutes ([Add-ons API authentication](https://mozilla.github.io/addons-server/topics/api/auth.html)).

### Store status

The `extension-stores` workflow runs every day at 07:23 UTC, and by hand on `main`. Its `newest` job reads the newest stable `v*` tag on `origin`, and fails when `origin` does not answer. While no stable tag exists, the `status` job is skipped. Otherwise it signs in with a read-only Chrome token and runs `node tools/extension-stores.ts status <tag>`, which reads Chrome's `fetchStatus`, the Firefox add-on and its version `<version>`, which the route reads as a version number because it holds a dot ([Add-ons API](https://mozilla.github.io/addons-server/topics/api/addons.html), Version Detail), prints the table and fails, so GitHub mails the owner, when:

- a store read fails, while the table still shows the other store;
- Chrome took the item down, warned it for a policy violation, or rejected its published or submitted revision;
- the Firefox add-on's status is `disabled`, `rejected` or `deleted`, the add-on is disabled, or the version's file status is `disabled`, which Firefox uses for a rejected version;
- a store's public version is not the tag's version 21 days or more after the tag's date, because Chrome's line for contacting support is three weeks ([review process](https://developer.chrome.com/docs/webstore/review-process)). The date is the tagger date of an annotated tag and the commit date of a lightweight one.

Both stores also mail the owner about a rejection. GitHub turns a schedule off after 60 days without activity in a public repository ([`schedule`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)).

### Versions and the release pull request

Every release carries one version, `X.Y.Z`, or `X.Y.Z-rc.N` for a release candidate, and its tag is `v` followed by the version ([Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)). The first stable release is `v1.0.0`. A patch release holds fixes only and never a migration, so an image tag such as `1.4` is always safe to follow. The version is committed and never passed in at build time, because the Firefox reviewer rebuilds the Extension from the source archive and must get the same files.

`node tools/release.ts v<version> --dry-run` prints each change the release would make, from the files committed at `HEAD` and the `v*` tags on `origin`, and writes nothing, no ref or tag included. Without `--dry-run`, the command fetches `main`, builds the commit `chore(release): v<version>` on the tip of `origin/main` in a temporary index, pushes it as the branch `release-v<version>` and opens the release pull request, whose body holds the notes. It never changes the checkout. A failed step ends with one line that names it, and a second run makes the same commit, skips a push that `origin` already holds and reuses an open pull request. When `main` moved after the push, it names the branch to delete first. After the merge, the owner tags the squash commit and pushes the tag, which starts the release workflow. The branch is not `release/v<version>`, because Git refuses that name beside the `release` branch.

The command writes the version into:

- the app's `version` in the root package manifest, which the other files follow;
- the image's `org.opencontainers.image.version` label, the last line of the `Containerfile` ([OCI annotations](https://github.com/opencontainers/image-spec/blob/v1.1.1/annotations.md));
- the Extension's `version` in its package manifest, from which WXT 0.21.5 takes the manifest version and, for Chrome, `version_name`.

The bot keeps its own `bot-v<N>` numbering and its own release ([Extension and Threadsift bot](extension-and-threadsift-bot.md), Release), because an installed bot looks for a new release only among the `bot-v` tags, so a shared tag would never reach it. The dry run says so in one line. The bot joins the shared version once its update procedure follows the Instance: that change adds its version file and skill pin to `VERSION_FILES`, which the command writes and the gate compares.

It refuses, with the reason, and changes nothing when:

- the tag is not `vX.Y.Z` or `vX.Y.Z-rc.N`, or a number in it has more than 15 digits;
- the version is not above the newest `v*` tag or the version the app already carries;
- no stable tag exists yet and the version is not `v1.0.0` or one of its candidates;
- the version, or the candidate of one, has a patch above 0 and the newest stable tag has another major or minor, so there is no release to patch;
- it is such a patch release and a migration file (a `.sql` file of the migration folder) differs from the newest stable tag. The refusal lists the files and names the next minor. A change to the migration metadata alone does not count, because both targets apply only the `.sql` files;
- the root changelog does not hold exactly one `## Unreleased`, or, for a stable release, holds no notes under it or already holds the release's section;
- `--headline` comes with a release candidate or a patch release.

`pnpm run check:versions`, part of `pnpm run check` and so of the gate, fails when the image label or the Extension carries another version than the app. While the app's version is a patch release that has no tag yet, it also fails when a migration file differs from the newest stable tag, so a migration merged after the release pull request opened cannot reach the tag. Only then does it read `origin`, fetching the tag's commit when the clone lacks it.

### Changelog

The root changelog holds the release notes, written by hand under `## Unreleased` as each change lands. A release's notes open with two or three plain sentences, then "Before you update" (migrations, the rollback floor, manual steps, the Extension and bot versions this Instance expects), then Added, Changed, Fixed and Security. A release candidate leaves the changelog alone, so `## Unreleased` keeps every change since the last stable release. A stable release turns `## Unreleased` into `## v<version>`, or `## v<version>: <headline>` with `--headline` for a release with patch 0, under a new empty `## Unreleased`. Changes to the bot's files also go into the bot changelog, which the bot's own release cuts.

## Rollback

The container can run an older image tag. Cloudflare can restore an older Worker version with `wrangler rollback`. Neither undoes a migration.

Before migrating, the live job tries to record the version serving all traffic. A first deploy, split traffic or a failed lookup leaves rollback unavailable. Migrations, publication and the session check still run. Both session checks use the target Wrangler reports for this deploy. If Wrangler reports no usable URL, the job fails before probing or rolling back.

A failed health check or a deploy error starts recovery. The recorded deployment must come from outside this run and must postdate the newest D1 migration. D1 records whole seconds, so a deployment in the same second cannot qualify. The deployment history must show this attempt serving all traffic immediately after the recorded deployment. A migration read error, an intervening deployment or a current deployment from another run requires manual recovery. After rollback, the job verifies the version ID and checks the same session URL for HTTP 200.

The `live-deploy` concurrency group serializes these jobs. Dashboard and CLI deploys bypass it. Keep manual deploys out of the period from the final history check until `wrangler rollback` finishes, because Wrangler cannot make its write conditional on the current deployment.

An older build cannot write the rows of a table whose migration added a `NOT NULL` column or a key. After such a migration, a rollback needs data from before it:

- Worker. Use D1 Time Travel to a minute before the migration ([Export, backup and restore](export-backup-and-restore.md)). Writes after that minute are lost.
- Container. Copy the database file before the upgrade.

The migration that added `source` to the thread tables is one such migration. The migration that renamed the thread tables needs the same rollback, because a build from before it reads the old table names. The migration that dropped the trigger `items_restoring` and the column `restores.writing` is another: an older Worker then refuses no Paste during a Restore and fails every Restore slice. Roll back across it only while no Restore holds the library, or use Time Travel as above.
