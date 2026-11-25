# Testing

Read this page before you write, change or delete a test. It overrides broader testing instructions. [Testing architecture](architecture/testing.md) says how the suites are built.

## Policy

- Tests run the real code on a real database and real runtimes. Use no mocks, stubs, fakes, replayed network exchanges or test-only seams in place of production behaviour. Tests may capture warnings, wrap the real queue method to observe its arguments, control the clock or pass a captured response body to a parser. A vendor's own local runtime (`wrangler dev` with local D1, R2 and Queues, Podman, Chromium) counts as real.
- Prove a change by running the real program the way its caller does, and keep the command and its output as the artifact.
- Prove a bug fix with one reproduction that fails before the fix and passes after it.
- Fix the cause of a flaky run in the test, because a retry or a sleep hides it.

## Commands

| Command | What it runs |
|---|---|
| `pnpm test` | The core tests, in shards. The `check` job and the pre-push hook run them too. |
| `pnpm test N` | The core tests in `N` shards. When shard `i/N` fails, run this with the same files to reproduce its layout; `pnpm test 1` checks that all files can share one process. |
| `node --test test/<file>` | One test file. |
| `devenv tasks run ci:gate` | The gate without the browser smoke. The CI `check` job runs the same tasks and removes the files on the docs-only skip list after `ci:check` ([CI, releases and rollback](architecture/ci-releases-and-rollback.md#gate)). `devenv test` is not the gate, because it starts the dev `processes`. |
| `devenv tasks run smoke:worker`, `devenv tasks run smoke:container` | The browser smoke on each install target. |
| `devenv tasks run image:build` | Builds the image that the start check runs, tagged `localhost/threadsift:publish` (one tag for every checkout). |
| `tools/start-check.sh <image>` | The start check. |
| `devenv tasks run live:worker`, `devenv tasks run live:container` | The live check, by hand before a release. |

## Core tests

A core test that needs the app can call it in process through `app.request`. On the first ordinary Instance in a process, the test helper builds the database with the real migrations, creates the owner through the setup route and signs out before taking the snapshot. An ordinary test Instance copies that database. Its `setUp` signs in by writing a new session through `prepareSession` and `sessionWrites`, without hashing a password. Tests of first-run state start with an empty migrated database.

The X Settings tests run in Node. They build the app with the Worker's public-only AI setting and no X fetcher to check which readers the owner can choose, how a saved grok CLI choice reads back and which writes the route accepts.

Each file states the requirement it proves. Files in a shard share one process, so each file closes its resources, restores process globals and keeps its own mutable fixtures.

A core test reaches no host on the internet, with two exceptions:

- A test that stores an X thread through an intake answer lets the `x_verify` job ask X's public oEmbed endpoint (`publish.x.com`) for the post.
- The fetcher plug-in test looks up `www.reddit.com`.

Every other host a core test requests is reserved (`.test`, `.invalid`), the machine's own, or a refused local port (a test that saves a Provider points it at `http://127.0.0.1:9`). Test data can name `t.co`, `x.com`, `www.reddit.com` and `example.com` in a link it saves or resolves, and no test needs an answer from them, because the save route takes the page from the caller. The Grok Bot script tests use `python3` and `curl` against the real app on loopback, and the zip listing test runs `python3`. Each bot script test setup also serves a closed Instance so the failure cases receive a real server error. The bot release check also needs Bash, Git and `sha256sum` to verify the tagged release and its checksums. No core test reaches a working Provider. The suite passes with only the loopback interface up (`unshare -rn`).

**The machine's own host name.** Two tests, through `ownPrivateHostName`, need the machine's own host name to resolve only to private addresses, as it does on a GitHub runner and on a host whose `/etc/hosts` maps the name to a loopback address. Where the name resolves to a public address they fail, and so do `pnpm test`, the pre-push hook and the `check` job, until an `/etc/hosts` line maps the name to `127.0.0.1`.

**Where a test calls code directly.** Use the route when the caller can supply the input and observe the result there. Call production code directly when the test needs control over one of these boundaries.

- **Literal input.** Parsers, result schemas and selection rules take values. Give them exact inputs to check limits, ordering and refusals independently of a request. The X thread cases cover numeric ID ties, millisecond timestamps, eligible reply bodies, post fields and scores, the first nonblank title line, word boundaries and surrogate pairs. The Proposal cases check pair direction, disjoint subjects and input budgets. Literal oEmbed answers and verification verdicts cover responses a live service cannot reliably supply. The post text placement cases give `placePostText` a text over 1,000,000 bytes and set the Item's `post_text_key` themselves, because only a fetched page can exceed the limit and no local host can serve one (the Node network refuses private hosts). Every Export and Restore library places its long post texts the same way. The GitHub token tests open the stored seal and make a foreign one with `sealedSecrets`, because no route returns the seal. The web app's list state and filters take literal Items and counts, and the Extension's `fitThreadBody`, `instanceOrigin` and `hostPattern` take literal answers and addresses. The zip reader and writer cases give `readDirectory` and `packFiles` a count past 16 bits and an offset past 32 bits, which a real Export in a test cannot reach, and a source that holds only the bytes at those offsets. The Export tests that inspect a zip read it with the Restore reader (`readDirectory`, `entryBytes`). The Restore upload tests send the bytes of a real Export. The Restore refusal tests build the changed zips with `packFiles`, `endOfArchive` and byte patches at named offsets, because the owner's Export never holds one field wrong. The stale share-link alias tests give `saveResolution` a literal resolution, a Reddit post or comment address, and the alias the Paste read, because no local host can answer for a short link host.
- **Adapters the routes do not reach.** The Node adapters and the Worker's fetch need their own input: an unread request body, a mounted folder, an answer with a given status. Each test starts the real adapter on a loopback server, a temporary folder or a migrated database, and reads what it leaves there. The Vault Folder test claims a real lease with `claimVaultLease`, passes `currentVaultLease` as the lease check and fences it with `fenceVault`. The Worker fetch test runs `workerFetch` on Node's `fetch`, not on workerd, so it does not check how workerd follows a redirect or passes a 530 through. The custom lint rules, the bindings update tool, the shard reporter, the doc reference check, the doc impact check and the core layout check run as real child processes on temporary files; the last three run on a temporary git repository that holds a copy of the tools.
- **External calls.** Use the real database to exercise the failed-short-link budget, the promotion of a failed short-link Item and the Restore hold without a failing short-link service. Test a loaded plug-in's host rule directly when Paste refuses the link before the plug-in sees it. The Reddit queue tests claim a job and take its turn because executing the job would contact Reddit. They apply Reddit answers to the saved session and close the turn directly to observe which job the close wakes.
- **Intermediate states and races.** Stage the competing writes on a real database when a request hides their order. The Pin and merge tests insert a change between the read and its guarded write. The bot tests distinguish a missing task from a sent task before its deadline, and check an answered task after its deadline and a lost claim. A result request after the deadline gets 409 before any write, so the test stages the answer and deadline in that order. The X refusal tests prepare the real deferral, post the refusals or move the stored deadline, then apply the prepared outcome. The Export and Restore tests move `updated_at`, `finished_at` and `next_attempt_at` on the real rows to reach the 12-minute and 24-hour sweeps and the retries. They fail a unit by placing a file where the file store needs the folder `items/`, and they add a newer row to `d1_migrations` before a Resume, after setting the Restore's phase to `tables` or `finish` to reach the release check of that phase. The part upload test wraps the real file `put` and, after the write and before the guarded update, sets the Restore's state to `cancelled` on the real row. A Cancel request would delete the part itself and hide the delete the late part needs. The stale share-link alias tests wrap the real `db.batch` and, when the second call starts, hold the library with a running Restore on the real row, and in one case move the alias row in the same step, so the Restore lands between a keep Paste's two write attempts or before a refreshing Paste of a failed short link writes. Each of them checks that the Paste answers `restoring` and leaves the Item, and the alias the test did not move, as they were. The same wrap deletes a failed Item through the owner's route before the refresh writes, and that Paste answers a lost race, so the next Paste saves a new Item.

Tests can advance the clock for a deadline, the Daily budget's UTC day boundary, a polling interval or the end of a Vault mirror park, and fix it to place a timestamp exactly on a cutoff, such as the 24 hours of a Restore's parts or of a ready Export, and 1 ms past it, the resolution of `Date.now` and of the stored integer. The Bot script tests age files 30 seconds either side of a cutoff, because the script cuts by `find -mmin` and cannot run under the test's clock. With GNU find 4.11.0, `-mmin +N` matches a file older than N minutes and `-mmin -N` a file younger than N minutes. A cutoff one minute lower or higher therefore changes the result for both fixtures. The limit is the delay between the aging and the script's own `find`, which must stay under 30 seconds. Restore process globals after each case. The Vault Folder test of an unwritable folder skips itself when the process runs as root, so a root run leaves the `folder-permission` answer unverified.

**What a test observes.** The Export and Restore tests capture `console.error` to read the attempt number of each failed unit. The X refusal, bot task route, task credential and one-hop tests capture `console.warn`. The task credential test reads the failed-send warning to check that the bot token and host stay out of the log. The refusal response can carry more detail than the log. Only the emitted warning shows which identifiers and issue codes were logged, whether the text was bounded and whether a private query leaked. A Digest row can reach the same state with or without a hop, so the one-hop tests observe the hop events. The part upload test reads the call count of the wrapped `put`. The unread body test reads `bytesRead` of the server's socket, less the request head, when the 413 is ready, because the client's `finish` event fires when the bytes reach the kernel, not when the server holds them. The X refusal race wraps the real `enqueue` to read its delay. The stored due time can be correct even if that argument is wrong, because the Node queue wakes the loop without reading the delay.

**The Grok Bot webhook.** The answer of the bot's webhook is unproven offline: the settings route accepts only a public https address and the Node network refuses a private host, so no listener a test starts can answer as the bot. A test that needs a sent task runs the real send, which fails, and marks the task accepted with `acceptedByBot`. [AI tasks and Providers](architecture/ai-tasks-and-providers.md), The send and the states, owns the status mapping.

No core test exercises the `failed` answer of the bot script's `mark` command. A local run on 2026-11-21 exercised it with an empty random-byte source. [Open items and unverified claims](architecture/open-items-and-unverified-claims.md#threadsift-bot-share-target-and-bot-script) gives the command and result.

## Browser smoke

The full pull request gate runs the browser smoke on both install targets. A docs-only gate skips it. Each checkout builds and runs its own image, `localhost/threadsift:smoke-<slot>`, on its own port, so two worktrees can run it at once ([Testing architecture](architecture/testing.md), Smoke).

## Start check

The start check runs an image with a fresh volume and asks `GET /api/session` until it answers 200, for at most 60 s after the container starts. To run it by hand, build the image with `devenv tasks run image:build`, then run the start check on `localhost/threadsift:publish`. [CI, releases and rollback](architecture/ci-releases-and-rollback.md), Start check and Image, says when CI runs it and how to run it without a push.

## Live check

The live check reaches the internet when you run it by hand before a release, and it blocks neither a pull request nor the deploy. The Worker run calls no model, because its Pastes carry a caller-sent Digest. On the container it calls a real model through the Provider "Claude Code on this server", and `live:container` fails at once without `CLAUDE_CODE_OAUTH_TOKEN` ([CI, releases and rollback](architecture/ci-releases-and-rollback.md), Live check).

## Live deployment guard

Only the `deploy` job of the gate workflow targets `--env live`. A machine signed in to Wrangler reaches the live account, and `CI=true` skips Wrangler's confirmation prompt, so a local check uses `--local`.
