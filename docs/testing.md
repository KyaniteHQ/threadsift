# Testing

Read this page before you write, change or delete a test. It overrides broader testing instructions. [Testing architecture](architecture/testing.md) says how the suites are built.

## Policy

- Tests run the real code on a real database and real runtimes. The app has no mocks, stubs, fakes, replayed recordings or test-only seams. A vendor's own local runtime (`wrangler dev` with local D1, R2 and Queues, Podman, Chromium) counts as real.
- Prove a change by running the real program the way its caller does, and keep the command and its output as the artifact.
- Prove a bug fix with one reproduction that fails before the fix and passes after it.
- Fix the cause of a flaky run in the test, because a retry or a sleep hides it.

## Commands

| Command | What it runs |
|---|---|
| `pnpm test` | The core tests, in shards. The `check` job and the pre-push hook run them too. |
| `pnpm test N` | The core tests in `N` shards. When shard `i/N` fails, run this with the same files to reproduce its layout; `pnpm test 1` checks that all files can share one process. |
| `node --test test/<file>` | One test file. |
| `devenv tasks run ci:gate` | The gate without the browser smoke. The `check` job runs the same command. `devenv test` is not the gate, because it starts the dev `processes`. |
| `devenv tasks run smoke:worker`, `devenv tasks run smoke:container` | The browser smoke on each install target. |
| `devenv tasks run image:build` | Builds the image that the start check runs, tagged `localhost/threadsift:publish` (one tag for every checkout). |
| `tools/start-check.sh <image>` | The start check. |
| `devenv tasks run live:worker`, `devenv tasks run live:container` | The live check, by hand before a release. |

## Core tests

A core test starts the real app in process on a temp database with the real migrations and calls it through `app.request`. Each file states the requirement it proves. Files in a shard share one process, so each file closes its resources, restores process globals and keeps its own mutable fixtures.

A core test reaches no host on the internet, with two exceptions:

- A test that stores an X thread through an intake answer lets the `x_verify` job ask X's public oEmbed endpoint (`publish.x.com`) for the post.
- The fetcher plug-in test looks up `www.reddit.com`.

Every other host a core test names is reserved (`.test`, `.invalid`), the machine's own, or a refused local port (a test that saves a Provider points it at `http://127.0.0.1:9`). The one listener a test starts runs a script of the Grok Bot template on `127.0.0.1` against the real app, so those tests need `python3` and `curl`. No core test reaches a working Provider. The suite passes with only the loopback interface up (`unshare -rn`).

**The machine's own host name.** Two tests, through `ownPrivateHostName`, need the machine's own host name to resolve only to private addresses, as it does on a GitHub runner and on a host whose `/etc/hosts` maps the name to a loopback address. Where the name resolves to a public address they fail, and so do `pnpm test`, the pre-push hook and the `check` job, until an `/etc/hosts` line maps the name to `127.0.0.1`.

**Where a test calls code directly.** A request reaches every rule a request can meet, so test that rule through the route, such as the refusal of a host through `POST /api/items`. A test calls code directly only when no request reaches it:

- a parser that takes literal input (`readArticle`, `catalogKey`);
- `saveUnresolved` on the real database, for the failed-short-link budget and the Restore hold, because a request would need a short-link host to fail on the network;
- `matches` of a loaded plug-in, for the refusal of a `.localhost` name, because a Paste refuses that link before any plug-in is asked;
- `claimNextDue`, then `takeTurn` and `redditClosing` on the claimed job, for the Reddit turn queue, because a run that takes the turn goes on to request reddit.com and its close wakes the next job at once.

A test drives the clock by replacing `Date.now` for one call, because the code has no clock port.

**The Grok Bot webhook.** The answer of the bot's webhook is unproven offline: the settings route accepts only a public https address and the Node network refuses a private host, so no listener a test starts can answer as the bot. A test that needs a sent task runs the real send, which fails, and marks the task accepted with `acceptedByBot`. [AI tasks and Providers](architecture/ai-tasks-and-providers.md), The send and the states, owns the status mapping.

## Browser smoke

The full pull request gate runs the browser smoke on both install targets. A docs-only gate skips it. Each checkout builds and runs its own image, `localhost/threadsift:smoke-<slot>`, on its own port, so two worktrees can run it at once ([Testing architecture](architecture/testing.md), Smoke).

## Start check

The start check runs an image with a fresh volume and asks `GET /api/session` until it answers 200, for at most 60 s after the container starts. To run it by hand, build the image with `devenv tasks run image:build`, then run the start check on `localhost/threadsift:publish`. [CI, releases and rollback](architecture/ci-releases-and-rollback.md), Start check and Image, says when CI runs it and how to run it without a push.

## Live check

The live check reaches the internet when you run it by hand before a release, and it blocks neither a pull request nor the deploy. The Worker run calls no model, because its Pastes carry a caller-sent Digest. On the container it calls a real model through the Provider "Claude Code on this server", and `live:container` fails at once without `CLAUDE_CODE_OAUTH_TOKEN` ([CI, releases and rollback](architecture/ci-releases-and-rollback.md), Live check).

## Live deployment guard

Only the `deploy` job of the gate workflow targets `--env live`. A machine signed in to Wrangler reaches the live account, and `CI=true` skips Wrangler's confirmation prompt, so a local check uses `--local`.
