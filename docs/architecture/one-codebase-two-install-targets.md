# One codebase, two install targets

The app is one core with ports, and each target supplies an adapter per port. Open Managed Agents ships one Hono app on `@hono/node-server` and on Workers this way; EdgeEver ships one Hono app on Workers and on Bun in Docker.

```
             web app (React SPA), Extension, agents, MCP clients, Grok Bot
                                      |
                 Hono app from createApp(ports): API, MCP, login, setup, static files
                                      |
                 core: ingest pipeline, AI tasks, wiki, export, restore
                                      |
   ports:   Database   FileStore   JobQueue   Scheduler   AiExecutor          fetchers list
             |           |           |          |          |                   |
container:  node:sqlite  folder     loop       timer      HTTP, CLI, Grok Bot  plug-in modules
Cloudflare: D1           R2         Queues     Cron       HTTP, Workers AI, Grok Bot  none
```

- The core imports no runtime module (`node:*`, `cloudflare:*`). Only the two target entry files and their adapters do, so a core change runs on both targets by construction.
- The `Crypto` port has one adapter, `nodeCrypto` in `src/targets/shared/`, and both targets pass it, because the Worker runs `node:crypto` through `nodejs_compat`. This is the accepted exception to the two-adapter rule. The port exists because the lint bans `node:` imports in `src/core` and `src/http`.
- `Ports.fetchers` is a second accepted exception to the two-adapter rule, and it is a list, not a behaviour port: it holds the fetcher plug-ins the container loaded, and the Worker builds `fetchers: []` and carries no loader. The feature exists only because a self-hoster adds code to the container (`docs/spec.md`, Install and deployment), so no second production adapter can exist, and a wrapper that made the empty Worker list look like one would be a test adapter in disguise. The core reads the list as data and calls no per-target code for it (`pluginPage` in `src/core/plugin-fetch.ts`).
- The Worker builds its ports once per isolate and keeps the promise (`portsOf` in `src/targets/worker/index.ts`). A build that rejects clears the promise, so the next request builds again instead of failing the same way for the life of the isolate. No real input makes the build reject (`sealedSecrets` accepts only 64 hexadecimal digits and then imports a valid key), so this path is unverified.
- Ports reach routes through `createApp(ports)`, never through `c.env`, because `c.env` holds Worker bindings on Cloudflare and Node's request and response on Node. `waitUntil` lives in the Worker entry for the same reason: Hono's Node adapter passes no execution context.
- Code that only one target has (CLI Providers, the grok X fetcher, fetcher plug-ins, the local vault folder, Workers AI) is an adapter the other target does not register. The settings screens list only registered adapters, as `docs/spec.md` (AI providers) asks.
- Hono, not Next.js: the container target runs plain Node, and Hono runs on Node and Workers with the same app object. Nitro v3 was the runner-up and was rejected for now: it is a release candidate, its database layer has no `batch`, it has no job queue on Node, and the deploy button's handling of its generated Wrangler config is undocumented. Hono 5 is at its first release candidate; the app moves to it once it is stable.
