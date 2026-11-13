# The stack at a glance

| Concern | Choice | Container | Cloudflare |
|---|---|---|---|
| Language | TypeScript, strict | Node 26 | Workers runtime, `nodejs_compat` |
| HTTP | Hono 4 | `@hono/node-server` 2 | Worker `fetch` handler |
| API contract | `@hono/zod-openapi` on `/api` | same | same |
| Database | SQLite through Drizzle ORM (`sqlite-core`) | `node:sqlite` through Drizzle's `sqlite-proxy` driver | D1 through Drizzle's `d1` driver |
| Search | SQLite FTS5 | same | same |
| Files | one file store port | a folder on the data volume | R2 |
| Jobs | a `jobs` table plus a runner | in-process loop | Queues consumer |
| Schedule | one tick that enqueues due work | in-process minute timer | Cron Trigger |
| AI over HTTP | AI SDK (`ai` 7) with its provider packages | yes | yes |
| Workers AI | the `AI` binding, called directly | no | yes |
| AI through a CLI | own subprocess runner in `src/targets/node/` | `claude -p` and `codex exec`; `grok` is not a Provider and fetches X posts (CLI executor, Grok CLI; Fetchers, X) | no |
| AI through Grok Bot | task webhook and result callback | yes | yes |
| Article text | Defuddle on linkedom | yes | yes |
| Web app | React 19 single-page app built by Vite | served by Hono | Workers static assets |
| Extension | WXT, Defuddle's Reddit extractor | n/a | n/a |
| MCP | `@modelcontextprotocol/server` 2.4.0 `createMcpHandler`, behind a bearer-token, Host and Origin gate | same | same |
| Validation | Zod 4.5 or later | same | same |
| Tooling | devenv (`nodejs_26`), pnpm through corepack, oxlint and oxfmt, Playwright | | |

Every library above is MIT, ISC or Apache-2.0. All of them may be used by AGPL-3.0-only code. The owner chose pnpm with Node 26 over Bun on 2026-11-04: Bun 1.4.3 ran the database spike with the same results, but Vite, oxlint, Playwright and wrangler run on Node anyway, so Bun would be a third runtime to test.

Two words this file uses beyond `GLOSSARY.md`: a **port** is an interface the core calls (Database, FileStore, JobQueue, Scheduler, AiExecutor, Network), and an **executor** is the adapter that runs an AI task for one kind of Provider.
