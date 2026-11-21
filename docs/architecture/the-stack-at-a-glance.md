# The stack at a glance

The tools Threadsift uses and what each install target runs. The ports, which carry files, jobs and the schedule, are in [One codebase, two install targets](one-codebase-two-install-targets.md).

| Concern | Choice | Container | Cloudflare |
|---|---|---|---|
| Language | TypeScript, strict | Node 26 | Workers runtime, `nodejs_compat` |
| HTTP | Hono | `@hono/node-server` | Worker `fetch` handler |
| API contract | `@hono/zod-openapi` on `/api` | same | same |
| Database | SQLite through Drizzle ORM (`sqlite-core`) | `node:sqlite` through Drizzle's `sqlite-proxy` driver | D1 through Drizzle's `d1` driver |
| Search | SQLite FTS5 | same | same |
| AI over HTTP | AI SDK (`ai`) with its provider packages | yes | yes |
| Workers AI | the `AI` binding, called directly | no | yes |
| AI through a CLI | a subprocess runner of the Node target: `claude -p` and `codex exec` | yes | no |
| X fetch through a CLI | `grok`, which is not a Provider | yes | no |
| AI through Grok Bot | task webhook and result callback | yes | yes |
| Article text | Defuddle on linkedom | yes | yes |
| Web app | React single-page app built by Vite | served by Hono | Workers static assets |
| Extension | WXT, Defuddle's Reddit extractor | n/a | n/a |
| MCP | `@modelcontextprotocol/server` `createMcpHandler`, behind a bearer-token, Host and Origin gate | same | same |
| Tooling | devenv (`nodejs_26`), pnpm through corepack, oxlint and oxfmt, Playwright | n/a | n/a |

## Licences

AGPL-3.0-only code may use every production licence. `pnpm licenses list --prod` prints them.

## Why pnpm on Node, not Bun

Vite, oxlint, Playwright and wrangler run on Node anyway, so Bun would be a third runtime to test.
