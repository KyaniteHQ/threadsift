# Testing

The project's testing policy. Read it before writing, changing or deleting a test. `docs/architecture.md` (Testing) says how the suite runs on both install targets.

## Verify through the real app

- A feature is proven end to end: the run reaches Threadsift the way the owner or an agent does (the UI, the HTTP API, MCP, the Extension, a Grok Bot callback) and checks what that caller sees.
- Every feature is proven on both install targets: the container image and the Worker under `wrangler dev`.
- An end-to-end scenario is medium or hard. It has at least two of: data that exists before the run, a failure or edge path (a timeout, a rejected input, a retry, a restart), more than one step or caller, and input of realistic size. A run that only shows the simplest input succeeds is a smoke test and proves nothing on its own.
- Each run leaves an artifact another person can repeat: the command, the captured result (report, response bodies, database state, screenshot) and the pass condition.

## No fakes and no recordings

- A test crosses every boundary its claim depends on for real: the real database, file store, queue, HTTP service and model. A vendor's own local runtime, such as `wrangler dev` with local D1, R2 and Queues, counts as real.
- No mocks, stubs, fake servers, recorded responses or replayed Digests. A third-party answer is reached by sending real input whose real answer is the behaviour under test, such as a made-up token the service refuses.
- When no real run can reach a contract, such as one that needs a signed-in account, the contract stays unproven: it is listed as unverified, and no fake stands in for it.
- Production code holds no test-only seam: no export, flag, hook or parameter that only tests use.

## What a test may be

- A test names the requirement it proves and the regression it would catch, and nothing else already catches that regression. A test that cannot name both is not written.
- A new test fails against the code before the change.
- Each contract has one owner test, at the strongest real boundary that reaches it. Add a case to the owner instead of writing a second test of the same contract.
- An end-to-end test keeps the values the spec or the ticket states (lengths, limits, counts) as literals in the e2e constants instead of importing them from `src/`, so it checks the app against the spec and not against itself. Interface labels may still come from `web/src/text.ts`.
- Not allowed: tests that pass by construction, tests that assert exact SQL, call order or log wording, tests with no assertion, tests that read source code to enforce a style rule (that is a lint rule), and tests written to raise a coverage number.
- Unit tests are written only when the owner asks for one; the end-to-end suite is the default.

## Live Cloudflare runs

A large test against live Cloudflare (a bulk import, a restore rehearsal, a load test) needs its cases, estimated rows written, cost and cleanup written in the pull request first; the building agent decides it (owner, 2026-11-04). Development and regression runs use `wrangler dev`. The Cloudflare-only checks (scrypt, Queue, Cron, the CPU of a fetch job, the HTML cap) run on a pull request's copy through `.github/workflows/copy-checks.yml`; `docs/architecture.md`, Pull request copies, Copy checks, says how, and `docs/agents/reviewing-code.md` when.

## Wait on state, not on time

