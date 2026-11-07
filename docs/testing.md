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
- A position, width or line-wrap read waits for `document.fonts.ready` first (`fontsLoaded` and `afterTwoFrames` in `e2e/look.ts`). The web fonts load after the first paint, and their swap moves rows: with every `.woff2` answer held back 1.5 s, a Shift+Tab walk down the list left the focused row under the list header at steps 4 and 9.

## Instance helpers

- The Worker `sql` and `query` calls retry `SQLITE_BUSY`, which includes `SQLITE_BUSY_SNAPSHOT`, up to 10 times (`d1_execute` in `tools/e2e/worker.sh`). `wrangler d1 execute --local` opens a second connection to the file that `wrangler dev` writes, and a busy timeout does not cure `SQLITE_BUSY_SNAPSHOT` ([SQLite result codes](https://www.sqlite.org/rescode.html#busy_snapshot)). The retry is safe because wrangler 4.156.0 sends the statements as one D1 batch, which Miniflare runs in one transaction, so a refused call changed nothing. With the app answering `GET /cdn-cgi/local/scheduled` in a loop, 10 of 60 `DELETE FROM scheduled_runs` calls failed before the retry and 0 of 60 after it.
- On the container target `sweepNow` restarts the app. A restart kills a run in flight, and the takeover after the restart adds an attempt to the job. A spec with a real run to protect, such as a Digest, makes the job due and lets the app's job loop claim it within 5 s.
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
