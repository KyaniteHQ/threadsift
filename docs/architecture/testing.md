# Testing

[Testing](../testing.md) explains how tests use the real app and when they can observe a diagnostic or a queue call.

## Core tests

`pnpm test` runs the core tests in shards: one Node process per available CPU, capped at the number of test files. Files in a shard share a process, so they pay the app import cost once.

On 2026-11-21, on the owner's 16-core machine with Node 26, `pnpm test` passed 993 tests in 140 files. Two default runs took 31.1 s and 28.8 s wall time. One run of `taskset -c 0-3 pnpm test` took 59.8 s. With all files in one process, `pnpm test 1` passed the same 993 tests in 237 s wall time. The runs computed 29 password hashes at 16 shards and 17 at four. Each shard hashes the template owner's password once. The remaining hashes come from tests that set up an owner on an empty Instance, sign in or change the password.

- Core tests reach no working Provider and no external host except the two that [Testing](../testing.md) names. The save route takes the page and the Digest from the caller, and an X link stores a Link-only Item without a fetch.
- The signed-out check requests every route in the served API document except the public routes and the three task callback routes. It also sends six requests with other paths or methods beside the callbacks. Each request must receive a 401 with a Bearer challenge.
- The Reddit archive setting tests check who may change the setting and whether the owner can read it back. They do not run an archive fill.
- Real fetcher plug-in modules sit in a folder beside the tests, and the tests load them through the production loader.
- The fetcher deadline test aborts `pluginPage` after all three fixture fetches start, because the job's own deadline is the fetch deadline ([Jobs, leases and the schedule](jobs-leases-and-the-schedule.md)).
- The Reddit-with-a-thread rule is not in the core tests, because the built-in route it falls back to requests reddit.com.

## Smoke

The smoke spec drives Chromium through the main flows of the app on both install targets. Its `test.step` calls, and those of the flow modules it imports, name every step.

- **Export.** The core Restore tests download an Export and upload its bytes to another Instance. The browser smoke also opens the downloaded zip and checks the Item IDs in the files named by its manifest.
- **Headers and policy.** The run fails when the document at `/` or `/log` differs from a header of `DOCUMENT_HEADERS`, or when a page reports a `securitypolicyviolation` event. Each watched context ends with a script that the policy blocks on purpose, and the run fails when that violation does not arrive. This shows the collector works and that every earlier report has arrived.
- **Targets.** The Playwright configuration starts the target that `THREADSIFT_TARGET` names. The `worker` target runs `wrangler dev --local` through the `worker-local` script. The `container` target runs `podman run` on the image that `container:build` builds.
- **One image and port per checkout.** Every smoke and live task derives its image tag and port from the checkout's path (`checkoutEnv` in the devenv configuration), so two worktrees build, run and serve their own image on their own port at once. Two checkouts can pick the same port (about 1 in 10000), and the second run then fails to start.
- **Image cleanup.** `container:build` labels the image `io.threadsift.smoke=true` and prunes labelled images that no tag points to and no container uses. A checkout therefore cannot remove another checkout's image, even when the two tags share an image ID. A removed worktree leaves its tagged image behind. List the tagged images with `podman images --filter reference='localhost/threadsift:smoke-*'` and remove the ones you no longer need with `podman rmi <image>`.

## Live check

The live spec is the `live` Playwright project. [Testing](../testing.md) and [CI, releases and rollback](ci-releases-and-rollback.md), Live check, say how to run it and what it needs. Set `GITHUB_TOKEN` in the environment to avoid GitHub's anonymous limit.

## What no check covers

- The Extension in a real browser.
- The Highlights page in a browser.
- Contrast and layout shift in a browser. The static `impeccable detect` check runs, and the smoke spec measures some touch targets against 44px on a phone.
- Every Provider but Claude Code. Claude Code runs on the container only, so no check runs OpenRouter, any other HTTP Provider or the Codex executor ([Open items and unverified claims](open-items-and-unverified-claims.md)).
- A broad check against a deployed copy. The deploy job only waits for the live Worker to answer 200.
