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

The `ports:` row names fields of `Ports` in `src/core/ports.ts`, except `tick`, which the target's timer or Cron Trigger calls. `ports.ts` holds only the aggregate `Ports` and the types picked from it. Each port interface lives in a module of `src/core/` named for its group: `database.ts`, `network.ts` (`Network` and `RedditSession`), `file-store.ts`, `job-queue.ts`, `crypto.ts`, `page-reader.ts`, `ai-runtime.ts` and `x-fetcher-port.ts`. An importer takes a type from the module that defines it, so no module that `ports.ts` names imports `ports.ts` back.

- The core imports no runtime module (`node:*`, `cloudflare:*`). Only the two target entry files and their adapters do, so a core change runs on both targets by construction.
- The `Crypto` port has one adapter, `nodeCrypto` in `src/targets/shared/`, and both targets pass it, because the Worker runs `node:crypto` through `nodejs_compat`. This is the accepted exception to the two-adapter rule. The port exists because the lint bans `node:` imports in `src/core` and `src/http`.
- `Ports.fetchers` is a second accepted exception to the two-adapter rule, and it is a list, not a behaviour port: it holds the fetcher plug-ins the container loaded, and the Worker builds `fetchers: []` and carries no loader. The feature exists only because a self-hoster adds code to the container (`docs/spec.md`, Fetchers, Fetcher plug-ins (container only)), so no second production adapter can exist, and a wrapper that made the empty Worker list look like one would be a test adapter in disguise. The core reads the list as data and calls no per-target code for it (`pluginPage` in `src/core/plugin-fetch.ts`).
- `Ports.redditSession` has two production adapters that cannot be one function: `nodeRedditSession` (`src/targets/node/network.ts`, the platform `fetch` with a manual redirect) and `workerRedditSession` (`src/targets/worker/reddit-session.ts`, a raw TLS socket from `cloudflare:sockets` with HTTP/1.1 from `src/targets/worker/http1.ts`), because Reddit answers the Workers `fetch` client with 403 even with the owner's session cookie while a socket from the same Worker got 200 (`docs/architecture/fetchers.md`, Reddit).
- The Worker builds its ports once per isolate and keeps the promise (`portsOf` in `src/targets/worker/index.ts`). A build that rejects clears the promise, so the next request builds again instead of failing the same way for the life of the isolate. A real input makes the build reject: `THREADSIFT_OPENROUTER_MAX_PRICE_ZERO=yes` makes `aiAndSecrets` throw a `ZodError` (run on 2026-11-15).
- Ports reach routes through `createApp(ports)`, never through `c.env`, because `c.env` holds Worker bindings on Cloudflare and Node's request and response on Node.
- `Ports.xFetcher` is a third accepted exception to the two-adapter rule: the container registers the grok X fetcher when `findBinary` finds `grok` on `PATH` at start, and the Worker builds `xFetcher: null`. The Grok Bot (a webhook, asynchronous) shares no interface with it, so no second production adapter can exist. The core reads it as data (`fetchedByX` in `src/core/x-fetcher.ts`).
- `Ports.vaultFolder` is a fourth exception to the two-adapter rule. The container supplies the filesystem adapter and the Worker supplies `null`. Both targets construct the GitHub adapter in the core through `Network`. Both writers implement `VaultTarget`.
- Code that only one target has (CLI Providers, the grok X fetcher, fetcher plug-ins, Workers AI) is an adapter the other target does not register. The settings screens list only registered adapters, as `docs/spec.md` (AI providers) asks.
- Hono, not Next.js: the container target runs plain Node, and Hono runs on Node and Workers with the same app object. Nitro v3 was the runner-up and was rejected for now: it is a release candidate, its database layer has no `batch`, it has no job queue on Node, and the deploy button's handling of its generated Wrangler config is undocumented. Hono 5 is at its first release candidate; the app moves to it once it is stable.
