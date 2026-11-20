# One codebase, two install targets

The app is one core with ports, and each target supplies an adapter per port. Open Managed Agents ships one Hono app on `@hono/node-server` and on Workers this way; EdgeEver ships one Hono app on Workers and on Bun in Docker.

```
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

The `ports:` row names fields of `Ports` in `src/core/kernel/ports.ts`, except `tick`, which the target's timer or Cron Trigger calls. `ports.ts` holds only the aggregate `Ports` and the types picked from it. Each port interface lives in a module named for its group: `database.ts`, `network.ts` (`Network` and `RedditSession`), `file-store.ts`, `job-queue.ts`, `page-reader.ts`, `sealed-secret.ts` (`Sealer`), `vault-target.ts` (`VaultFolder` and the Vault writers it returns) and `x-fetcher-port.ts` in `src/core/kernel/`, and `crypto.ts` in `src/core/contract/`. Three more modules hold data and not ports: `ai-runtime.ts` in `src/core/kernel/` (what `Ports.ai` holds, and the runner types), `fetcher.ts` in `src/core/kernel/` (`LoadedFetcher`, what `Ports.fetchers` lists) and `instance-config.ts` in `src/core/contract/` (`Ports.config`). An importer takes a type from the module that defines it, so no module that `ports.ts` names imports `ports.ts` back.

- A port's contract rules live in `src/core/` or in the core half of the feature that owns the port, and an adapter supplies only what its runtime alone can do. `networkOver` (`src/core/kernel/network-transport.ts`), `redditSessionOver` (`src/features/reddit/core/reddit-session.ts`), `checkedFileStore` (`src/core/kernel/file-store.ts`) and `pageReaderOver` (`src/core/kernel/page-reader.ts`) each take the adapter's transport and return the port, and the two network ones build the `NetworkResponse` from the status, header reader and body that the transport returns. The differences between the targets that stay are named fields of that transport: the request headers of a GET (`Transport.getHeaders`; a POST has one header set for both targets, `POST_HEADERS` in `network-transport.ts`), the connect-time DNS check (`Transport.lookup`: `globalAddressesOnly` on the container, `null` on the Worker because Cloudflare resolves the name, and the type checker refuses a transport that leaves the field out), and `maxHtmlBytes` of the page reader.
- The core imports no runtime module (`node:*`, `cloudflare:*`). Only the two target entry files and their adapters do, so a core change runs on both targets by construction.
- The `Crypto` port has one adapter, `nodeCrypto` in `src/targets/shared/`, and `portsOf` (`src/targets/shared/ports.ts`) passes it for both targets, because the Worker runs `node:crypto` through `nodejs_compat`. This is the accepted exception to the two-adapter rule. The port exists because the lint bans `node:` imports in `src/core`, `src/features` and `src/http`.
- `Ports.fetchers` is a second accepted exception to the two-adapter rule, and it is a list, not a behaviour port: it holds the fetcher plug-ins the container loaded, and the Worker builds `fetchers: []` and carries no loader. The feature exists only because a self-hoster adds code to the container (`docs/spec.md`, Fetchers, Fetcher plug-ins (container only)), so no second production adapter can exist, and a wrapper that made the empty Worker list look like one would be a test adapter in disguise. The core reads the list as data and calls no per-target code for it (`pluginPage` in `src/features/fetch/core/plugin-fetch.ts`).
- `Ports.redditSession` has two production adapters that cannot be one function: `nodeRedditSession` (`src/targets/node/network.ts`, the platform `fetch` with a manual redirect) and `workerRedditSession` (`src/targets/worker/reddit-session.ts`, a raw TLS socket from `cloudflare:sockets` with HTTP/1.1 from `src/targets/worker/http1.ts`), because Reddit answers the Workers `fetch` client with 403 even with the owner's session cookie while a socket from the same Worker got 200 (`docs/architecture/fetchers.md`, Reddit).
- The Worker builds its ports for each API request, each valid queue message and each Cron run, and its app for each API request; a static page and an invalid queue message build nothing (`build` and the default export in `src/targets/worker/index.ts`). It keeps no value derived from `env` in module scope, because Cloudflare may reuse an isolate when only a binding, a variable or a secret changes, and such a value can outlive that change ([Workers bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/#making-changes-to-bindings): "The correct approach would be to create a new client instance for each request."). The ports hold the bindings, the secret key, the setup code, the reset code and the public origin, so each of them is read from the `env` of the call that uses it. `workerNetwork`, `workerPageReader` and `workerRedditSession` stay in module scope because they derive nothing from `env`. A failed `settingsOf` fails that request or job and leaves the next one to build again. A real input does that: `THREADSIFT_OPENROUTER_MAX_PRICE_ZERO=yes` makes `settingsOf` throw a `ZodError` (run on 2026-11-15, when `aiAndSecrets`, which `settingsOf` replaced, parsed it with the same call).
  - The stale-value bug this prevents, the cost rule and the measured cost are in `docs/architecture/decisions-and-evidence.md`, Worker: ports and app built for each request.
- Ports reach routes through `createApp(ports)`, never through `c.env`, because `c.env` holds Worker bindings on Cloudflare and Node's request and response on Node.
- `Ports.xFetcher` is a third accepted exception to the two-adapter rule: the container registers the grok X fetcher when `findBinary` finds `grok` on `PATH` at start, and the Worker builds `xFetcher: null`. The Grok Bot (a webhook, asynchronous) shares no interface with it, so no second production adapter can exist. The core reads it as data (`fetchedByX` in `src/features/x/core/x-fetcher.ts`).
- `Ports.vaultFolder` is a fourth exception to the two-adapter rule. The container supplies the filesystem adapter and the Worker supplies `null`. Both targets construct the GitHub adapter in the core through `Network`. Both writers implement `VaultTarget`.
- Code that only one target has (CLI Providers, the grok X fetcher, fetcher plug-ins, Workers AI) is an adapter the other target does not register. The settings screens list only registered adapters, as `docs/spec.md` (AI providers) asks.
- Hono, not Next.js: the container target runs plain Node, and Hono runs on Node and Workers with the same app object. Nitro v3 was the runner-up and was rejected for now: it is a release candidate, its database layer has no `batch`, it has no job queue on Node, and the deploy button's handling of its generated Wrangler config is undocumented. Hono 5 is at its first release candidate; the app moves to it once it is stable.

## The folders of the core

The code is cut into folders that import each other in one direction, and the ports sit at the bottom of that order. The core is `src/core/` and the core half of each feature; `src/http/` and the http half of each feature put it on Hono.

```
 src/targets/             import contract, kernel, compose, src/http and the entries of the core halves
          |
   routes.ts, app.ts     import the http halves of the features
          |
   http halves           src/features/<feature>/http: the routes of one feature, never of another
          |
   src/http              the access gate, refusals, MCP endpoint, shared route helpers
          |
   compose               (job engine, sweep, tick: run the folders below together)
          |
   core halves           src/features/<feature>/core, access ... bot: each imports only the core halves
          |              before it, through their entries
   kernel                (tables, schema, ports, guards, job queue, shared stored-record readers and writers)
          |
   contract              (constants, schemas, types, pure parsers: the only folder web/ and the Extension import)