- An end-to-end assertion waits on a state it can read, such as an element's text, a stored row or a job's status, with Playwright's retrying `expect`. It never sleeps for a fixed time to let something happen. A claim that something does not happen before a deadline, such as a card that holds while hovered, uses Playwright's `page.clock` first (`e2e/paste-card.spec.ts` fast-forwards the card's timer that way). Only when the mock clock cannot reach the timer, such as one in the server, does the test wait the deadline plus a margin once, then assert the state.
- An assertion about timing compares times the app stored, such as a job's attempt times or an Item's saved time. It may set a lower bound on elapsed real time, such as a request that waited for a 5 s deadline, because a slower run only lengthens it. It never sets an upper bound or an exact duration.
- A test never reads an element that closes itself, such as the paste card that closes after 6 s, at an instant it picked. It reads the state the element shows before it can close, or the state the app stored.
- An API answer is not proof that background work has finished. After a request returns, the test waits for the Item's status or the job's row.
- CI runs slower than a development machine and varies from run to run, so a wait that fits on one run fails on the next.
- A state that lasts only as long as a real deadline, such as a job `running` while a stalled fetch waits out its 8 s hop deadline, cannot be caught by polling through the instance script. Every Worker `sql` and `query` call starts a `wrangler d1 execute` process: three calls of `tools/e2e/worker.sh query <dir> 'select count(*) c from jobs'` took 0.75 to 0.76 s on an idle machine and 24 to 28 s with 8 busy shell loops sharing 2 CPUs (wrangler 4.156.0). Set the state up before the Paste instead: `afterFirstClaim` in `e2e/ingest.ts` installs a trigger that changes the job in the transaction of its claim, so nothing inside the window needs a helper call.
- A position, width or line-wrap read waits for `document.fonts.ready` first (`fontsLoaded` and `afterTwoFrames` in `e2e/look.ts`). The web fonts load after the first paint, and their swap moves rows: with every `.woff2` answer held back 1.5 s, a Shift+Tab walk down the list left the focused row under the list header at steps 4 and 9. The same wait comes before a test sets a scroll position: the list reveals its open row again after `document.fonts.ready` (`useAttention` in `web/src/ItemRow.tsx`), and with the answers held back 1.5 s a `scrollTop` set to the bottom of the list read 0 again 3 s later in 3 of 3 rounds, and 0 of 3 after `fontsLoaded`.

## Paste a live page

`livePasted` in `e2e/articles.ts` retries a paste of a live host whose stored content a spec asserts. `pasteLive` in the same file wraps it for a paste through the API; the two Project Gutenberg books (`WAR_AND_PEACE` and `COMPLETE_SHAKESPEARE` in `e2e/articles.ts`, `BOOK` in `e2e/search.ts`) use it. Other live pastes, such as the essay that `e2e/reader-content.spec.ts` sends with a Digest, are not covered yet. A scenario that must run around the paste, such as the reads made while the book is fetched, or a paste through the paste box, passes its whole attempt to `livePasted` and returns an Item whose `fetch` the API gave, because the rule needs the result of each attempt. `e2e/library.spec.ts` does that for each of its five live links that assert a fetched title. One rule applies to all of them:

- An attempt whose fetch result is `timeout` or `status` is repeated, up to `FETCH_ATTEMPTS` in `e2e/api.ts`. On a live host these are usually the host failing to answer a CI runner inside the deadline or answering with an error, but the result alone cannot rule out our code: `timeout` also comes from the page reader's own deadline (`PageReadTimeout` in `src/core/fetch-link.ts`). The attached results show when a pass needed a retry.
- `network` is not retried, because `requestHop` in `src/core/fetch-guard.ts` reports any exception it catches as `network`, our own included, so a retry could hide a regression.
- Every other result ends the loop at once, and the helper then requires `ok`, so a `network`, `unreadable`, `refused` or `no-title` result, or an `ok` with the wrong text, is a failure and never a retry. The spec's own assertions run once, on the last attempt.
- Each attempt's fetch result goes into the test report as `<name>-fetches.json`, and the failure message lists them, so a run that needed a retry shows it.

Gate runs that failed on a live host: `article-pages.spec.ts:86` on gutenberg.org got `status` (run 42376461414), `long-text.spec.ts:65` got `timeout` (run 42389020132), `search.spec.ts:81` stored empty post text (run 42375495369, first attempt; the job log and the artifact hold only `Received: 0`, because the spec did not read the Item's `fetch`), and `library.spec.ts:88` got `title: null` for `https://www.rfc-editor.org/rfc/rfc9110` (run 42407551583, `e2e-worker (1)`). The `search.spec.ts` case fits the rule when the cause was `timeout` or `status`, which the next report will show. If it ever shows `ok`, the Worker stored an empty text for a page that answered, which is an app defect and fails at once.

The `library.spec.ts` case most likely ended `timeout`: its fetch job ran 8,136 ms against the 8 s hop deadline (`HOP_DEADLINE_MS`) and logged no failure line; the artifacts do not record `Item.fetch`.

## Instance helpers

- The Worker `sql` and `query` calls retry `SQLITE_BUSY`, which includes `SQLITE_BUSY_SNAPSHOT`, up to 10 times (`d1_execute` in `tools/e2e/worker.sh`). `wrangler d1 execute --local` opens a second connection to the file that `wrangler dev` writes, and a busy timeout does not cure `SQLITE_BUSY_SNAPSHOT` ([SQLite result codes](https://www.sqlite.org/rescode.html#busy_snapshot)). The retry is safe because wrangler 4.156.0 sends the statements as one D1 batch, which Miniflare runs in one transaction, so a refused call changed nothing. With the app answering `GET /cdn-cgi/local/scheduled` in a loop, 10 of 60 `DELETE FROM scheduled_runs` calls failed before the retry and 0 of 60 after it.
- The main Instance starts with a generated `THREADSIFT_SECRET_KEY` (`new_secret_key` in `tools/e2e/common.sh`), so a spec can save a sealed setting on it, such as the GitHub token (`useSuiteGithubToken` in `e2e/github.ts`). A fresh Instance starts with no key unless the spec passes one, as `aiScreen` in `e2e/ai.ts` does, because the specs of the missing, malformed and changed key need that state. Every GitHub case sets the token it needs at its start, and a case that saves a made-up token restores the suite's token in a `finally`, so no case relies on the state another left.
- On the container target `sweepNow` restarts the app with `SIGTERM`, a graceful stop: the app waits up to `STOP_WAIT_MS` (9 s) for runs in flight to finish and write their result, so a restart adds no attempt to a job that finishes inside that wait. A run that outlives the wait, and a `crash()` of the Instance (`SIGKILL` through `tools/e2e/container.sh crash`, then a start), leave the claim `running`, and the takeover after the next start adds an attempt. A spec that proves the takeover calls `crash()` (`e2e/ingest-scenario.spec.ts`, the lost job); a spec that proves the graceful stop restarts and expects `attempts: 0` (`e2e/job-stop.spec.ts`). A spec with a real run to protect, such as a Digest, makes the job due and lets the app's job loop claim it within 5 s.
- A spec whose claim does not involve fetching seeds its Items with `storeReadyLinks` in `e2e/ingest.ts` and not with `postLink`. A Paste fetches the link from the real internet: once, an `example.com` request ended "The website didn’t answer in time" and left a row with a Try again button in the tab order of the Shift+Tab walk, and `curl` to `example.com` took 0.76 to 2.26 s from the development machine (three requests).
- With `THREADSIFT_ARTIFACTS` set, the run creates its artifact folder before the first Instance starts, stops each Instance, and then saves its whole log as `logs/<name>.log` in that folder, so a failed launch and the shutdown output are kept. The saved copy replaces a generated setup code with `[redacted]`; the Instance's own log stays whole for `e2e/setup-code.spec.ts`. `tools/check-ai-secrets.ts` scans the folder with the rest and fails on a `Setup code:` line in `logs/` that is not `[redacted]`.

## Run selected specs or a shard

Run one target at a time. Concurrent runs in one checkout share builds, reports, and Reddit request spacing. Separate checkouts have separate container image tags. Use the devenv tasks so dependencies and the target build are ready, and pass Playwright arguments through a JSON array:

```sh
direnv exec . devenv tasks run e2e:worker --show-output --input 'args=["e2e/article.spec.ts"]'
direnv exec . devenv tasks run e2e:container --show-output --input 'args=["--shard=1/3"]'
```

Omit `--input` for the whole suite. With one Playwright worker and no `fullyParallel`, [Playwright sharding](https://playwright.dev/docs/test-sharding) assigns whole files in file order by test count, not by time. A file in parallel mode is split per test.

To choose the count, download the shard reports from the gate run and sum each file's test durations. Assign the files in order under the test-count rule for two adjacent counts, then compare full job times, including setup, and choose the smaller count that puts both targets below 10 minutes. The gate currently uses 3 shards per target.

`e2e/reddit.ts` spaces Reddit requests within one shard. Shards run on separate runners, so their spacing is independent.

## Check the file store from a test

There is no test-only route. An `Instance` (`e2e/access.ts`) reads, writes and lists the files of its own target through the target's script, and `e2e/files.ts` holds the helpers that seed an Item and name its file:

- `instance.readFile(key)` returns the bytes, or `null` when the key is missing. The container runs `tools/e2e/read-container-file.ts` inside the container, which exits with 3 only for `ENOENT` or `ENOTDIR`, so a permission error, a folder at the key and other failures throw. The Worker runs `wrangler r2 object get threadsift-files/<key> --local --persist-to <state> --pipe`, and `null` means wrangler answered `The specified key does not exist` (wrangler 4.156.0), so any other failure still throws.
- `instance.writeFile(key, bytes)` seeds a file the same two ways, with `wrangler r2 object put ... --local --pipe` on the Worker. Neither checks the key, so a test can plant a file under a key the app refuses.
- `instance.listFiles(prefix)` lists `key`, `size` and `uploadedAt` of what is stored. The container runs `tools/e2e/list-container-files.ts` the same way and walks `/data/files` for regular files, so a symlink is not listed. The Worker runs `tools/e2e/list-worker-files.ts`, which opens the same state with `getPlatformProxy` (`persist: { path: "<state>/v3" }`, because `wrangler dev --persist-to` adds the `v3` folder; `remoteBindings: false`), pages the `FILES` binding's `list` and disposes the proxy in a `finally`.
- Seed rows through `instance.sql()` after the current migrations, and set `items.post_text_key` with `nameFile`. A test that needs a symlink or a permission runs `inContainer`, which is `podman exec` and exists only for the container.
- A proof of the cleanup (`e2e/file-cleanup.spec.ts`) runs on its own fresh Instance, because the cleanup deletes every file under `items/` that no Item names, and seeds the rows before the files: `storeJob` in `e2e/files.ts` inserts a `done` job or one `running` at an attempt with a claim that does not expire, and a file is named (`nameFile`) before it is written. The Worker's tick is `tickNow` (`e2e/ingest.ts`), which clears `scheduled_runs` and calls the scheduled endpoint. The container has no such call, because `sweepNow` restarts it and the restart gives every `running` job a new attempt, so a container proof polls until its own 60 s timer has run the tick (`TICK_WAIT_MS`). The page size is 100 keys and no setting changes it, so the container proof plants 101 files with `inContainer`; the Worker does not run that case.

`e2e/file-store.spec.ts` exercises each target's production adapter without HTTP: the folder adapter on a temporary folder, and the R2 adapter on the local R2 that `getPlatformProxy` opens in a temporary state folder. `e2e/post-text-file.spec.ts` proves the read through `GET /api/items/:id` on a fresh Instance.
