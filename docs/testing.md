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

A large test against live Cloudflare (a bulk import, a restore rehearsal, a load test) needs its cases, estimated rows written, cost and cleanup written in the pull request first; the building agent decides it (owner, 2026-11-04). Development and regression runs use `wrangler dev`.

## Wait on state, not on time

- An end-to-end assertion waits on a state it can read, such as an element's text, a stored row or a job's status, with Playwright's retrying `expect`. It never sleeps for a fixed time to let something happen, and it never relies on how much real time has passed. The one exception is a claim that something does not happen before a deadline, such as a card that holds while hovered: that test waits the deadline plus a margin once, then asserts the state.
- An assertion about timing compares times the app stored, such as a job's attempt times or an Item's saved time, and never how long the run took.
- A test never reads an element that closes itself, such as the paste card that closes after 6 s, at an instant it picked. It reads the state the element shows before it can close, or the state the app stored.
- An API answer is not proof that background work has finished. After a request returns, the test waits for the Item's status or the job's row.
- CI runs slower than a development machine and varies from run to run, so a wait that fits on one run fails on the next.
