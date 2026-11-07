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

`e2e/file-store.spec.ts` exercises each target's production adapter without HTTP: the folder adapter on a temporary folder, and the R2 adapter on the local R2 that `getPlatformProxy` opens in a temporary state folder. `e2e/post-text-file.spec.ts` proves the read through `GET /api/items/:id` on a fresh Instance.
