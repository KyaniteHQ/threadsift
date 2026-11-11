# Operate PR previews

`.github/workflows/bundle.yml` builds same-repository PRs without secrets and uploads only the Worker bundle, web assets and SQL migrations. `.github/workflows/pr-preview.yml` runs on `main` after that workflow succeeds. It deploys the matching artifact using tools, configuration and dependencies checked out from `main`. Artifact JavaScript is uploaded with Wrangler's `no_bundle` mode and additional-module discovery disabled; it is never executed on the runner. Artifact config, scripts and package manifests are not consumed. Fork PRs are excluded.

Restrict the GitHub environment `preview` to the branch `main`. Store `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PREVIEW_SETUP_CODE` and `DEMO_OWNER_PASSWORD` there. The setup code needs at least sixteen characters; the demo password needs at least fifteen. Impeccable Reviews must hold that same demo password. The deployed PR Worker receives its own encryption secret and setup code, and the demo password is sent to its setup or sign-in endpoint. It receives no Cloudflare API token or live credentials. Keep live and post-merge credentials in their own environments.

The Cloudflare token needs Worker script edit, D1 edit, R2 storage edit and Queues edit, with the account reads those operations require. It also needs KV read: Wrangler 4.158.0 `wrangler delete` lists legacy Workers Sites asset namespaces after deleting the Worker, even when this config uses no KV (`deleteSiteNamespaceIfExisting` in the installed Wrangler source). Without it, the command can report `10000` after the Worker is already gone; rerunning close resumes the remaining cleanup. Worker secrets are initialized only when absent. Updates preserve the encryption key and setup code, so saved Provider credentials stay readable. Do not remove the encryption secret while retaining the preview database.

`tools/pr-preview.ts` derives the resource manifest from the PR number. Its stable identity is the repository plus PR number; head changes and branch renames retain the Instance. Closing deletes it; reopening creates a fresh one. No arbitrary Worker, database, bucket or Queue name is accepted. GitHub deployment records use `pr-N` as the environment and the built PR head SHA as the revision. They remain as history after the resources are deleted.

Inspect a manifest without a Cloudflare login:

```sh
node tools/pr-preview.ts deploy 222 --plan
node tools/pr-preview.ts close 222 --plan
```

Compile a downloaded artifact without remote mutations:

```sh
node tools/pr-preview.ts deploy 222 --dry-run /path/to/artifact
```

The trusted workflow runs `--apply`. Wrangler 4.158.0 provisions the named D1, R2 and Queue resources. The tool initializes missing secrets, applies the artifact migrations, provisions the demo owner and Pastes the demo links in `tools/preview-owner.ts`. Existing owners and Items are retained. The API's normalized URL filter finds each existing demo Item even beyond the first list page, so provisioning neither duplicates nor refreshes it. Fetching happens asynchronously through the preview Queue. Provisioning logs out its session and runs no deployed check suite. A first deploy can briefly answer errors before migrations finish.

Before it Pastes, provisioning saves the keyless `workers-ai` Provider with the model `@cf/meta/llama-3.3-70b-instruct-fp8-fast` through `PUT /api/settings/ai`, but only when `GET /api/settings/ai` shows no Provider, so a Provider set by hand on a preview stays. The Worker's `AI` binding needs no secret. The Digests, Topics and Topic page overviews of the demo Items therefore come from a real model, a minute or two after the Paste. `https://example.com/` has no article text, so it gets no Digest and no Topic.

The two reads that provisioning makes, `GET /api/settings/ai` and `GET /api/items?url=`, retry on 404 and 5xx up to 11 times, 5 seconds apart, as the live deploy waits for `/api/session` in `.github/workflows/gate.yml`. That window is a repository choice and not a Cloudflare figure; Cloudflare's docs state no propagation time for a new Worker. Run 42932873349 got a 404 from `GET /api/items` right after setup and sign-in had answered, on a Worker that was seconds old, and its rerun passed. The app has no 404 for that route, so the response came from the edge before the new Worker was fully routed. A fresh scratch Worker with the same asset and `run_worker_first` settings answered 26 of 26 polls without a 404, so the cause stays inferred. The Paste is a single call and is never retried.

Before it deploys, the tool compares the migration names that the existing preview D1 has applied (`d1_migrations`, read with `wrangler d1 execute`) with the `.sql` files in the artifact's `migrations/`. A rebase that renumbers a migration leaves a name in the database that the artifact lacks, and `wrangler d1 migrations apply` then fails with code `7500`. In that case the tool logs one line, deletes the D1, creates it again and pins the new `database_id` in the generated config, because a deploy without it reuses the deleted database's id from the deployed Worker and fails with code `7404` (Wrangler 4.158.0). The owner, Items and Provider start fresh; the retained encryption secret and setup code still fit the empty database, and `initializeSecrets` has nothing to add. Files in the preview R2 bucket stay. A database with only names the artifact also has, or with no migration table, is migrated as before. The GitHub deployment carries the preview URL on the PR head SHA for Impeccable Reviews.

`tools/preview-selection.ts` rejects fork, failed, obsolete and closed bundle runs. A job rechecks the PR immediately before applying its manifest. Jobs for one PR serialize without cancellation. A PR that closes during deployment is collected by the next sweep. Cleanup runs on pushes to `main`, on the schedule in the workflow, or by dispatch from `main`:

```sh
gh workflow run pr-preview.yml --ref main -f pr=222
```

An empty dispatch sweeps closed previews. Selection reads the latest GitHub deployment for each `pr-N` environment, checks the PR's state and skips inactive deployments. Successful cleanup marks every deployment for that PR inactive. This also covers unmerged PRs, without `pull_request_target`. Schedules can be delayed by GitHub; the dispatch provides a manual recovery. The workflow must first exist on `main` before `workflow_run` can trigger it ([GitHub events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)).

Cloudflare's [Workers Previews](https://developers.cloudflare.com/workers/previews/resources/) cannot consume Queues or receive Cron triggers, so these previews use separately named Workers. Trusted config copies shared runtime settings from `wrangler.jsonc`, with no live bindings, routes or variables. Cloudflare refuses Worker deletion while it consumes a Queue (code `10064`, reproduced with Wrangler 4.158.0); cleanup removes only the manifest Worker's consumer before deleting it ([Queues commands](https://developers.cloudflare.com/workers/wrangler/commands/queues/)). Wrangler 4.158.0 has no populated-bucket empty command (`pnpm exec wrangler r2 bucket --help`), so `tools/preview-cloudflare.ts` uses the documented [R2 prefix-delete job](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/jobs/methods/create/) before deleting the bucket.

Preview failures do not block the gate. A failed deploy or cleanup stays red in Actions, and a deploy also records a failed GitHub deployment. A failed cleanup leaves its deployment active so a later sweep retries it. Reruns skip absent resources and confirm all manifest resources are gone. Deletion has no data rollback; a later deploy creates an empty preview. The per-command and HTTP deadlines in the tools fit inside the workflow's job deadline. A failure stops the sequence and leaves later resources for a rerun. Once the consumer is detached, the Worker is removed before bucket cleanup so it cannot create new objects. No failure path deletes beyond the printed manifest.
