# Testing

[Testing](../testing.md) explains how tests use the real app and when they can observe a diagnostic or a queue call.

## Core tests

`pnpm test` runs the core tests in shards: one Node process per available CPU, capped at the number of test files. Files in a shard share a process, so they pay the app import cost once.

On 2026-11-21, on the owner's 16-core machine with Node 26, `pnpm test` passed 993 tests in 140 files. Two default runs took 31.1 s and 28.8 s wall time. One run of `taskset -c 0-3 pnpm test` took 59.8 s. One run of `pnpm test 1` passed the same 993 tests in 237.3 s with all files in one process. Separate runs that day computed 29 password hashes with 16 shards, 17 with four shards, and 14 with one process. Each shard hashes the template owner's password once. The remaining hashes come from tests that set up an owner on an empty Instance, sign in or change the password.

On 2026-11-24, on a 24-core machine under load, 8 Export, Restore and zip test files took 104 s run one after the other, and the longest, the Cancel and undo file, 27 s. Seven of them build their libraries through the real routes. The zip directory file builds its archives with the zip writer.

- Core tests reach no working Provider and no external host except the two that [Testing](../testing.md) names. The save route takes the page and the Digest from the caller, and an X link stores a Link-only Item without a fetch.
- The signed-out check requests every route in the served API document except the public routes and the three task callback routes. It also sends six requests with other paths or methods beside the callbacks. Each request must receive a 401 with a Bearer challenge.
- The Reddit archive setting tests check who may change the setting and whether the owner can read it back. They do not run an archive fill.
- Real fetcher plug-in modules sit in a folder beside the tests, and the tests load them through the production loader.
- The web app's list state, filters, counts and paging order, and the Extension's `fitThreadBody`, `instanceOrigin` and `hostPattern`, run in core tests on literal inputs, as the token budget form does. The modules that read `window`, `sessionStorage` or the DOM, such as the web app's routing, run only in a browser.
- The custom lint rules, the shard reporter, the update tool for a Cloudflare copy's bindings, the doc reference check, the doc impact check and the core layout check run as child processes on temporary files, as the bot release check does. The doc reference check, the doc impact check and the core layout check run on a temporary git repository that holds a copy of the tools. The deploy tool runs only as far as its refusal of a secrets file, started with `--dry-run`, because the refusal stops it before it builds; the rest of it is not run, because it reaches a Cloudflare account.
- The Node and Worker adapters that no route test reaches run on real sockets and folders: `answerAfterBody` behind a loopback HTTP server, `originFetch` against a loopback server for the answers it passes through and the error code page it refuses, and `vaultFolder` on a temporary folder with its lease read from a migrated database. No test or smoke produces Cloudflare's own 530 answer ([Open items and unverified claims](open-items-and-unverified-claims.md)).
- The fetcher deadline test aborts `pluginPage` after all three fixture fetches start, because the job's own deadline is the fetch deadline ([Jobs, leases and the schedule](jobs-leases-and-the-schedule.md)).
- The Reddit-with-a-thread rule is not in the core tests, because the built-in route it falls back to requests reddit.com.
- The Export and Restore tests export a library of 50 Items, 5 of them with a post text file above 1 MB, so the Export needs at least 3 slices. They read the zip with the Restore reader and a second reader, build changed zips for the refusals with the zip writer and byte patches, restore it into another Instance, and compare every Item, the search results and the next Item id with the source. They also cover each refusal code of the check, the dropped rows and missing files, the Highlight anchors, Cancel, the undo, Resume, the release check before a unit, the 12-minute and 24-hour sweeps of exports, and the sweep of parts. The zip writer and reader run ZIP64 records with 65,536 entries and with an entry at an offset past 4 GiB, through a source that holds only the bytes at that offset. No test writes or reads a zip of that size, restores a stored image, splits an upload into several parts, or lets a deploy change the table list in the middle of an Export (`list-changed`).

## Smoke

The smoke spec drives Chromium through the main flows of the app on both install targets. Its `test.step` calls, and those of the flow modules it imports, name every step.

- **Export.** The browser smoke opens the downloaded zip and checks the Item IDs in the files named by its manifest.
- **Headers and policy.** The run requests `/`, `/log`, the manifest, `/api/session`, `/api/items`, `/robots.txt`, `/index.html`, `/share`, the script under `/assets/` that `/` names, and every icon that `/` links and the manifest lists, without following redirects. It reads the icon links of `/` from each `<link>` tag's `rel` tokens, so the order of the attributes does not matter, and fails unless `/` links exactly a PNG icon, an SVG icon and a PNG Apple touch icon, or when the manifest lists no icon. It expects each icon's `Content-Type` to match its extension, `image/png` or `image/svg+xml`, so the page fallback cannot answer for a missing icon. It expects 401 from `/api/items`, 404 from `/robots.txt`, 307 from `/index.html`, 303 from `/share` and 200 from the rest. It fails when a status differs, when an answer lacks `X-Robots-Tag: noindex, nofollow`, or when `/` or `/log` differs from a header of `DOCUMENT_HEADERS`. It also fails when a page reports a `securitypolicyviolation` event. Each watched context ends with a script that the policy blocks on purpose, and the run fails when that violation does not arrive. This shows the collector works and that every earlier report has arrived.
- **Targets.** The Playwright configuration starts the target that `THREADSIFT_TARGET` names. The `worker` target runs `wrangler dev --local` through the `worker-local` script. The `container` target runs `podman run` on the image that `container:build` builds.
- **One image and port per checkout.** Every smoke and live task derives its image tag and port from the checkout's path (`checkoutEnv` in the devenv configuration), so two worktrees build, run and serve their own image on their own port at once. Two checkouts can pick the same port (about 1 in 10000), and the second run then fails to start.
- **Image cleanup.** `container:build` labels the image `io.threadsift.smoke=true` and prunes labelled images that no tag points to and no container uses. A checkout therefore cannot remove another checkout's image, even when the two tags share an image ID. A removed worktree leaves its tagged image behind. List the tagged images with `podman images --filter reference='localhost/threadsift:smoke-*'` and remove the ones you no longer need with `podman rmi <image>`.

## Live check

The live spec is the `live` Playwright project. [Testing](../testing.md) and [CI, releases and rollback](ci-releases-and-rollback.md), Live check, say how to run it and what it needs. Set `GITHUB_TOKEN` in the environment to avoid GitHub's anonymous limit.

## Reader motion check

The motion spec is the `motion` Playwright project on the Worker target. It watches every view transition the page starts and counts, in Grid Sheet, Grid Page and the list under 760 px, the opens whose card grows into the Reader and the closes by Escape and by browser Back that run back into it, then the view transitions under reduced motion. [Web app](web-app.md), Reader, Motion, says how the motion works, and [Testing](../testing.md) gives the command.

## What no check covers

- The Extension in a real browser.
- Contrast and layout shift in a browser. The static `impeccable detect` check runs, and the smoke spec measures some touch targets against 44px on a phone.
- Every Provider but Claude Code. Claude Code runs on the container only, so no check runs OpenRouter, any other HTTP Provider or the Codex executor ([Open items and unverified claims](open-items-and-unverified-claims.md)).
- A broad check against a deployed copy. The deploy job only waits for the live Worker to answer 200.
