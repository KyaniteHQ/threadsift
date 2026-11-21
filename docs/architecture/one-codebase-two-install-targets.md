# One codebase, two install targets

The app is one core with ports, and each install target supplies an adapter for each port. A port is a typed interface that the core calls, and an adapter is the target's implementation of it. Open Managed Agents ships one Hono app on `@hono/node-server` and on Workers this way. EdgeEver ships one Hono app on Workers and on Bun in Docker.

## Contents

- [The ports](#the-ports)
- [Rules for adapters](#rules-for-adapters)
- [Accepted exceptions to the two-adapter rule](#accepted-exceptions-to-the-two-adapter-rule)
- [The Worker builds its ports for each request](#the-worker-builds-its-ports-for-each-request)
- [The folders of the core](#the-folders-of-the-core)
- [How a target builds its ports](#how-a-target-builds-its-ports)
- [Empty variables](#empty-variables)
- [Why Hono](#why-hono)

```text
             web app (React SPA), Extension, agents, MCP clients, Grok Bot
                                      |
                 Hono app from createApp(ports): API, MCP, login, setup
                                      |
                 core: ingest pipeline, AI tasks, wiki, export
                                      |
   ports:   db           files      jobs       tick       ai                   fetchers         network
             |           |           |          |          |                   |               |
container:  node:sqlite  folder     loop       timer      HTTP, CLI, Grok Bot  plug-in modules  platform fetch
Cloudflare: D1           R2         Queues     Cron       HTTP, Workers AI, Grok Bot  none        cloudflare:sockets
```

## The ports

The `ports:` row names fields of `Ports`, except `tick`, which the target's timer or Cron Trigger calls. `Ports` holds only the aggregate and the types picked from it. Each port interface lives in a module named for its group:

| Port | Interface |
|---|---|
| `db` | `Database` |
| `files` | `FileStore` |
| `network`, `redditSession` | `Network`, `RedditSession` |
| `pages` | `PageReader` |
| `jobs` | `JobQueue` |
| `secrets` | `Sealer` |
| `vaultFolder` | `VaultFolder` and the Vault writers it returns |
| `xFetcher` | `XFetcher` |
| `crypto` | `Crypto` |

Three more types hold data and are not ports: `AiRuntime` (what `Ports.ai` holds, and the runner types), `LoadedFetcher` (what `Ports.fetchers` lists) and `InstanceConfig` (`Ports.config`, which holds `setupCode`, `resetCode` and `publicOrigin` as plain values).

An importer takes a type from the module that defines it, so no module that `Ports` names imports `Ports` back.

## Rules for adapters

- Core rules stay in the core. A port's contract rules live in the core, in `contract`, `kernel` or `compose`, or in the core half of the feature that owns the port. An adapter supplies only what its runtime alone can do. `networkOver`, `redditSessionOver`, `checkedFileStore` and `pageReaderOver` each take the adapter's transport and return the port. The two network ones build the `NetworkResponse` from the status, header reader and body that the transport returns.
- What stays different between targets. These are named fields of the transport: the request headers of a GET (`Transport.getHeaders`, while a POST has one header set for both targets, `POST_HEADERS`), the connect-time DNS check (`Transport.lookup`: `globalAddressesOnly` on the container, `null` on the Worker because Cloudflare resolves the name, and the type checker refuses a transport that leaves the field out), and the `maxHtmlBytes` of the page reader.
- The core imports no runtime module (`node:*`, `cloudflare:*`). Only the two target entries and their adapters do, so a core change runs on both targets by construction.
- Ports reach routes through `createApp(ports)`, never through `c.env`, because `c.env` holds Worker bindings on Cloudflare and Node's request and response on Node.
- Code that only one target has (CLI Providers, the grok X fetcher, fetcher plug-ins, Workers AI) is an adapter that the other target does not register. The settings screens list only registered adapters ([the v1 spec](../spec.md), AI providers).

`Ports.redditSession` has two production adapters that cannot be one function. `nodeRedditSession` uses the platform `fetch` with a manual redirect. `workerRedditSession` uses a raw TLS socket from `cloudflare:sockets` with HTTP/1.1 written by hand. Reddit answers the Workers `fetch` client with 403 even with the owner's session cookie, while a socket from the same Worker got 200 ([Fetchers](fetchers.md), Reddit).

## Accepted exceptions to the two-adapter rule

A port exists only when two production adapters need it. Four fields of `Ports` have one adapter or none, for these reasons:

| Field | Why it has fewer than two adapters |
|---|---|
| `crypto` | One adapter, `nodeCrypto`, serves both targets, because the Worker runs `node:crypto` through `nodejs_compat`. The port exists because the lint bans `node:` imports in the core, the features and the HTTP layer. |
| `fetchers` | A list, not a behaviour port. It holds the fetcher plug-ins the container loaded ([Fetchers](fetchers.md), Plug-ins), and the Worker builds `fetchers: []` and has no loader, so no second production adapter can exist. A wrapper that made the empty Worker list look like a second production adapter would exist only for tests. The core reads the list as data (`pluginPage`). |
| `xFetcher` | The container registers the grok X fetcher when `findBinary` finds `grok` on `PATH` at start, and the Worker builds `xFetcher: null`. The Grok Bot is a webhook and asynchronous, and shares no interface with it, so no second production adapter can exist. The core reads it as data (`fetchedByX`). |
| `vaultFolder` | The container supplies the filesystem adapter, and the Worker supplies `null`. Both targets construct the GitHub adapter in the core through `Network`. Both writers implement `VaultTarget`. |

## The Worker builds its ports for each request

The Worker builds its ports for each API request, each valid queue message and each Cron run, and its app for each API request. A static page and an invalid queue message build nothing.

It keeps no value derived from `env` in module scope. Cloudflare may reuse an isolate when only a binding, a variable or a secret changes, and such a value can outlive that change ([Workers bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/#making-changes-to-bindings): "The correct approach would be to create a new client instance for each request."). The ports hold the bindings, the secret key, the setup code, the reset code and the public origin, so the Worker reads each of them from the `env` of the call that uses it. `workerNetwork`, `workerPageReader` and `workerRedditSession` stay in module scope because they derive nothing from `env`.

A failed `settingsOf` fails that request or job and leaves the next one to build again. A real input does that: `THREADSIFT_OPENROUTER_MAX_PRICE_ZERO=yes` makes `settingsOf` throw a `ZodError`.

[Decisions and evidence](decisions-and-evidence.md), Worker: ports and app built for each request, holds the stale-value bug this prevents, the cost rule and the measured cost.

## The folders of the core

The core is the `contract`, `kernel` and `compose` folders and the core half of each feature. The HTTP layer and the http half of each feature put it on Hono. The folders import each other in one direction, and the ports sit at the bottom of that order. [Repository layout](repository-layout.md), The tree under src, owns the order, what each folder holds and how to add a module, a route module, an entry or a feature.

- `kernel` holds `Ports` and the port interface modules, except `Crypto`, which sits in `contract`. A feature calls a port and never sees an adapter.
- `contract` imports no other folder, so the browser and the Extension get the same constants and schemas as the server.

## How a target builds its ports

Both targets turn their variables into `Ports` with the same two functions:

1. `settingsOf` reads the five variables both targets share (`SettingVariables`, which `settingVariablesOf` takes from `process.env` or from `Env`) and returns `Settings`.
2. `portsOf` takes `Settings` and the target's own adapters (`TargetAdapters`) and returns `Ports`. It seals the secret key, passes `nodeCrypto`, checks the public origin (`publicOriginOf`) and fills `Ports.config` and `Ports.ai`.

The container copies the values it reads from `process.env` once through `nodeEnvironment`, which takes the names of the shared variables from `settingVariablesOf`. `startNode` passes the result on. The Worker's `Env` extends `SettingVariables`, and `workerAdapters` builds its adapters from the bindings. The name of a shared variable therefore exists once.

- A new shared setting is a name in `SETTING_NAMES` (the keys of `SettingVariables`), a field in `Settings` and a line in `settingsOf`. When the core reads it, it is also a field of `InstanceConfig`, and `portsOf` forwards it. A setting only the container reads goes in `nodeEnvironment`. One only the Worker reads goes in `Env` and `workerAdapters`.
- `AiRuntime` is data, not a port. It has one implementation and differs between targets only in values: `publicOnly`, `zeroOpenRouterPrice`, the `request` function, the `binding` runner (Worker, or `null`) and the `cli` runners (container, or empty). The runners are the adapters. These functions read the data: `providersOf`, `recommendationsOf`, `allowsUrl`, `resolveCli`, `signedIn`, `runAi`, `exchangeOpenRouterCode` and `awaitOpenRouterActivation`.
- `resetCode` is the owner's reset code on both targets: `PASSWORD_RESET_CODE` after `settingVariablesOf`, in `Ports.config.resetCode`. The container reads it once at start. The Worker reads it from the `env` of each request, because it builds its ports for each request.
- The job loop (`JobLoop`) takes a function that returns the ports, because the ports hold the loop's queue and the loop runs jobs on the ports. `startNode` passes `() => ports`, and the loop calls it only after `start`, which runs once `portsOf` has returned.

## Empty variables

A variable that Threadsift reads (`SETTING_NAMES` and the ones `nodeEnvironment` lists) and that is set to the empty string counts as unset. Its default applies, or the setting is absent. Each variable goes through one step:

| Variables | Step | Effect |
|---|---|---|
| The variables that `nodeEnvironment` reads (container) | `nodeEnvironment` drops every empty entry of `process.env` | an empty `PORT` is `8080`. An empty `DATA_DIR` is the `.data` folder in the repository root (in the image, a link to `/data`). An empty `GROK_HOME` or `THREADSIFT_FETCHERS` is absent. |
| The five shared variables (both targets) | `settingVariablesOf` applies `unsetWhenEmpty` | the container passes them through it from `process.env`. The Worker reads them, `PASSWORD_RESET_CODE` included, only through it. |

The provider comparison tool calls `unsetWhenEmpty` for the Claude Code and Codex variables it reads. A nonempty `THREADSIFT_PUBLIC_ORIGIN` of spaces, or a nonempty `THREADSIFT_OPENROUTER_MAX_PRICE_ZERO` other than `true` or `false`, is still an error (a `ZodError` for the second).

## Why Hono

Hono runs on Node and on Workers with the same app object, and the container target runs plain Node, so it needs no Next.js. Nitro v3 is rejected for now: it is a release candidate (npm `latest` tag `3.0.261103-rc`, 2026-11-21), its database layer has no `batch`, it has no job queue on Node, and the deploy button's handling of its generated Wrangler config is undocumented. Hono 5 is at its first release candidate (`5.0.0-rc.1` under the npm tag `next`, 2026-11-21), and the app moves to it once it is stable.
