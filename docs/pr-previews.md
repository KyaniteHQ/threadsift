# Operate PR previews

`.github/workflows/pr-preview.yml` deploys same-repository pull requests separately from the gate. Forks never enter the job. A close event uses `pull_request_target` and checks out the default branch, so cleanup never executes the closed branch. Runs for one PR serialize without cancellation; a queued deploy skips a closed PR or an obsolete head.

Create the GitHub environment `preview`, permitting same-repository PR refs and the default branch. Store `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PREVIEW_SETUP_CODE` and `DEMO_OWNER_PASSWORD` there. The setup code needs at least sixteen characters; the demo password needs at least fifteen. Impeccable Reviews must hold that same demo password. Use a dedicated preview account when possible: same-repository code is trusted and can access these credentials. Fork code is excluded; it must never be copied into a trusted branch without review. Keep live and post-merge credentials in their own environments.

The Cloudflare token needs Worker script edit, D1 edit, R2 storage edit and Queues edit, with the account reads those operations require. It also needs KV read: Wrangler 4.158.0 `wrangler delete` lists legacy Workers Sites asset namespaces after deleting the Worker, even when this config uses no KV (`deleteSiteNamespaceIfExisting` in the installed Wrangler source). Without it, the command can report `10000` after the Worker is already gone; rerunning close resumes the remaining cleanup. The workflow's GitHub token needs deployments write. Worker secrets are initialized only when absent. Updates preserve the encryption key and setup code, so saved Provider credentials stay readable. Do not remove the encryption secret while retaining the preview database.

`tools/pr-preview.ts` derives a manifest from the PR number. Its stable identity is the repository plus PR number; head changes and branch renames retain the Instance. Closing deletes it; reopening creates a fresh one. No arbitrary Worker, database, bucket or Queue name is accepted. Inspect the plan without a Cloudflare login:

```sh
node tools/pr-preview.ts deploy 216 --plan
node tools/pr-preview.ts close 216 --plan
```

After building the web app, compile the generated config without remote mutations:

```sh
node tools/pr-preview.ts deploy 216 --dry-run
```

The workflow runs `--apply`. Wrangler 4.158.0 provisions the named D1, R2 and Queue resources during deploy, then the tool initializes missing secrets, applies migrations and provisions the demo owner through `/api/setup`. An existing owner is retained; this never resets a password. The setup session is signed out. This provisioning is separate from the owner-run deployment check. A first deploy can briefly answer errors before migrations finish. The GitHub deployment succeeds only after those operations finish and carries the Worker URL on the PR head SHA, for Impeccable Reviews. This is deployment evidence, not a deployed application check. Run the [owner's deployment check](deployment-check.md) separately; CI never runs it.

Cloudflare's [Workers Previews](https://developers.cloudflare.com/workers/previews/resources/) cannot consume Queues or receive Cron triggers, so these previews use separately named Workers. The config derives the shared runtime, asset, alias, limit and Cron settings from `wrangler.jsonc`; it copies no live bindings, routes or variables. Wrangler handles provisioning and deletion. Cloudflare refuses Worker deletion while it consumes a Queue (code `10064`, reproduced with Wrangler 4.158.0); cleanup lists Worker consumers and removes only the manifest Worker before deleting it ([Queues commands](https://developers.cloudflare.com/workers/wrangler/commands/queues/)). It has no populated-bucket empty command in 4.158.0 (`pnpm exec wrangler r2 bucket --help`), so `tools/preview-cloudflare.ts` uses the documented [R2 prefix-delete job](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/jobs/methods/create/) and polls its result before Wrangler deletes the bucket. It also uses exact-name inventory reads where Wrangler has no structured existence command.

A failed workflow stays red on the PR's Actions run. A deploy records a failed GitHub deployment status. Rerun the workflow to resume a partial deploy or close; cleanup skips absent resources and confirms that all manifest resources are gone. Deletion has no data rollback: a later deploy creates an empty preview. There is no scheduled sweep. If the close workflow cannot run, the preview remains until the close command is rerun with the same PR number and `--apply`. Closing marks the PR’s GitHub deployments inactive and retains their records as history; the resource URLs cease to work.

The configured close budgets total at most twenty-six minutes for the current sequence: six Wrangler calls at two minutes each, six inventory HTTP calls at thirty seconds each, and the ten-minute R2 job poll plus its in-flight requests. The workflow allows forty-five minutes including setup. A CLI timeout or API failure stops the sequence and leaves later resources for a rerun. No timeout triggers deletion beyond the printed manifest. The Worker is removed first so it cannot write new objects during bucket cleanup. There is no rollback or EXIT trap inside these operations.
