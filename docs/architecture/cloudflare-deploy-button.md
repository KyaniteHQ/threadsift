# Cloudflare deploy button

The button at the top of the [README](../../README.md) deploys the `release` branch to Cloudflare. To create an Instance and set up updates, follow the [self-hosting guide](../guides/self-hosting.md#deploy-with-the-cloudflare-button). This page explains how the button, the CLI deploy and the update workflow work.

## What the button does

The button address ends in `tree/release`. The `release` branch moves only when a stable release is cut, never for a release candidate ([CI, releases and rollback](ci-releases-and-rollback.md#releases)). Cloudflare provisions the D1 database, R2 bucket and Queue that the Worker configuration names. Cloudflare supports deploy buttons for Workers in public repositories on github.com and gitlab.com ([Cloudflare deploy buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/)).

The button copies the repository into the deployer's own GitHub account, "where they can continue development after deploying", and writes the provisioned resource ids into that copy's Worker configuration ([Deploy buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/)).

## Secrets and variables

- Secrets. Cloudflare reads the secret names from `.dev.vars.example` and shows the descriptions under `cloudflare.bindings` in the package manifest on the form. The button reads from `release`, so a changed description appears after the next release ([Cloudflare support for variables and secrets](https://developers.cloudflare.com/changelog/post/2025-07-01-workers-deploy-button-supports-environment-variables-and-secrets/)). The two secrets are `THREADSIFT_SECRET_KEY` and `SETUP_CODE`; [Keep the secret key](../guides/self-hosting.md#keep-the-secret-key) says why the key must outlive the Instance.
- Public origin. `THREADSIFT_PUBLIC_ORIGIN` is a Worker variable, not a secret, and its value is the deployed `https://` origin. The Worker configuration does not hold it, because the origin differs for each deployment and an absent value means no public origin. The deployer sets it as a variable of the Worker. [AI tasks and Providers](ai-tasks-and-providers.md) says what needs it.

## The CLI deploy

`pnpm run deploy` builds the web app and deploys the Worker. D1 must exist before Wrangler can apply migrations, and provisioning during the Worker deploy happens too late. The command therefore creates a missing D1 database, applies the migrations without a confirmation prompt, and then runs `wrangler deploy --keep-vars`. The [self-hosting guide](../guides/self-hosting.md#deploy-on-cloudflare-with-the-cli) lists the steps.

- It accepts JSON only and passes the secrets file to Wrangler unchanged. Wrangler's JSON path applies no environment override or expansion.
- It refuses a secrets file with a value the Instance would not accept: an empty `THREADSIFT_SECRET_KEY` or `SETUP_CODE`, a `THREADSIFT_SECRET_KEY` of the wrong form, a `SETUP_CODE` or `PASSWORD_RESET_CODE` under its minimum length, or a `THREADSIFT_OPENROUTER_MAX_PRICE_ZERO` that is not one of its two values. The check uses the rules the Instance applies when it reads those values, runs before anything is built or deployed, and names each broken rule. If you leave `THREADSIFT_SECRET_KEY` or `SETUP_CODE` out of the file, the Worker must already hold it, or the command stops. The other two are optional.
- `--dry-run` checks the build and configuration offline. The file must hold both secrets, because an offline check cannot verify inherited ones.

## Workers Paid

The Worker needs the Workers Paid plan ($5 a month). Two measurements support this:

- Extracting one 362 KB article page with Defuddle took 236 ms on local workerd (2026-11-04). The free plan allows 10 ms of CPU for each request ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)).
- On the free plan, Cloudflare refuses the upload of the committed configuration, because it sets `limits.cpu_ms` (error 100328, 2026-11-17). A copy deployed there without that line fetched one article and digested it after one canceled Digest invocation and a retry about 15 minutes later. After 8 Pastes within 4 seconds, 4 of its 24 Queue invocations ended `exceededCpu` (Workers telemetry query API, view `invocations`, field `$workers.outcome`). 7.9 minutes after the first Paste, 4 of the 8 Items were still not fetched, not counting a GitHub repository Item that waited on its rate limit (2026-11-18).

## Updates

A copy made by the button receives later releases through the update workflow. The [self-hosting guide](../guides/self-hosting.md#update-a-cloudflare-copy) says how to set it up. The workflow runs weekly or on demand in standalone copies, and skips the upstream repository and its forks. Every other workflow of the repository runs only in the upstream repository, so a copy runs none of the project's gate or release jobs.

```text
upstream release branch
        |  fetch, lay its tree over the copy's tree (no shared history needed)
        v
   update branch  threadsift-update   (one PR into the copy's default branch)
        |  the deployer merges
        v
   Workers Builds deploys the merge, and the deploy command runs new migrations
```

- The workflow writes the copy's own resource ids back into the new Worker configuration by binding name, and lists new bindings in the pull request. The release supplies the config updater. Its command-line arguments keep their order, so older copies can call it: copy config, release config, pull request body.
- It opens the pull request with a fine-grained token that the deployer adds as `UPDATE_TOKEN` (contents, pull requests and workflows on the copy), because Actions' own `GITHUB_TOKEN` may not change files under the workflows folder.
- The branch `threadsift-update` is replaced on each change. The diff shows copy-only edits as removals or reversions, and merging drops them. If the release no longer differs from the copy, the workflow closes the open pull request with a comment.
- When a step fails, the run fails and opens an issue in the copy. It comments on the same open issue if the failure recurs.

## Live run on 2026-11-19

The owner ran the whole path on Workers Paid: the form, a private copy, owner setup, an article Paste that reached `ready`, and an update pull request that deployed after the merge. [Open items and unverified claims](open-items-and-unverified-claims.md) lists what the run did not prove.

- The deploy form shows no plan notice, with or without `paid=true`, so the README states the Workers Paid requirement beside the button ([Cloudflare's 2020 announcement](https://blog.cloudflare.com/introducing-deploy-buttons/) describes a badge that the button did not return).
- An expired GitHub authorization needs the app uninstalled and reinstalled ([fix](../guides/self-hosting.md#fix-an-expired-github-authorization)).
- The update pull request's preview build failed, so the guide turns preview builds off ([Cloudflare's Workers Builds announcement](https://developers.cloudflare.com/changelog/post/2025-04-08-deploy-to-cloudflare-button/)).
