# Open items and unverified claims

This page lists what v1 does not fully build or has not proven by a real run. "Not verified" means the code handles the case as written and no real run reached it. An entry leaves when a run proves it, and the proof goes to the doc that owns the topic. A case that needs a vendor to answer on demand, a clock to pass or a failure to happen stays here with the run that would settle it, because [Testing](../testing.md) allows no fakes, stubs or test-only seams.

Contents:

- [Deploy and update on Cloudflare](#deploy-and-update-on-cloudflare)
- [Vault mirror](#vault-mirror)
- [Fetching links](#fetching-links)
- [Reddit account, fill and Extension](#reddit-account-fill-and-extension)
- [X reader](#x-reader)
- [Ingest pipeline on the Worker](#ingest-pipeline-on-the-worker)
- [Providers](#providers)
- [Grok Bot task runs](#grok-bot-task-runs)
- [Digests, Kept comments and races](#digests-kept-comments-and-races)
- [Access, HTTP and screens](#access-http-and-screens)
- [Export and Restore](#export-and-restore)
- [Threadsift bot, Share target and bot script](#threadsift-bot-share-target-and-bot-script)
- [Claims in other docs](#claims-in-other-docs)
- [Product](#product)

## Deploy and update on Cloudflare

The deploy button deployed `release` on Workers Paid (2026-11-19), and `pnpm run deploy` deployed `main` into a Workers Paid account (2026-11-18). [Cloudflare deploy button](cloudflare-deploy-button.md) has the details.

Not verified:

- Automatic [Worker rollback](ci-releases-and-rollback.md#rollback) on Cloudflare. A hosted run must restore the recorded version after a failed session check, confirm HTTP 200 and still fail the job. A run that applied a migration must skip recovery.
- Why the deploy button omitted workflow files from the private copy.
- A working preview build. The [self-hosting guide](../guides/self-hosting.md) turns off preview builds because the update pull request's preview failed.
- The update workflow when the copy's token lacks Contents, Workflows or Pull requests write access. Each refusal needs a token that lacks that one permission.
- `pnpm run deploy` into an empty Workers Paid account, and the setup page opening on that plan.
- That an invocation log of a callback request holds a URL without its query, and that the stored logs hold no bot error text. Read a log of a callback request, and the container proxy's access log.

## Vault mirror

Not verified on either install target: a real GitHub `Retry-After` answer followed by a wait and a completed drain. Imports of 600 Items and two probes of 450 impossible-head mutations drew no rate refusal, and sending more load to force one is not an option. The proof needs a naturally returned `Retry-After`, a queued note kept through that deadline, an early tick that makes no GitHub attempt and a later tick that publishes the note, on each target ([Vault mirror](vault-mirror.md)).

## Fetching links

### Reddit share links

- Not run by the gate: Reddit answered 403 to every share link request from the GitHub runner (2026-11-08), and 301 from the development machine. The cause is not confirmed, because the 403's body and headers were not logged.
- Not verified: a share link that redirects to another host, a burst in one Import, a share link whose post was removed, `/u/` share links, and whether one comment can carry both its old 7-character id and the 12-character id new links use. That fact decides whether the Extension's canonical address joins an Item made by an older share link.

### Short-link aliases and link titles

Not verified, because no stable public page or on-demand service produces the case, and the container's adapter reaches only globally reachable addresses, so no local redirect server can stand in for a short link host:

- A short link whose target moves or dies between two Pastes, and two simultaneous Pastes that resolve to different targets.
- The alias guard of the success batch (`holdsNoRival`) and the batch of two first saves that run together, which the single-process test database cannot overlap. The guard of the failure write is covered by a core test. The last proof of the success batch is a container run (2026-11-08).
- That a Paste that has read its alias and is still resolving shows nothing, because it writes nothing before its batch.
- A meta refresh that leads to the target's Item, to a private address, to Reddit or X, past the 20th redirect, or with a delay above 0.
- A `<title>` after the 512 KiB cap, a remote title that changes between two Pastes, and the `deflate` encoding on a page with a title.
- The paste box's notices for `unreadable` and `failed`.
- How many bytes a hop reads for a page that is not HTML. The paste outcome is the same either way.

Open: the name check is missing on the local Worker under `wrangler dev`. A name that resolves to loopback, such as `localtest.me`, passes the core check there, because the Worker adapter calls the global `fetch`, which has no hook between the lookup and the connection. Run a Paste of such a name to see whether workerd connects.

### Cloudflare's origin error on the Worker

Not verified: a deployed Worker that fetches a host that does not resolve. `workerFetch` turns Cloudflare's `530` with the body `error code: 1xxx` into a network failure ([Fetchers](fetchers.md)), but only Cloudflare sends that answer, and `wrangler dev` does not. The core test covers only the answers that pass through unchanged: a `530` with another body, a `503` or a `200` whose body is an error code, and a redirect.

### Article images, long post texts and Defuddle

- Article images: the failure reasons `timeout`, `refused`, `redirect-limit`, `unsupported` and `type-mismatch`, a base64 image over 2 MiB, a percent-escaped `data:` payload, a Reddit or X address as an image's first address, a `<base href>` page, an image host that stalls past the 120 s deadline, a storage failure during `put`, the media publication on a deployed D1, and the Restore of `media` rows.
- A fresh Paste of a text over 1,000,000 bytes on the Worker. It reads at most 900 KiB of HTML, so no page gives that much Markdown.
- File cleanup: that a delete by a runner whose finish was rejected removes its file, the cleanup over more keys than one page on the Worker, a delete that R2 refuses, and a cleanup that meets the temporary file of an overtaken writer that is still writing.
- Defuddle's memory on deployed Workers and its own share of the CPU.

### Fetcher plug-ins

- Not provable by design: a synchronous loop, memory growth, a timer and `process.exit()` in a plug-in are not stopped ([Fetchers](fetchers.md), Plug-ins).
- Not verified: a module whose top-level `await` never settles, a plug-in installed as a package with its own `node_modules` in the mount, and the deadline on a real hung network call inside a plug-in.

### GitHub

No run has read a repository from a deployed Worker, and no run from the development address can exhaust the budget other programs there share.

- Limits: the headers and message of a real primary or secondary limit, whether GitHub answers 403 or 429, a `retry-after` in HTTP-date form, the attempt count (two deferrals, then the `rate-limited` failure), the waits of a limit with no usable time, two limited answers that extend the cooldown at once, the 24-hour queue delay clamp, and recovery after a real limit.
- No test covers the cooldown check on a Paste, the deferral under a held claim, the screens, and Try again from the terminal `rate-limited` failure during a cooldown. A Paste of a GitHub link in a test would reach `api.github.com` as soon as the cooldown ends.
- The fetch: a `status` outcome for any answer but a 404, a README over `README_ANSWER_BYTES` (570 KiB to 1 MB would spend the shared budget), a README that is not Markdown, that `X-GitHub-Api-Version` takes effect, and that no other host receives the GitHub headers.
- The token: a CI run with the workflow's own `GITHUB_TOKEN` (limit 1,000 per repository), a working token that GitHub revoked after it was saved, that a redirect to another origin drops the token, the refusal of a repository marked `private` before the README request, and a rate-limited answer to a request that carried a token.

## Reddit account, fill and Extension

### Reddit account and fill

Not verified:

- A Worker deployed to Cloudflare. Only `wrangler dev --local` ran, so Reddit's answer to Cloudflare's addresses is unknown.
- A real logged-out `me.json` answer. Reddit answered 403 to an altered cookie and to no cookie. A 401, or a 200 without a `t2` name, marks the session as logged out at once, and neither was observed.
- How long Reddit keeps a session valid, the third attempt that falls through to the archive after two 429s, and a run of 100 links.
- The limits of the shared fill loop (`fillAnswers`): the 500 ms spacing, the stop at the first 429 or on a used-up window, the 8 MiB bound, the deadline, the abort signal and the per-request check that the account is still connected. Only live runs prove them.
- A thread the parser has not met: a `kind` other than `t1` and `more`, a field that is `false` where the parser expects a number, a statement parameter of 1,500,000 bytes, the number of statements and the batch size D1 accepts for a thread near 4 MiB, and a fetch job that is running while a thread is supplied.

### Extension in real browsers

Chrome 157 and Firefox 160 saved threads, ran a Fill and gained Reddit access against a container Instance (2026-11-19). [Extension and Threadsift bot](extension-and-threadsift-bot.md) holds the build details.

Not verified:

- A Fill whose permalink requests reach the 150 s deadline (`THREAD_READ_DEADLINE_MS`) in Chrome's worker or Firefox's event page, the Markdown and title the page fallback produces, and the total response size of a whole large thread. Chrome stops a worker when a single request runs longer than 5 minutes ([Chrome service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)).
- The browsers' own Reddit permission prompts on Turn on and Connect Reddit, and the physical toolbar click. The runs pressed keys through `xdotool` in Chrome and turned `extensions.webextOptionalPermissionPrompts` off in Firefox.
- Cancelling a Fill and framed Instance pages in Firefox. The `frameId` check on the relay port cannot be reached from a page.
- A signed Firefox update through the store.
- The Extension's `budget-spent` state in the gate. No test loads the built Extension, because its save code imports `wxt/browser`, which Node does not run. No live run checked how the Threadsift bot script handles a 429 from a real Instance (it maps `save:429` to `budget-spent`), and outside clients' handling of 429 and `Retry-After` is not checked.
- That a Reddit post page's `<title>` ends in the community name, which is why the Extension takes the title from Defuddle's Reddit extractor. Save a Reddit post page with the built Extension in Chromium and compare the stored title with `document.title`.

## X reader

### Grok CLI as the X fetcher

The Grok CLI (grok 1.0.77) read X links on the owner's container Instance (2026-11-15 to 2026-11-19), and the sign-in, signed-out and no-replies cases ran. Settings said Signed out about 18 hours after the last write of `auth.json` on 2026-11-16, and the cause is unconfirmed.

Not verified:

- That the preflight's tool list file is the list the real run uses. It is not a documented interface, and each real run is also checked after it ends.
- The refusal texts and exit codes for a rejected login, a usage limit and a declined answer.
- Whether renewal during an X fetch writes back through `GROK_AUTH_PATH`, and whether two grok processes that renew the same login at once both keep a working login.
- The process-group behaviour of grok on `SIGTERM`, whether a signed-in `grok -p` takes the daemon route (which names tools differently), xAI's remote settings, and whether session history syncs to code.grok.com.
- Whether the answer is verbatim and complete outside the browser comparisons, for quote posts, media and long-form articles, and a reply count above 500 or above the 6 reply searches the prompt allows (`MAX_REPLY_CALLS`).
- What a hostile post makes the model do with the backend `web_search` and `open_page` tools. The isolation rule allows them, because they cannot be removed without removing both X tools. `--max-turns` counts model turns, so the prompt's limit of 6 reply searches is a request and not a bound.
- That the model answers `found: false` only for a missing post (one of three runs on a public post did, 2026-11-13, so the fetch reads again up to 2 more times), and the fetch time of a post with many replies.
- Grok CLI as a Provider: every case that needs a Grok login, listed in [AI tasks and Providers](ai-tasks-and-providers.md) (CLI executor, Grok CLI).

Not buildable: a check of the stored texts against what the X tools returned. grok 1.0.77 records the model's answer and the tool calls with their input and never the results, in every output format and log (probe of 2026-11-13). The texts are checked against X's oEmbed answer instead.

### The check against X

Not verified ([Fetchers](fetchers.md), The check against X):

- That the stop at the first 429 holds against X's real 429. No committed test reaches it, because the core tests send no request to X.
- That an intake answer queues one `x_verify` job and that a slice that made progress leaves no wait reason.
- The CPU time of one slice on the Workers Free plan (10 ms), whether D1 and Queue calls count against its 50 subrequests, and a run of the verification job on the Cloudflare edge.
- A thread of the size `MAX_ROW_BYTES` allows on D1, the cut rule for a real post with two or more links before the cut, and the mark of X's cut for a character that counts more than one (emoji, CJK).
- Whether X's terms allow the oEmbed check, a limit of X's endpoint above the 150 sequential requests probed, a cut long post whose cut leaves no marker, the tail of a cut post (stored unverified), the part of a link address that X's display does not show, and whether a reply belongs to the thread beyond its id order.

### Which reader the Worker chose

Not verified: which reader the deployed Worker's rule chose for the bot's X link send (the task row does not show it or why), and the Worker's refusal of `grok-cli` beyond a `wrangler dev --local` run. The repository cannot build the Worker's ports for a test, so the helper `sendWithPublicOnlyAiAndNoXFetcher` copies the two values that matter (`xFetcher: null` and `ai.publicOnly: true`) into the Node app, and a change to the Worker's ports does not fail those two tests.

### Cause notes

An Item's `xNote` has 16 values (`X_READ_NOTES`). The container checks observed 5 on a real Item: `cli-signed-out`, `cli-failed`, `x-unconfirmed`, `bot-failed` and `x-post-absent`. `bot-not-set-up` and `cli-not-installed` need a container with no bot settings or with the CLI removed. The other nine need these conditions:

| Cause note | Live condition |
|---|---|
| `cli-not-proven` | A CLI version or tool surface that fails the proof, or a binary change during the check |
| `cli-usage-limit` | The CLI exits with an `error` answer whose message matches the usage-limit pattern |
| `cli-unreachable` | The CLI exits before the deadline with an `error` answer whose message matches the network pattern |
| `bot-key-unopened` | The explicit Grok Bot choice with an unavailable secrets store or a saved key the Instance cannot open |
| `bot-address-refused` | The explicit Grok Bot choice with a stored webhook address that now fails validation, which Settings blocks saving |
| `bot-timed-out` | The fetch gives up after its latest intake task stays unanswered or fails with a timeout (task deadline 60 minutes) |
| `bot-unavailable` | An accepted Grok Bot intake answer with `unavailable` |
| `x-answer-refused` | A decoded CLI thread that fails the Item's thread or storage rules, or a verified thread that fails the publish rules |
| `x-fewer-replies` | A verified reread that would store fewer replies, Author thread follow-ups included, than the Item already holds |

### Grok Bot as the X reader

Two X link sends ended `ready` with `fetch: ok` on the owner's container Instance (2026-11-18, 2026-11-19), and a real bot answered 11 of 12 sends on 2026-11-13.

Not verified:

- Whether the bot reliably reads the right replies, their parents, the Quote chain and the photo addresses. No recorded run since bot-v8 checked photo addresses from the bot's X tools.
- Whether the bot keeps the texts verbatim, leaves quote and media links out of the text, supplies a Digest that fits `DigestSchema`, and keeps Topic and Tag names in step with the Instance's lists.
- The time from Paste to a ready Item at volume and the bot's X read limits. The 30 calls a minute and 1,000 a day were checked for the archive search only.
- Whether the credential stays at the saved address on a redirect. No real Instance has answered the callback script with a redirect.
- A successful Worker claim at the deadline. Only the failure path ran under `wrangler dev --local`.
- The waiting texts for `grok-bot` and `topic-busy` were not reviewed in Impeccable.

## Ingest pipeline on the Worker

Not verified:

- That Cloudflare enforces `limits.cpu_ms` at 300,000. A passing run does not show it. Memory safety was not measured.
- The 2-minute fetch deadline for the built-in redirect chain. No public chain stays under 8 s per hop and runs past 2 minutes, so only the 8 s hop deadline ran.
- A duplicate message for a `done` job on the Worker, and the second retry delay of 2 minutes by waiting (only the stored next attempt time proves it).
- That a titled Item whose refresh times out keeps its title in `settle`. No real request makes a titled Item time out.
- That a hidden tab stops the per-Item reads. `pollItem` checks `document.hidden`, but headless Chromium reports `visible` for a background page.
- Two saves of one link at the same moment. Neither local runtime interleaves two requests between the lookup and the insert, so 20 simultaneous saves pass even without the conflict clause that deployed D1 needs.
- The tie-break of `GET /api/items` on `id` when two Items share a saved date, the focus that Try again leaves on the list, and the loading skeleton's height.

## Providers

- Anthropic, OpenAI and xAI: a successful Digest or Verify, the request each vendor accepts (headers, body, the structured-output format, OpenAI's strict JSON Schema with the Digest schema's limits), and the `declined` and `cut-off` classifications. Only the wrong-key refusal ran against the real vendors. One Verify per row with an owner's key settles a successful request. `declined` and `cut-off` stay unverified until a real run reaches each outcome, because Verify sends one benign sample.
- Workers AI binding: a Reddit thread's Kept comments, Verify through the binding, JSON Mode schema failures, capacity (`3040`), the daily allocation (`3036`), `3042`, `3007` and `3008`, timeouts and cancellation, and the deployed version metadata. Which JSON-mode models other than `@cf/meta/llama-3.3-70b-instruct-fp8-fast` return the Digest schema is unknown.
- `grok` with a real Digest prompt, lease expiry under a slow model, and Preact compat with the app's libraries.

### Claude Code executor (container, version 2.1.319)

Not verified:

- A usage-limit answer. No run can exhaust the owner's plan, so the mapping of `api_error_status` 429 to `provider-busy` is read from the shared table.
- The deadline expiry (only an abort through a closed Verify request and through Instance shutdown ran), the `SIGKILL` after the grace period, the output caps, and a stdin error or an abort while the child starts.
- `--safe-mode` with an admin-managed policy (the image has none).
- A login made with `claude auth login`. Only the environment token ran, so `/data/claude` as a login store surviving a recreated container rests on the CLI's own documentation ([authentication](https://code.claude.com/docs/en/authentication#credential-management)).
- `CLAUDE_CODE_DISABLE_ATTACHMENTS` changing a Digest, and Claude Code versions other than 2.1.319.

### Codex executor (container, codex-cli 0.167.0)

Not verified:

- The failure messages that map to `provider-busy` (`hit your usage limit`, `at capacity`, `exceeded retry limit`) and to `declined` (`content_filter`). They come from strings in the binary, and no run can exhaust the owner's plan or trigger a filter.
- The deadline expiry, the `SIGKILL` after the grace period, the output caps, and a stdin error or an abort while the child starts, for the reasons given for Claude Code.
- The start-up catalog limits (30 s, 8 MiB) and an unparsable catalog, aborting a task that waits for a slot, stopping both runners at once, and a listed model other than the default.
- The check-to-`exec` window and the cloud-managed requirements layer ([AI tasks and Providers](ai-tasks-and-providers.md), CLI executor (Codex)), a `/etc/codex/managed_config.toml` in the automatic suite, and a start-up race that creates `skills` or `AGENTS.md` between the inspection and the creation.
- A login made with `codex login --device-auth`. The proof wrote `auth.json` into `/data/codex` from a file, so the login store surviving a recreated container is shown for a file the CLI reads and not for one it wrote. A revoked login and versions other than 0.167.0 are unverified too.
- A version that changes the catalog or prompt shapes makes the start-up load fail or the check answer `unreachable`, and a change in any field the loose schemas let through goes unnoticed.
- OpenAI allows ChatGPT-account sign-in on trusted private infrastructure only ([AI tasks and Providers](ai-tasks-and-providers.md), CLI executor (Codex)). Whether a hosted Threadsift qualifies is not decided.

### OpenRouter Connect

Not verified, because no real run can make OpenRouter or the Instance behave so. The mapping is read from code:

- An expired or already used code, a slow or redirecting exchange endpoint, an oversized answer and a 200 answer that is not a key.
- A crash after OpenRouter made the key and before the save, and a guarded write that commits while its answer says it did not.
- An error while preparing the settings row after the exchange, and a Connect that completes while the saved key cannot be opened.
- A malformed `THREADSIFT_PUBLIC_ORIGIN` on the Worker, a TLS-terminating proxy that rewrites `Host`, and a password reset that ends the owner's sessions before the callback.
- The `activation-pending` path after the 45 second bound runs out. OpenRouter did not stay inactive that long in any run, and the bound has no setting.

The container wake after a successful Connect is also unverified. The code opens Digest jobs and wakes the loop after the key becomes active. No end-to-end Connect run measured that wake.

## Grok Bot task runs

On the owner's container Instance, all six Provider task kinds (`digest`, `topic_overview`, `related_pick`, `proposals`, `topic_proposals`, `disagreement_proposals`) ended `done` with no refusal (2026-11-18, 2026-11-19), and the X link read stored 46 of a post's 351 replies. One Grok Bot answers one Instance.

Not verified:

- Whether two sends for one task wake two bot runs. The lifecycle assumes at-least-once delivery and accepts the first valid answer.
- The bot's concurrency, run length and token use per task ([AI tasks and Providers](ai-tasks-and-providers.md), Grok Bot), whether it can cancel a run (after the deadline included), and its webhook body size limit.
- Settings Verify through the result route against a real bot. Its 60-second wait (`VERIFY_WAIT_MS`), the in-flight cap of 10 (`GROK_BOT_IN_FLIGHT`) and the 1-hour deadline are choices without measurements.
- The Queue wake after a result on the Worker.
- A Worker reaching a private address through a public name, a saved address in the Instance's own zone, an unsupported port and an IP literal on a deployed Worker.
- Whether the bot needed to repair and retry after `invalid`, which schema dialects beyond JSON Schema 2020-12 it accepts, the quality of its Digests, overviews and Proposals, and its time per kind.
- Whether a routine can read the saved agent token and use it to call Threadsift through the script. This is inferred.
- Retry accounting against a send the bot accepts. It ran offline with refused sends. The three weekly kinds write no `run.event` report when the bot answers with an error, and the route logs `grok-bot-error`.

## Digests, Kept comments and races

- Task owners: the atomicity of the claim check and the task insert. A revocation between a check and the insert needs a write between the two statements, and the attempt makes none. No trigger can order it, because SQLite fires triggers on writes and a BEFORE INSERT trigger on `ai_tasks` fires after the insert's own WHERE ran. The atomicity rests on the task being one statement. The Worker cannot count Provider requests, because it refuses private and plain HTTP addresses, so its proof of no call is the absence of an `ai_tasks` row.
- Kept comments: a real model answer with an id the prompt did not carry (the drop in `submittedAmong`) or one that repeats an id, forced malformed output, an empty model selection that replaces a non-empty one, a non-empty selection through Claude Code, a provider whose completion limit is under the allowance, and a stale result that lands between the candidate read and the publish. A caller Digest exercises the caller rule and not the drop.
- Automatic Digests: a real result becoming stale during an overlapping refresh, its discard and requeue at the same attempt count, and a mutation that removes that guard. The local Queue serializes consumers, and a live model gives a run no way to order the stale path without a fake or a sleep.
- The one hop: Reddit's own `.json` for a link post (`curl` answered 403 from the development host, 2026-11-11, and the Extension's request needs the owner's signed-in browser), an AI timeout after a hop that retries and fetches the page again, a refresh or caller Digest that lands between the hop and the model call, the hop on a deployed Worker, and a real GitHub limit.
- The empty-input Digest guard (`emptyInput`) through the app. No run places a commit between the job's read and its finishing batch, because a trigger inside the batch rolls back with it.
- A write that lands between the read and the guarded batch of one request is proven only where a test holds the lock (`lockedWriter`, a second process that holds the database file's write lock). Two cases run that way: Accept of a disagreement when a Digest changes after the read, and Accept of an overview-gap row when a run is queued after the read. These stay unproven:
  - Accept of a Topic merge. `acceptMerge` writes before it reads, and the guard of the unit batch (`continueMerges`, reached by `sweep` and not by a route) has no entry that places a write inside it. Revision contention on a merge unit needs 50 repeated interferences.
  - A Provider that returns between the refused batch of an overview-gap Accept and its recheck. The recheck is a read, and no lock stops a read.
  - The Paste of an X thread with fewer replies than a thread that another Paste saves after its check.

## Access, HTTP and screens

- Open: the login throttle is global. Ten wrong passwords lock sign-in for 60 seconds, doubling to 1 hour, for the owner too, because the app has no client address it can trust behind a proxy or a Cloudflare route. A stranger who reaches the login can keep the owner out of the sign-in screen, while open sessions and agent tokens keep working. A per-address count would need a trusted forwarded-for header, which neither target guarantees ([Access](access-owner-login-agent-tokens-mcp.md), Throttle).
- A request body well over 64 MiB on the container, or one that crosses a proxy. The 413 carries `Connection: close`, and RFC 9112 section 9.6 warns the client can get a reset before it reads the answer while it is still sending. Only bodies of exactly 64 MiB and of 64 MiB plus one byte on loopback ran, and each client received the 413.
- Two setups at the same moment. Neither local runtime interleaves two requests between the owner check and the insert, so the `ON CONFLICT DO NOTHING` on the `owner` row is what keeps one owner, and deployed D1 can interleave them.
- The CPU milliseconds of a password change on a deployed Worker (two scrypt runs in one request). It answered 204 in 1.6 s of wall time with no CPU-limit error.
- Not run by the gate: a late `signed-out` answer to a session check does not close the library after the owner signs in, and a failed Revoke keeps its question open with its alert. Both need a response that Playwright holds until a later action finishes, and no smoke file holds a response.
- The look settings: a `localStorage` that refuses access with a `SecurityError`, and `100dvh` on a real phone (Playwright's mobile emulation draws no browser toolbar, so it cannot tell `dvh` from `vh`).
- The disagreement Pin ([Proposals](../proposals.md)): that its text is the agent's own reason sentence and cites no Item text beyond what the agent wrote. To check on a real Instance, select `from_name` from `pins` where `kind = 'items-disagree'` and compare it with the Summaries and titles of the two pinned Items.
- The Related Item pick ([Wiki](../wiki.md)): that joining the candidate terms with AND would match almost nothing, which is the reason for OR. Run the related-candidates query joined with AND over a seeded library and compare the counts with the OR query.

## Export and Restore

### Export

- On a deployed Worker: a slice at the 8 MiB budget (the largest slice run was 3.9 MB), so the CRC-32 time over 8 MiB, the memory of a slice under the 128 MB isolate limit and the subrequest count of a slice are open. The Workers invocation metric counts `fetch` calls and not D1 or R2 binding calls, and Workers observability reports no memory figure.
- A browser saving a zip of several GiB from `GET /api/export/{id}/download`, the Worker download of a multi-gigabyte zip, a client that disconnects early on the deployed Worker, and a ZIP64 zip made by the whole export chain and not by the zip writer alone.
- The download limit on the Worker, from the Workers limits and not measured: it reads 2 objects per slice and the tail, each a subrequest of the one invocation that streams the zip, so 10,000 subrequests (Workers Paid) end a download at 4,998 slices ([Export, backup and restore](export-backup-and-restore.md) has the recount). The Cloudflare target does not support the Free plan. The largest download run on a Worker is 6.1 MB in 4 slices.
- About 440 D1 statements for a 40-Item slice against the 1,000 queries of one invocation, up to 21 R2 reads for each Item, and the memory of a slice. Joining a slice's `dir` object into its `part` object would halve the reads. It is not built, because the planned library (4,000 Items) needs about 200 to 8,000 reads, under the 10,000 of Workers Paid.

### Restore

Not verified:

- The units of a zip of tens of GB or of millions of entries on a deployed Worker (each unit reads the central directory, so each one gets slower), the R2 reads of one unit, and the D1 query count of the busiest unit against the 1,000 queries of one invocation. Only per-minute counts exist, with at most 395 read and 571 write queries in the busiest minute of a Worker Restore.
- The memory of a `files` or `search` unit under the 128 MB limit. The bounds are arithmetic, and `wrangler dev --local` enforces no limit. `RESTORE_ANCHOR_BYTES` (256 KiB) was measured in Node under `--max-old-space-size=128`, not on workerd.
- The cost of reading a slice's part on R2. A slice reads its part as a stream from the start and skips to its window, because the file store has no byte range, so a slice reads on average half a part of 32 MiB for 1.5 MB of records.
- A browser uploading a zip of several GiB in 32 MiB parts, a slow link, a failed part, and a part of 32 MiB on a Worker.
- The request body limit of the owner's reverse proxy or tunnel, and an upload above 1 GB through one. No run crossed a proxy.
- A zip over 4 GiB (the ZIP64 path of the zip reader), and a zip written by another release.
- A comparison of 20 searches and 50 Items with the source. The live proof compared 51 Item documents and 6 images, and no search.
- A real D1 row near the 2,000,000-byte limit of a bound string ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)). `RESTORE_BIND_BYTES` keeps a window at 1.9 MB.
- How the owner finishes the Items that had an open job in an Export taken during an Import, because nothing resumes their work after a Restore.

The Restore checks only the CRC-32 and local header name of the Item note, image and post text entries, not their content.

A cancel after a Restore that wrote `reddit_settings` empties it, which reads as the default, because the Instance's earlier value is not stored. A cancel leaves `log_start`, so the Log keeps the date the restored library began.

## Threadsift bot, Share target and bot script

- No core test exercises the `failed` answer when `mark` cannot read random bytes. On 2026-11-21, a local run of `unshare -rm sh -c 'mount --bind /dev/null /dev/urandom && bash bot/scripts/threadsift.sh mark'` printed `failed` and `no random bytes` and exited with status 2. The `check` job leaves the setup action’s `unprivileged-userns` input at its default of `false`.
- Not run for the Threadsift bot: an off-topic request (a coding task, a reply on X, a general chat) to a freshly imported bot, which would show whether the short profile keeps the boundary when the skill is not loaded. The bookmark sync routine and the import of all bookmarks on the live bot are unproven live by the owner's choice (2026-11-15). The bookmark folder tools have never been called, so folders are not imported.
- The bot script's checks of an answer that a real Instance never sends: `failed` for a save whose 200 or 201 body has an `item.id` that is not an integer or a `url` that is not `/items/<item.id>`, and `failed` for a batch answer with fewer results than ids sent. A listener that answers by itself is a fake.
- The Grok Bot shell tool ([the bot README](../../bot/README.md)): why a `threadsift.sh write` call is limited to 3,000 characters. The smallest size that failed was about 20,000 characters (it arrived with no command twice) and about 1,000 worked, so the size is not a measured maximum. Send heredoc calls of 1,000, 3,000, 10,000 and 20,000 characters from a Grok Bot chat and compare `wc -c` of each stored file with the text sent.
- The Share target: Android WebAPK installation, Threadsift in Android's share chooser, cold and warm share launches, the headers Android Chrome sends, and the session cookie inside the installed app. Each needs a real Android device or emulator. Chromium source says an Android `POST` share attributes the navigation to the app's origin, so the expected request is a `POST` with `Sec-Fetch-Site: same-origin` and the app's `Origin`. No wire capture shows it. If the installed app sent other metadata, the share would still open the library with the link in the paste box.

## Claims in other docs

Each entry names the doc that makes the claim and how to check it.

- [Jobs, leases and the schedule](jobs-leases-and-the-schedule.md):
  - An Item with post text and neither a Digest nor the failure marker gets a Digest job from the sweep. With Grok Bot chosen as the Provider, seed one that is not failed and has no open Digest job in a scratch database, run `sweepDigests` and count the Digest jobs.
  - A reopened caller job has no failure that repeats for the same content. Corrupt `pending_digest` in a scratch database so `attemptCaller` throws, run the job through exhaustion and count the Digest jobs `closeJob` reopens over several sweeps.
  - A second overview task for one Topic is refused as stale after the first stored the page. Start two Grok Bot overview jobs for one Topic with the deferral check off and read the second task's refusal.
- [Lint and format](lint-and-format.md): VoiceOver in Safari drops list semantics from a list with `list-style: none` unless the element carries the role. Open a page with `<ul style="list-style:none">` in Safari with VoiceOver on and check whether it announces a list.
- [Testing](testing.md): the image prune removes labelled images that no tag points to and no container uses, and never an image that carries a tag, even when two tags share an image ID. An image a container still used at a build stays untagged until a later build runs the same prune.
  - First check: build two images from a one-line Containerfile with `--label io.threadsift.smoke=true`, give the second a second tag with `podman tag`, remove the first one's tag with `podman untag`, run `podman image prune --force --filter label=io.threadsift.smoke=true`, and compare `podman images -a` before and after. The untagged image goes and the image with two tags stays.
  - Second check: start a container from the old image, rebuild the same tag, run the prune of `container:build` and look for the untagged image in `podman images -a`.
- [CI, releases and rollback](ci-releases-and-rollback.md): Nix retries a throttled download 5 times before the job fails, and a retry wrapper on the same address would only hide the throttle. Run the gate cold on a pull request with the cache deleted, with and without a retry wrapper, and compare the 429 counts, or read the `download-attempts` default in `nix.conf`.
- [Fetchers](fetchers.md): every primary limit GitHub documents is per hour, which is why `MAX_COOLDOWN_MS` is one hour (list each primary limit's period in the REST API rate limits docs). A socket cannot outlive the invocation on the Worker, which is why it opens one connection for each request with `Connection: close` (under `wrangler dev`, keep a module-level `connect()` socket across two requests and see whether the second request still works).

## Product

The spec's open items stay open: a read of X's developer terms before the hosted product stores X content, and hosted pricing and whether it includes AI ([the spec](../spec.md), Later).