```

- `kernel` holds `ports.ts` and the port interface modules, except `crypto.ts`, which sits in `contract`. So a feature calls a port and never sees an adapter. `contract` imports no other folder, so the browser and the Extension get the same constants and schemas as the server.
- A feature is a group of modules named for one glossary area. Its interface is its entries, the modules that code outside the folder imports; the other modules are hidden and cannot gain an outside importer.
- `tools/core-layout.json` holds the order and the entries. `threadsift/layer-imports` refuses an import against the order, an import of a hidden module from outside its feature, an import between the http halves of two features, and an import into `web/` or the Extension of any `src/core` folder but `contract`, of a core half, of an http half, of `src/http` or of `src/targets`. `docs/architecture/repository-layout.md` (The tree under `src`) says what each folder holds and how to add a module, a route module, an entry or a feature.

## How a target builds its ports

Both targets turn their variables into `Ports` with the same two functions. `settingsOf` (`src/targets/shared/settings.ts`) reads the five variables both targets share (`SettingVariables`, which `settingVariablesOf` takes from `process.env` or from `Env`) and returns `Settings`. `portsOf` (`src/targets/shared/ports.ts`) takes `Settings` and the target's own adapters (`TargetAdapters`) and returns `Ports`: it seals the secret key, passes `nodeCrypto`, checks the public origin (`publicOriginOf`, `src/targets/shared/public-origin.ts`) and fills `Ports.config` and `Ports.ai`. The container copies the values it reads from `process.env` once through `nodeEnvironment` (`src/targets/node/environment.ts`), which takes the names of the shared variables from `settingVariablesOf` (`src/targets/shared/settings.ts`), and `startNode` (`src/targets/node/ports.ts`) passes the result on. The Worker's `Env` extends `SettingVariables` and `workerAdapters` (`src/targets/worker/ports.ts`) builds its adapters from the bindings, so the name of a shared variable exists once.

- **A new shared setting** is a name in `SETTING_NAMES` (the keys of `SettingVariables`, which `nodeEnvironment` copies from `process.env`), a field in `Settings` and a line in `settingsOf`. When the core reads it, it is also a field of `InstanceConfig` (`src/core/contract/instance-config.ts`), and `portsOf` forwards it. A setting only the container reads goes in `nodeEnvironment`, and one only the Worker reads goes in `Env` and `workerAdapters`.
- **`Ports.config`** holds `setupCode`, `resetCode` and `publicOrigin`, plain values and not ports. The core reads them as `ports.config.setupCode` and so on.
- **`AiRuntime` is data, not a port.** It has one implementation and differs between targets only in values: `publicOnly`, `zeroOpenRouterPrice`, the `request` function, the `binding` runner (Worker, or `null`) and the `cli` runners (container, or empty). The runners are the adapters, and the functions in `src/features/ai/core/ai-run.ts` and `src/features/ai/core/openrouter-exchange.ts` read the data: `providersOf`, `recommendationsOf`, `allowsUrl`, `resolveCli`, `signedIn`, `runAi`, `exchangeOpenRouterCode` and `awaitOpenRouterActivation`.
- **`resetCode`** is the owner's reset code on both targets: `PASSWORD_RESET_CODE` after `settingVariablesOf`, in `Ports.config.resetCode`. The container reads it once at start. The Worker reads it from the `env` of each request, because it builds its ports for each request.
- **The job loop** (`JobLoop`, `src/targets/node/job-loop.ts`) takes a function that returns the ports, because the ports hold the loop's queue and the loop runs jobs on the ports. `startNode` passes `() => ports`, and the loop calls it only after `start`, which runs once `portsOf` has returned.

### Empty variables

A variable that Threadsift reads (`SETTING_NAMES` and the ones `nodeEnvironment` lists) and that is set to the empty string counts as unset: its default applies, or the setting is absent. Each variable goes through one step.

- **Container.** `nodeEnvironment` (`src/targets/node/environment.ts`) drops every empty entry of `process.env`, so an empty `PORT` is `8080`, an empty `DATA_DIR` is the `.data` folder in the repository root (in the image, a link to `/data`), and an empty `GROK_HOME` or `THREADSIFT_FETCHERS` is absent. The five shared variables go through `settingVariablesOf` instead.
- **Worker.** `settingVariablesOf` (`src/targets/shared/settings.ts`) applies `unsetWhenEmpty` to the five shared variables, and the Worker reads them, `PASSWORD_RESET_CODE` included, only through it.

`tools/provider-comparison-providers.ts` calls `unsetWhenEmpty` for the Claude Code and Codex variables it reads. A nonempty `THREADSIFT_PUBLIC_ORIGIN` of spaces, or a nonempty `THREADSIFT_OPENROUTER_MAX_PRICE_ZERO` other than `true` or `false`, is still an error, a `ZodError` for the second.
