# Threadsift: architecture

Status: chosen on 2026-11-04 in a grill with the owner and revised after four model reviews the same day, before any app code exists. `docs/spec.md` says what v1 does; this file says what it is built with and where each part runs. Versions named here are the ones checked on 2026-11-04.

- [The stack at a glance](#the-stack-at-a-glance)
- [One codebase, two install targets](#one-codebase-two-install-targets)
- [Repository layout](#repository-layout)
- [Database and search](#database-and-search)
- [Data model outline](#data-model-outline)
- [Files](#files)
- [Jobs, leases and the schedule](#jobs-leases-and-the-schedule)
- [Fetchers](#fetchers)
- [AI tasks and Providers](#ai-tasks-and-providers)
- [Access: owner login, agent tokens, MCP](#access-owner-login-agent-tokens-mcp)
- [Web app](#web-app)
- [Extension and Threadsift bot](#extension-and-threadsift-bot)
- [Vault mirror](#vault-mirror)
- [Export, backup and restore](#export-backup-and-restore)
- [Container image](#container-image)
- [Cloudflare deploy button](#cloudflare-deploy-button)
- [Development environment](#development-environment)
- [Lint and format](#lint-and-format)
- [Dependency updates](#dependency-updates)
- [CI, releases and rollback](#ci-releases-and-rollback)
- [Testing](#testing)
- [Open items and unverified claims](#open-items-and-unverified-claims)

## The stack at a glance

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
| AI through a CLI | own subprocess runner | `claude -p`, `codex exec`, `grok` | no |
| AI through Grok Bot | task webhook and result callback | yes | yes |
| Article text | Defuddle on linkedom | yes | yes |
| Web app | React 19 single-page app built by Vite | served by Hono | Workers static assets |
| Extension | WXT, Defuddle's Reddit extractor | n/a | n/a |
| MCP | `@modelcontextprotocol/server` `createMcpHandler` behind a token check | same | same |
| Validation | Zod 4.5 or later | same | same |
| Tooling | devenv (`nodejs_26`), pnpm through corepack, oxlint and oxfmt, Playwright with `@axe-core/playwright` (the axe `region` rule, MPL-2.0, test only) | | |

Every library above is MIT, ISC or Apache-2.0, except `@axe-core/playwright` (MPL-2.0, a file-level copyleft licence; it runs only in tests and ships in no image or bundle). All of them may be used by AGPL-3.0-only code. The owner chose pnpm with Node 26 over Bun on 2026-11-04: Bun 1.4.3 ran the database spike with the same results, but Vite, oxlint, Playwright and wrangler run on Node anyway, so Bun would be a third runtime to test.

Two words this file uses beyond `CONTEXT.md`: a **port** is an interface the core calls (Database, FileStore, JobQueue, Scheduler, AiExecutor, Fetcher, Network), and an **executor** is the adapter that runs an AI task for one kind of Provider.

## One codebase, two install targets

The app is one core with ports, and each target supplies an adapter per port. Open Managed Agents ships one Hono app on `@hono/node-server` and on Workers this way; EdgeEver ships one Hono app on Workers and on Bun in Docker.

```
             web app (React SPA), Extension, agents, MCP clients, Grok Bot
                                      |
                 Hono app from createApp(ports): API, MCP, login, setup, static files
                                      |
                 core: ingest pipeline, AI tasks, wiki, export, restore
                                      |
   ports:   Database   FileStore   JobQueue   Scheduler   AiExecutor          Fetchers
             |           |           |          |          |                   |
container:  node:sqlite  folder     loop       timer      HTTP, CLI, Grok Bot  + plug-ins, grok CLI
Cloudflare: D1           R2         Queues     Cron       HTTP, Workers AI, Grok Bot
```

- The core imports no runtime module (`node:*`, `cloudflare:*`). Only the two target entry files and their adapters do, so a core change runs on both targets by construction.
- Ports reach routes through `createApp(ports)`, never through `c.env`, because `c.env` holds Worker bindings on Cloudflare and Node's request and response on Node. `waitUntil` lives in the Worker entry for the same reason: Hono's Node adapter passes no execution context.
- Code that only one target has (CLI Providers, the grok X fetcher, fetcher plug-ins, the local vault folder, Workers AI) is an adapter the other target does not register. The settings screens list only registered adapters, as `docs/spec.md` (AI providers) asks.
- Hono, not Next.js: the container target runs plain Node, and Hono runs on Node and Workers with the same app object. Nitro v3 was the runner-up and was rejected for now: it is a release candidate, its database layer has no `batch`, it has no job queue on Node, and the deploy button's handling of its generated Wrangler config is undocumented. Hono 5 is at its first release candidate; the app moves to it once it is stable.

## Repository layout

The deploy button builds from the repository root, because a monorepo subdirectory "becomes the new repo root" and must hold its own dependencies (Workers docs, Deploy buttons). So the root is the Worker project.

```
wrangler.jsonc, package.json      Worker config; `build` and `deploy` scripts the button pre-fills
.node-version                     26, so Workers Builds builds on Node 26 instead of its default 24
devenv.nix, devenv.yaml           the development environment and the gate tasks
secretspec.toml                   the secrets live tests need
Containerfile                     the container image
migrations/                       SQL files from drizzle-kit, applied on both targets
src/core/                         pipeline, AI tasks, wiki, export, restore, ports
src/http/                         Hono routes: /api, /mcp, login, setup
src/targets/node/                 container entry and adapters
src/targets/worker/               Worker entry (fetch, queue, scheduled) and adapters
web/                              React SPA; imports design/system/
extension/                        WXT extension (own package in the pnpm workspace)
bot/                              Threadsift bot skill files
e2e/                              Playwright suite run against both targets
tools/oxlint/                     lint rule plugins: vendored anti-slop and Threadsift's own rules
tools/copy/                       write-copy.sh, which writes every text a user reads
.claude/                          the implementer agent, its skills and the lint hook (docs/agents/)
.agents/skills/                   skills the Antigravity CLI loads: humanizer
PRODUCT.md                        who the product is for, read by the impeccable skill
renovate.json                     the dependency update rules
.github/workflows/                the gate, the `devenv.lock` update, the release and the update workflow for Cloudflare copies
tools/e2e/                        the scripts that start each target and run the Playwright suite
design/                           design system and prototype
```

## Database and search

SQLite on both targets, one Drizzle schema, one migration folder.

- **Drivers.** D1 uses `drizzle-orm/d1`. The container uses Node's built-in `node:sqlite` through `drizzle-orm/sqlite-proxy`, an adapter of about 20 lines (`src/targets/node/database.ts`), because `sqlite-proxy` wants rows as arrays and `node:sqlite` returns them that way after `setReturnArrays(true)` (Node 26.12.1, run on 2026-11-04). The adapter supports `run` and `all`; `get` needs a missing-row convention that no query uses yet, so it throws. Drizzle 0.45.4 (the stable release) has no `node:sqlite` driver; 1.0 (release candidate 5) ships `drizzle-orm/node-sqlite`, which replaces the adapter once 1.0 is stable and its `batch` is checked. `node:sqlite` needs no native addon in the image, unlike `better-sqlite3`.
- **Async and batch only.** Both drivers are async and support `db.batch()`. D1 has no interactive transactions, so every multi-statement write is one `batch`, which commits or rolls back as a unit on both targets. The container's batch is to run its statements between `BEGIN` and `COMMIT` on the one connection through the `batchCallback` that `drizzle-orm/sqlite-proxy` accepts; `src/targets/node/database.ts` passes none yet, so `db.batch()` on Node arrives with the first multi-statement write (slice 1 saves one row per call).
- **Guarded batches.** A batch that may only commit while a condition holds (a lease is still held at its generation, the catalog is still at the version a job read) starts with an insert into `guards`, a table whose `CHECK (ok = 1)` fails when the condition's `SELECT` returns 0. The failed check aborts the whole batch, on D1 and in the container alike, so a guarded write is all or nothing. A job that gets the check error has lost its lease or read a stale catalog, so it reads again instead of writing. The guard insert is written with Drizzle's `insert(guards).select(...)`, because a raw `db.run(sql)` inside a D1 batch fails in drizzle-orm 0.45.4 (`Cannot read properties of undefined (reading 'bind')`). Both behaviours were run on node:sqlite and on local D1 under `wrangler dev` 4.156.0 on 2026-11-04: the batch with the held generation committed, the one with a stale generation failed with `CHECK constraint failed: ok = 1` and left no row.
- **Migrations.** `drizzle-kit generate` writes SQL files into `migrations/`; hand-written files hold what Drizzle cannot express (FTS5 tables, triggers). The deploy script applies them with `wrangler d1 migrations apply`; the container applies the same files at start and records them in a `d1_migrations` table of the same shape (`wrangler d1 migrations apply DB --local` creates that table with the columns that `src/targets/node/database.ts` creates, checked on 2026-11-04 with wrangler 4.156.0). Local runs use `--local --persist-to <dir>`, which needs no Cloudflare login or `database_id`. A migration only adds; a removal waits for a later release, so the previous release still runs on the new schema (see CI, releases and rollback).
- **Search.** FTS5 external-content tables kept in step by triggers; D1 supports FTS5 (D1 docs, SQL statements). Searchable text lives in `search_parts`, one row per part of an Item: the title, each post-text chunk, each Kept comment, the Summary, the Tags, each Highlight and the Note. A part longer than 500,000 bytes is split into chunks, so no search row nears D1's 2 MB row limit. A query matches parts and groups them by Item; the Highlights page queries only Highlight and Note parts. Related Items candidates come from the same index, ordered by `bm25()` ascending, because a lower `bm25` score is a better match (SQLite FTS5 docs). The app rewrites an Item's parts in the same batch as the change to that part.
- **Large text.** A post text, comment body or AI task input over 1,000,000 bytes is stored as an object in the file store, and its row holds the key; the same rule runs on both targets, so no single value nears the 2 MB limit.
- **D1 limits that shape queries:** 100 bound parameters per statement, 1,000 queries per invocation on the paid plan, 2 MB per row, 50 MB per query result (D1 docs, Limits). A list whose length the data decides is bound as one JSON parameter and expanded with `json_each`; large reads page by key.
- **Numbers.** D1 returns numbers as JavaScript numbers, so an integer above 2^53 loses precision (D1 docs, Import and export data). X post ids are above that, so every id that comes from a Source is `text`.

Evidence, a spike on 2026-11-04 (scratch folder, not in the repo): one schema and one query module ran unchanged on `node:sqlite` (Node 26.11.1, SQLite 3.53.3), on Bun 1.4.3 (SQLite 3.53.4) and on local D1 under `wrangler dev` (wrangler 4.156.0). All gave the same results for an upsert by URL, FTS5 with porter stemming and prefix queries, triggers that follow an update and a delete, a cascade delete, and a `batch` whose second insert broke a unique index and left no row behind. D1 refuses `sqlite_version()`.

## Data model outline

Names follow `CONTEXT.md`. Columns are settled during the build.

| Table | Holds |
|---|---|
| `items` | Source, Source id (text), normalized URL (unique), original URL, author, community (the subreddit), posted and saved dates, the date the content was last fetched, title, post text as Markdown, status (`processing`, `ready`, `failed` with reason), Read state |
| `comments` | per Item: Source id (text), parent id, author, date, body as Markdown, Kept flag; dropped parents of Kept comments and Reddit's unfetched `more` stubs render as Context stubs |
| `media` | per Item: file key or video URL, kind, size |
| `digests` | per Item: the Digest JSON, Provider and model, created date |
| `topics`, `tags`, `item_tags` | the agent's lists and the links; `catalog_version` counts changes to the Topic and Tag lists |
| `topic_pages` | overview text, its revision, and the ids of the Items it was built from |
| `related_items` | Item pair and one-line reason |
| `log_entries` | every agent action |
| `proposals`, `pins` | weekly Proposals with their state; accepted corrections |
| `highlights`, `notes` | owner text; a Highlight stores its target (post text or a comment id) and a text-quote anchor: the exact text plus a short prefix and suffix, as in the W3C Web Annotation `TextQuoteSelector` |
| `search_parts` | FTS5 source rows and their FTS table |
| `owner`, `sessions`, `agent_tokens` | login and access |
| `settings` | server-side settings; secrets in it are encrypted |
| `jobs`, `leases`, `scheduled_runs`, `guards` | the job runner with each job's claim, the leases with their generation, the schedule claims, the guard table of guarded batches |
| `ai_tasks` | one row per AI task: kind, inputs, input revision, executor, attempts, deadline, state, result |
| `imports`, `exports`, `restores` | cursors and checkpoints of long runs |
| `mirror_paths` | vault paths waiting to be written, each with a sequence number |

- Post text and comments are stored as Markdown, which Defuddle can return directly. The Reader renders Markdown without raw HTML, so other people's posts never reach the page as HTML, and the export and the Vault mirror reuse the stored text.
- A refresh re-anchors each Highlight by its quote, prefix and suffix; a Highlight whose quote is gone keeps its text and is marked as no longer found (`docs/spec.md`, Highlights and Notes).

## Files

One `FileStore` port: `put` from a stream of known length, `get` as a stream with an optional byte range, `delete`, `list` by prefix with a cursor, and a multipart upload for a file whose length is not known up front (R2 needs a known length for a streamed `put`, and every multipart part but the last must be at least 5 MiB; R2 docs, Workers API and multipart uploads). The container writes under `/data/files`; Cloudflare writes to an R2 bucket. Keys are `items/<item id>/<file>`, so deleting an Item deletes one prefix. Images are stored as fetched. No resizing: it would need two image paths (an Images binding on Cloudflare, a native library in the container) for a feature the spec does not ask for.

## Jobs, leases and the schedule

- **Jobs.** Each step that waits on the network (fetch, an AI task, a wiki step, a Vault mirror write, a Grok Bot webhook, a slice of an export or restore) is a row in `jobs` with its state, attempts and next attempt time. The same `runJob` code runs on both targets. On Cloudflare a Queues message carries the job id, with `max_batch_size: 1`, so one invocation runs one job; in the container an in-process loop picks due rows. The row, not the message, is the source of truth: a lost message, a discarded retry or a restart loses no work, because the sweep re-queues due rows.
- **One run per job.** A runner starts a job only by claiming its row: `UPDATE jobs SET state = 'running', claim_expires = now + deadline + 2 minutes WHERE id = ? AND (state = 'queued' OR claim_expires < now) RETURNING id`. A second message for the same job, or a sweep that re-queues it, finds no row to claim and stops. The sweep re-queues only rows whose claim has expired.
- **Deadlines.** Each job runs under a deadline below the 15 minutes of wall time a Queues consumer gets (Workers docs, Limits): an AI call gets 10 minutes, a fetch 2 minutes, an export or restore slice 10 minutes. Every network call in the job carries an `AbortSignal` for the deadline. A job past its deadline fails its attempt and is retried by its row. The consumer sets `limits.cpu_ms` to 300,000, the Workers Paid maximum, because a Queues consumer gets 30 seconds of CPU by default (Workers docs, Limits).
- **Leases with a generation.** A lease is a row with a holder, an expiry and a generation number that grows on every claim. Its expiry is the job's deadline plus 2 minutes, so a job that runs to its deadline still holds it. A job that writes under a lease commits in a guarded batch (see Database and search) whose guard checks that its generation still holds the lease and that the record it read is still at the revision it read; otherwise nothing is written and the job retries on fresh inputs. Jobs that need two leases, such as merging two Topics, claim them in Topic id order.
- **One update at a time per Topic.** Each wiki step for a Topic holds that Topic's lease while it reads, calls the executor and writes. This is the spec's rule against near-duplicate pages from parallel updates (`docs/spec.md`, The library wiki). With Grok Bot, the call returns later through a callback, so the step releases the lease after sending; applying the result is its own step that takes the lease again (see AI tasks and Providers).
- **New Topics and Tags.** A Digest job reads `catalog_version` with the Topic and Tag lists it gives the model. When its Digest reuses only existing names, it publishes at once, so an Import is not serialized. When it creates a Topic or a Tag, its publishing batch is guarded on `catalog_version` still being the version it read; when the guard fails, the job asks the model again with the new lists. A unique-index conflict on a new name means another job created the same name first, and the job reuses that name. After two retries the job waits with backoff instead of publishing against an old list, because the spec allows no near-duplicates (`docs/spec.md`, Decisions, Tags).
- **Schedule.** One tick, every minute, claims each due task in `scheduled_runs` and enqueues jobs: one per Topic the weekly checks touched, one per import and Grok Bot cursor, and the sweep. The tick calls no model, because a Cron Trigger under an hourly interval gets 30 seconds of CPU (Workers docs, Limits). Cloudflare calls the tick from a Cron Trigger; the container calls it from a timer.

## Fetchers

Each Source has one fetcher behind a `Fetcher` port: `matches(url)` and `fetch(url, ctx)` returning Item content, comments and media.

- **Article:** a plain `fetch`, then Defuddle on a linkedom document, with Markdown output. Its CPU cost is why the Cloudflare target needs Workers Paid (see Cloudflare deploy button). No Browser Rendering: pages that need JavaScript or a login come in through the Extension.
- **GitHub:** the GitHub REST API, with an optional token in settings for the higher rate limit.
- **Reddit:** oEmbed for the title, author and subreddit, and one `.json` parser for the `.json` paste, the JSON the Extension sends and the account fetch; the Extension's Defuddle content when its `.json` request failed. A `more` stub becomes a Context stub. In the self-hosted builds a link without Extension content goes to the archive fill: Arctic Shift's comment tree passes through a thin adapter (Arctic's top level is `{"data":[t1 nodes]}`, not Reddit's two Listings, while nested `replies` are Listings) into the same parser, so no second parser exists. Arctic's rate limit is respected and a 429 is retried once after `X-RateLimit-Reset`, at most 10 s; the Item stays Link-only otherwise. In the container, a connected account fetches `<thread>/.json?limit=500&raw_json=1` with the platform `fetch` and the `reddit_session` cookie, only after Arctic fails or lacks the thread, and follows `/s/` redirects; no browser-impersonating client, because plain `fetch` got HTTP 200 (`docs/spec.md`, Fetchers).
- **X:** the Grok Bot intake webhook on both targets; the grok CLI in the container. `grok --json-schema` returns the parsed result in a `structuredOutput` field (grok 1.0.70, run on 2026-11-04). On Cloudflare without a Grok Bot webhook, an X link becomes a Link-only Item.
- **Other:** a Link-only Item with the page's `<title>` or its oEmbed title, and no AI task, because there is no text to digest.
- **One hop:** only when the linked URL is an article or a GitHub repository.
- **Plug-ins (container only):** a self-hoster's fetcher is an ES module that exports the same `Fetcher` shape. The container loads every module listed in `THREADSIFT_FETCHERS` at start. The Cloudflare bundle is built from the repository, so a plug-in there means a fork.
- **URLs:** one normalizer (lower-case host, no `www.`, tracking parameters dropped, short links followed) gives each Item its identity.
- **Private addresses.** A pasted link, a one-hop link or a redirect could point a fetcher at the server's own network, and the page would then be stored, served over MCP and mirrored to GitHub. So every request the server sends to a pasted address goes through one function, `guardedFetch` (`src/core/fetch-guard.ts`), which follows redirects by hand and checks each hop before it connects. The `Network` port makes one request per call without following redirects: the container's adapter is `node:http` and `node:https`, the Worker's is the global `fetch` with `redirect: "manual"`.
  - **Address rules.** `src/core/addresses.ts` allows a literal address only when it is global unicast and outside every block of the IANA special-purpose registries whose Globally Reachable value is not True, plus multicast and the reserved IPv4 block. It also refuses `2002::/16` (6to4), where an IPv4 address is embedded, decodes the IPv4 address embedded in `64:ff9b::/96` (RFC 6052), and refuses `64:ff9b:1::/48` whole, because the registry marks it Globally Reachable False and RFC 8215 leaves its prefix length and layout to the operator. Blocks whose registry rows hold a True sub-block (`192.0.0.0/24`, `2001::/23`) are refused whole, so the PCP, TURN and DNS-SD anycast addresses are refused too. The WHATWG URL parser turns `2130706433` and `0x7f.1` into `127.0.0.1` before the check, and `localhost` and every name under `.localhost` are refused by name (RFC 6761).
  - **Container.** The adapter passes a `lookup` function to `http.request`, so the check runs on the addresses the connection will use and the name is never resolved a second time. A name such as `localtest.me`, which resolves to `127.0.0.1` in public DNS, is refused after it resolves, so the link is saved without a title. A Worker deployed on Cloudflare's network cannot reach the owner's network, so there the check covers literal addresses and `localhost` only. The local Worker under `wrangler dev` runs on the owner's machine and has the same check, so the name check is missing there (see Open items).
  - **Limits.** Every hop has an 8 s deadline from the lookup to the last body byte, 20 redirects are followed (the Fetch standard's own limit) and the body is cut at 512 KiB after content decoding; the deadline and the cap are our choices, not a source's. The adapter passes `autoSelectFamilyAttemptTimeout: HOP_DEADLINE_MS` to `http.request`, so no connection attempt ends the hop before the deadline (Node 26 docs, `socket.connect(options)`: each attempt but the last gets that time before Node tries the next address, 250 ms by default). A connection that never answers and a body that stalls after the connection is open both run to the 8 s deadline on both targets. `guardedFetch` through `nodeNetwork` to `http://example.com:81/` (4 addresses, Node 26.12.1) answered `timeout` after 1003 ms without the option and after 8041 ms with it.
  - **What a hop may reach.** A redirect to a Reddit or X link stops without a request, so the oEmbed-only and X no-request rules (`docs/spec.md`, Decisions, Reddit) hold for a short link or a redirect. A short link (`SHORT_LINK_HOSTS` in `src/core/links.ts`) is the only kind of redirect that changes an Item's identity: its final or stopping URL becomes the Item's URL, and a short link that fails, or ends on a status outside 2xx, stays the Item's URL. Any other redirect only decides where the title comes from, so a redirect to a Reddit or X link leaves the pasted URL as the identity and the answer is `redirect-stopped`. A hop that is not an `http` or `https` URL answers `unsupported`, and a hop to an address that is not globally reachable answers `refused`. The 21st redirect answers `redirect-limit` even when it points to Reddit or X. A link whose Source allows no request (an X post, a Reddit link that is not a post or a comment) answers `not-requested`. A final dot on a host (`x.com.`) is dropped before any of these rules and before the Item's identity is built.
  - **Meta refresh.** A page from a short link host that ends the chain as HTML and holds a `<meta http-equiv="refresh">` with a delay of 0 counts as one more redirect (`src/core/meta-refresh.ts`, the HTML standard's [shared declarative refresh steps](https://html.spec.whatwg.org/multipage/document-lifecycle.html#shared-declarative-refresh-steps), read 2026-11-05): the URL resolves against the page's URL, goes through the same address, Reddit and X, `http(s)` and 20-redirect checks, and a page on any other host is never followed this way. tinyurl.com needs it: it answers an old link with a 301 or with a 302 to `/preview/deprecated/<id>`, a 200 HTML page whose head holds the refresh (`curl` and a probe through `nodeNetwork.get`, 2026-11-05).

## AI tasks and Providers

Every model call is an AI task with a kind, inputs, an input revision and a Zod result schema. The kinds are `digest`, `topic_overview`, `related_pick` and `proposals`. The core creates the task row, an executor runs it, and the core checks the result against the schema and the rules before it applies it. A result whose input revision is no longer current is not applied; instead the core queues the same step again over the current inputs, so no Item's Digest is left out of a Topic overview.

| Executor | Provider rows it serves | Targets | How it runs a task |
|---|---|---|---|
| HTTP | OpenRouter (key or Connect), Anthropic, OpenAI and xAI keys, an OpenAI-compatible URL | both | AI SDK `generateText` with `output: Output.object({ schema })`; the AI SDK maps the schema to each vendor's structured-output dialect |
| Workers AI | Workers AI | Cloudflare | `env.AI.run(model, { messages, response_format: { type: "json_schema", json_schema } })`; the model list is the JSON-mode list on Cloudflare's Workers AI docs |
| CLI | Claude Code, Codex, Grok on the server | container | `claude -p --output-format json --json-schema`, `codex exec --output-schema`, `grok --json-schema --output-format json`, in an empty folder with tools off; reads `structured_output`, the last message or `structuredOutput` |
| Grok Bot | Grok Bot | both | asynchronous, below |

- **Grok Bot runs every AI task when it is the Provider** (owner's decision, 2026-11-04). Threadsift posts `{task id, kind, inputs, input revision, result schema}` to the bot's webhook with the stored key; the bot wakes, writes the result and posts it to `POST /api/ai-tasks/:id/result`. The bot's skill files in `bot/` hold the same contract. Whether the bot writes good wiki results is unverified until a live run.
  - **Who may answer.** Only the agent token the owner connected as Grok Bot may post a result; any other token gets 403.
  - **X links.** A `digest` task for an X link closes through `POST /api/items`, which carries the content the bot fetched, its Digest and the task id, as `docs/spec.md` (Grok Bot, flow C) describes. Either route closes the task by its id.
  - **Duplicates and late answers.** A result for a task that is already closed gets 409 and changes nothing. A result for an open task whose input revision has moved is handled like any stale result: the step is queued again.
  - **Deadline.** A Grok Bot task gets one hour (a chosen value, because the bot wakes in seconds to tens of seconds by its own estimate). At the deadline the task is sent again, up to 3 attempts; after that it fails, the Item or Topic shows the failure with Try again, and the Log records it. There is no silent fallback to another Provider, because the owner picks one.
- **Without Grok Bot,** every task runs on the Provider the owner picked, on that target's executor. Nothing in the core knows which executor ran a task.
- **OpenAI-compatible URL on Cloudflare** must be a public HTTPS address, because the Worker runs on Cloudflare's network, not in the owner's home. Ollama on the owner's machine works from the container.
- **Workers AI is called through the binding, not through a package.** Cloudflare deprecated `workers-ai-provider` for `createAI` from its `agents` package (npm deprecation notice), and `agents` 0.33.0 is 10.8 MB unpacked with 11 dependencies, Babel and Rolldown plugins among them. The trade-off is one structured-output dialect we write and test ourselves.
- **OpenRouter Connect** is OpenRouter's PKCE flow; the returned key is stored like any other key.
- **"Verify"** in settings runs one real `digest` task through the same path.

## Access: owner login, agent tokens, MCP

- **Setup.** A new Instance shows a setup page that always asks for the one-time `SETUP_CODE` first, then for a new password and, optionally, an export zip to restore (see Export, backup and restore). On Cloudflare the deploy button prompts for `SETUP_CODE` and `THREADSIFT_SECRET_KEY` as secrets; in the container both are environment variables, and a missing `SETUP_CODE` makes the container print a generated one in its first-start log. Without the code, anyone who finds a fresh public Instance could claim it.
- **Owner login.** The password is hashed with scrypt from `node:crypto`, which both targets have, at N=2^15, r=8, p=3, one of OWASP's Password Storage settings, with `maxmem: 64 MiB`. Node's default `maxmem` of 32 MiB rejects those settings (`ERR_CRYPTO_INVALID_SCRYPT_PARAMS`, Node 26.11.1, run on 2026-11-04). The OWASP default N=2^17 needs 128 MiB, the whole memory of one Worker. A session is a random id in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie, stored hashed in `sessions`; Hono's `csrf` middleware guards form posts.
- **Agent tokens.** One random token per connected agent, shown once, stored as a SHA-256 hash, revocable in settings. The Extension, Grok Bot and MCP clients use them as bearer tokens. The token the owner connects in the Grok Bot settings is marked as Grok Bot's, and only it may post AI task results.
- **Secrets at rest.** Provider keys, the Grok Bot webhook key, the vault token and the owner's Reddit session cookie are sealed with AES-GCM (WebCrypto, on both targets) under `THREADSIFT_SECRET_KEY`, which the app reads from its environment and never shows.
- **Request limits.** Hono's `body-limit` middleware caps request bodies on both targets, because Node has no cap of its own and Cloudflare's cap depends on the zone's plan (100 MB on Free and Pro, Workers docs, Limits).
- **MCP.** `createMcpHandler` from `@modelcontextprotocol/server` serves Streamable HTTP at `/mcp` on both targets; its SDK documents that web-standard handler for Workers. The handler checks no token itself (MCP SDK reference, `createMcpHandler`), so a Hono middleware hashes the bearer token, rejects a miss, checks Host and Origin, and passes the caller as `authInfo` to `handler.fetch`. Each tool calls the same core function as the matching HTTP route. OAuth for Grok Bot's catalog comes later (`docs/spec.md`, Grok Bot).

## Web app

- A React 19 single-page app built by Vite (owner's decision, 2026-11-04). One static build serves Workers static assets and Hono's `serveStatic` on Node, and it is the shape Tauri and Capacitor take for a later desktop or mobile app. No server rendering: one owner behind a login gains nothing from it.
- React-specific libraries stay few, so the app can try Preact 11 through `preact/compat` after the first release if page weight matters: in a small comparable build, React's framework JavaScript was 68.0 KB gzip and Preact's 7.7 KB (measured 2026-11-04 in a scratch build, not on this app).
- The prototype is Claude Design's own template format on React 18 classes, so the app rewrites it. Its behaviour (reader bar fitting, folding by measured height, reading-place restore, the keys) is plain DOM code and becomes plain TypeScript modules that take an element. Highlights are drawn with the CSS Custom Highlight API.
- `design/system/tokens.css`, `components.css` and `settings.js` stay the one source of values and settings. The build reconciles them with the spec first: `settings.js` gains the Style row (attribute `data-style`, default Library, a Look setting that Reset look covers) and the Text size row (attribute `data-size`, Small, Medium and Large, default Medium, a Look setting in the Reading group), with one `[data-size]` block per option in `tokens.css` that scales the reading size and keeps Small at 12px or more, its Theme default follows the spec's "with no setting stored, the app draws Light", and the 10 Style blocks move from `design/prototype/tokens.css` into `design/system/tokens.css` with their theme selectors rewritten from classes (`.th-dark`) to `[data-theme]`. `checkDefaults()` confirms the table and the tokens agree.
- `tokens.css` no longer imports Google Fonts. `web/src/main.tsx` imports the IBM Plex Sans and IBM Plex Mono files from Fontsource, so a self-hosted Instance makes no third-party request. The other four font pairs join with the Font setting.
- Static files answer the same on both targets: `index.html` for a path whose last segment has no `.`, `404` for any other path that matches no file, so `/favicon.ico` and a missing `/assets/x.js` are not HTML. Workers' `single-page-application` mode cannot do this: it answers every unmatched path with `index.html` and `200` (Workers docs, Static Assets, Single Page Application, Configuration; `wrangler dev` 4.156.0 answered `/favicon.ico` and `/assets/nope.js` with `200 text/html`). The Worker therefore leaves `not_found_handling` unset, gets the `ASSETS` binding, and serves `/` itself for a `GET` or `HEAD` of a path without an extension (`src/targets/worker/index.ts`). `run_worker_first: ["/api/*"]` makes the Worker answer `/api/*` before any static asset (Workers docs, Static Assets, Routing, Worker script), and `isApiPath` (`src/http/document-path.ts`) sends the bare `/api` to the API too. The Node entry does the same with `isDocumentPath` (`src/http/document-path.ts`).
- Caching: hashed `/assets/*` are `public, max-age=31536000, immutable` and `index.html` is `no-cache`. The Node entry sets them in `src/targets/node/index.ts` and compresses with Hono's `compress` middleware. On Workers the platform compresses, and `web/public/_headers` carries the same two rules (Workers docs, Static Assets, Headers); that file also reaches `dist/web`, so the Node entry answers `/_headers` with the page and never serves the file. `/index.html` redirects to `/` on both targets (`307`).
- The paste card polls `GET /api/items/:id` until the Item is ready or failed; no websocket, so both targets serve it the same way.
- The PWA is a web manifest with `share_target` and a small service worker, both hand-written.

## Extension and Threadsift bot

- The Extension is built with WXT for desktop Chrome and Firefox (Manifest V3) and posts to `POST /api/items` with an agent token. It saves one page per click and never crawls.
  - **Reddit.** On Save it requests `<thread>/.json?limit=500&raw_json=1` once from the owner's tab and posts the JSON as the content; the server's `.json` paste parser reads it. Replies behind a `more` stub are not requested: `/api/morechildren` answered 403 to the signed-in session (owner's browser, 2026-11-04), and a request per stub would be crawling. When the `.json` request fails, the content script runs Defuddle's Reddit extractor on the rendered thread and posts `{url, content}`.
  - **Connect Reddit (container).** The button reads the `reddit_session` cookie through the `cookies` API, which needs the `cookies` permission and host permission for reddit.com (Chrome Extensions docs, chrome.cookies), and sends its value and `expirationDate` to the Instance with the agent token. Whether the API returns the `HttpOnly` cookie in Chrome and Firefox is checked when slice 40 is built.
  - **Fill when opened.** On a Reddit thread, the Extension asks `GET /api/items?url=<thread link>`, which matches by normalized URL, whether it is a Link-only Reddit Item, and if so saves it as above. Nothing fills in the background.
  - **Other pages.** The content script runs Defuddle on the page and posts `{url, content}`.
- The Threadsift bot's skill files live in `bot/` and call the same HTTP API and the AI task callback. The OpenAPI document from `@hono/zod-openapi` is their contract.

## Vault mirror

- **Git mode, both targets:** commits through GitHub's REST API (create blobs, a tree and a commit, then move the branch ref), with a fine-grained token that can write the contents of one repository. Workers has no `git` binary, and one code path keeps both targets the same. The owner chose this on 2026-11-04; v1 mirrors only to a vault repository on GitHub.
- **Folder mode, container only:** writes the same files into a mounted vault folder.
- **What triggers it.** Every change to a mirrored file's content adds its vault paths to `mirror_paths` with a new sequence number, in the same batch as the change: a new, refreshed or deleted Item; a new Digest; a Read state change; a Highlight or a Note; a Topic page; a Related Item; a Log entry; the Index, whenever a Topic's count or overview line changes; and an accepted Proposal, which rewrites every note whose Topic or Tags it renames or merges. One mirror job drains the table and writes the latest state of each path, so later wiki changes reach the vault too. When it is done it deletes only the rows up to the sequence number it read for each path, so a change that arrived while it ran stays queued.
- **One writer.** The mirror job holds the single `vault` lease and checks its generation again right before it moves the ref or writes the folder; a job that lost the lease stops without writing. It moves the ref without `force`; when GitHub rejects the update because the branch moved, it rebuilds the commit on the new tip. A writer that loses its lease between that check and GitHub's answer can still land one stale commit; the next drain rewrites those paths from current state, so the vault converges.
- **GitHub's limits.** Text files go inline as `content` in the tree; only images become blobs. One commit holds at most 500 paths (a chosen value), so a large Import mirrors in several commits. On 403 or 429 the job waits for `Retry-After` and resumes, because GitHub's secondary rate limits restrict content creation (GitHub REST docs, Rate limits). A file over GitHub's 100 MiB file limit (GitHub docs, About large files) is left out of the vault with a line in the Log.

## Export, backup and restore

- The export zip holds one Markdown file per Item with its images, as the spec describes, plus `threadsift.json` with every library record: Items, comments, media (stored images and video URLs), Digests, Topics, Tags and their links to Items, Topic pages, Related Items, Log, Proposals, Pins, Highlights, Notes and the server settings. It leaves out secrets (Provider keys, the Grok Bot webhook key, the vault token), the owner's password hash, sessions, agent token hashes, and the working tables (`jobs`, `leases`, `ai_tasks`, `mirror_paths`), because a restored Instance gets a new password and new tokens and starts with no work in flight. A fresh Instance can restore from it. The same zip is the backup on both targets and moves a library between them. The owner chose this on 2026-11-04.
- **Export** is a chain of jobs. Each slice streams the next Items into a store-mode zip (no compression, so little CPU) as R2 multipart parts of at least 5 MiB, or appends to a file in the container, and saves its checkpoint (the multipart upload id, the parts written, the zip's central-directory entries so far and the last Item id) in `exports` in the same batch as its progress; the next slice resumes from it, so an interrupted export continues instead of restarting. Each Item's records and files are read in the same slice, and while an export runs, file deletions from deleted or refreshed Items wait until it ends, so the zip never lists a file it does not hold. Nothing holds the whole library in memory.
- **Restore** uploads the zip into the file store in parts under 100 MB (an R2 multipart upload on Cloudflare, a plain file in the container), then a chain of restore jobs reads it with ranged reads and writes records in batches, each slice saving its offset and the last record written in `restores`.
- **Why the app writes its own backup:** D1's export does not support databases with virtual tables, and the FTS5 tables are virtual (D1 docs, Import and export data). D1 Time Travel restores a database to any minute of the last 30 days on the paid plan (7 on the free plan) and covers the database only, not R2 (D1 docs, Time Travel).
- A backup list names every table the backup includes; a test migrates a database and fails when a table is in neither that list nor its list of excluded tables.

## Container image

- A `Containerfile` on the official `node:26-slim` image, built for amd64 and arm64 and published to `ghcr.io/kyanitehq/threadsift` with a tag per release. It runs with Podman or Docker. The image is Debian-based, not built by Nix, because the owner's AI CLIs are installed with their vendors' installers, which expect an ordinary Linux root.
- One volume at `/data`: `threadsift.db`, `files/`, and `home/` as the home folder of the app user, where each CLI keeps its login.
- The image ships no AI CLI. Claude Code's licence is "SEE LICENSE IN README.md" (npm, 2.1.318), not an open licence, and the CLIs update faster than the image. The `Containerfile` sets `NPM_CONFIG_PREFIX=/data/home/.npm-global` and puts its `bin` on `PATH`, so the app user can install into the volume without root. The docs show the install command for each CLI (`npm install -g @anthropic-ai/claude-code`, `npm install -g @openai/codex`, the grok installer), run once inside the container, and how to build a derived image instead. CI installs the same packages at pinned versions.
- Public HTTPS comes from the owner's reverse proxy or tunnel; the app listens on plain HTTP inside the container.

## Cloudflare deploy button

- The button is `https://deploy.workers.cloudflare.com/?url=https://github.com/KyaniteHQ/threadsift/tree/release`. It points at the `release` branch, which moves only when a release is cut, so a click never deploys work in progress. Cloudflare provisions the D1 database, R2 bucket, Queue and Workers AI binding named in `wrangler.jsonc` (Workers docs, Deploy buttons).
- `.dev.vars.example` lists the secrets the button prompts for: `THREADSIFT_SECRET_KEY` and `SETUP_CODE`. `cloudflare.bindings` in `package.json` explains each binding on that page.
- `package.json` `deploy` runs `wrangler d1 migrations apply DB --remote` and then `wrangler deploy`.
- The Workers Paid plan ($5 a month) is needed: extracting one 362 KB article page with Defuddle took 236 ms on local workerd (spike, 2026-11-04), and the free plan allows 10 ms of CPU per request (Workers docs, Limits). This is the one place that states the reason; the README says so beside the button.
- **Updates.** The button copies the repository into the deployer's own GitHub account, "where they can continue development after deploying", and writes the provisioned resource ids into that copy's `wrangler.jsonc` (Workers docs, Deploy buttons); nothing pulls later releases into the copy. The repository therefore ships `.github/workflows/update-from-upstream.yml`, which runs only outside `KyaniteHQ/threadsift`, weekly or on demand:
  1. It fetches `refs/heads/release` from `https://github.com/KyaniteHQ/threadsift` and lays that tree over the copy's tree, so it needs no shared history.
  2. It writes the copy's own resource ids back into the new `wrangler.jsonc` by binding name, and lists any new binding in the pull request, because Cloudflare has not provisioned it yet.
  3. It opens a pull request with a fine-grained token the deployer adds as `UPDATE_TOKEN` (contents, pull requests and workflows on the copy), because Actions' own `GITHUB_TOKEN` may not change files under `.github/workflows/`. The deployer merges it; Workers Builds deploys the merge, and the deploy script runs the new migrations. Local changes the deployer made show in the pull request's diff.
  4. When a step fails, the run fails and opens an issue in the copy, so a stuck update is visible.

  Every other workflow in the repository runs only when `github.repository == 'KyaniteHQ/threadsift'`, so a copy runs none of the project's gate or release jobs.

## Development environment

devenv owns everything a contributor or CI runs. A contributor needs Nix, devenv and direnv, and runs `direnv allow` once per clone or worktree; the git hooks and the agent edit hook find Node through that shell.

| devenv feature | Use |
|---|---|
| `languages.javascript` and `packages` | `nodejs_26`, and pnpm through corepack, so the shell, CI and Workers Builds run the pnpm version in `packageManager`. Corepack comes from `pkgs.corepack` built on `nodejs-slim_26`, because nixpkgs' `nodejs_26` (26.12.1) ships no `corepack` binary and devenv's `languages.javascript.corepack.enable` fails to build against it (devenv 2.4.0, 2026-11-04); the override goes once that option builds on `nodejs_26` |
| `processes` with automatic ports | `devenv up` starts the Node server, the Vite web app (proxying `/api` to that server) and `wrangler dev`, each on its own allocated port, in any number of worktrees at once; `devenv processes list` prints the ports |
| `tasks` | the gate: `ci:install`, `ci:check` (`pnpm check`: oxfmt, then oxlint with the type check), `ci:build` (the web build and the Worker size check), `ci:audit`, `image:build`, `e2e:container` and `e2e:worker`. GitHub Actions runs the same tasks |
| `git-hooks` | before each commit, `oxlint --fix` and `oxfmt` on the staged files; before each push, `pnpm check` |
| `enterTest` | `devenv test` installs the packages, runs the commit hooks on every file, then runs `ci:check` |
| `packages` | Playwright browsers pinned from nixpkgs (the npm `@playwright/test` version must match `playwright-driver`), podman, jq, `gh`. The host has no `/etc/containers/policy.json`, so `podman pull` and `podman build` fail there; `image:build` passes `--signature-policy` with the file in `THREADSIFT_PODMAN_POLICY` (podman 5.8.9, 2026-11-04) |
| `secretspec` | declares the live-test secrets (OpenRouter key, `CLAUDE_CODE_OAUTH_TOKEN`, a Cloudflare token for Workers AI): environment variables in CI, a local provider on the owner's machine |

## Lint and format

oxlint and oxfmt run directly, not through Vite+. Vite+ 1.5.0 bundles the same oxlint and oxfmt, but its docs advise against `oxlint.config.ts` and `.oxfmtrc.json` and document only `--fix`, `--type-aware` and `-c` for `vp lint` (viteplus.dev/guide/lint, read 2026-11-04). Direct use keeps every oxlint flag and lets oxlint update on its own schedule. `oxlint.config.ts` and `.oxfmtrc.json` hold the rules; what they cannot show:

- **No separate `tsc` step.** `options.typeCheck` makes `oxlint-tsgolint` report TypeScript errors with the lint, and it needs TypeScript 7.
- **Rule plugins in `tools/oxlint/`.** `anti-slop/` is dmmulroy/anti-slop, vendored (its `UPSTREAM.md`). `threadsift/` holds `no-comments` (`docs/agents/changing-code.md`, No comments). Anti-slop's `require-safety-comment-for-type-assertion` and its two assertion rules are off, because `typescript/consistent-type-assertions` set to `never` bans the assertion itself, and the safety rule would ask for a comment.
- **Only safe fixes run unattended.** The commit hook and the agent hook (`.claude/hooks/lint-fix.sh`, after each edit to a file in the project) apply safe fixes; suggestion fixes run only through `pnpm lint:fix`, whose diff the agent reads.
- **Markdown is not formatted.** oxfmt pads every table column to its widest cell, so a one-cell change in a doc would rewrite the whole table.
- **`design/` is not linted yet.** Its prototype is reference code, and `design/system/settings.js` still carries comments and gets rewritten when the web app starts (Web app); it joins the lint with that change.

## Dependency updates

Renovate, the GitHub App, is the one update bot; `renovate.json` holds its rules.

- **Schedule.** Every minor and patch npm update arrives in one PR on Monday morning (Istanbul time); each major gets its own PR, except that `oxlint` and `@oxlint/plugins` always move together, because they must share one exact version. Lock file maintenance refreshes the indirect packages on the first day of each month. The Dependency Dashboard issue lists every pending and waiting update, so it is where an update is noticed. Renovate never merges on its own.
- **Release age.** Renovate proposes an npm version only once it is 3 days old, the same wait as pnpm's `minimumReleaseAge` in `pnpm-workspace.yaml`, so a PR never asks for a version pnpm refuses.
- **Security.** GitHub's Dependabot alerts and the OSV database feed Renovate's security PRs, which open at any time and skip the wait (Renovate docs, `vulnerabilityAlerts`, read 2026-11-04). A fix younger than 3 days still fails pnpm's install, so that PR also adds the package to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`. Dependabot's own version and security PRs stay off, because both bots would open a PR for the same bump.
- **Local check.** `pnpm outdated` lists the npm updates before Renovate's next run. `devenv.lock` moves through `.github/workflows/update-devenv-lock.yml`, weekly or by hand, because Renovate's `nix` manager reads only `flake.nix` and is still in beta (Renovate docs, Nix manager, read 2026-11-04). The workflow runs `devenv update`, opens a pull request and approves the `pull_request` run of `gate` on its head through the REST endpoint for approving a workflow run, because a pull request that `GITHUB_TOKEN` opens holds its `pull_request` runs for approval (GitHub docs, Triggering a workflow from a workflow, read 2026-11-04). A `gate` started with `workflow_dispatch` instead passed but left the pull request blocked on `main`'s required check while the held run waited (a throwaway pull request, 2026-11-04). The approve endpoint needs the Actions write permission, which the job's `actions: write` gives its `GITHUB_TOKEN` (GitHub REST docs, Permissions required for GitHub Apps, read 2026-11-04). It needs the repository setting that lets Actions create pull requests.

## CI, releases and rollback

- **Gate.** GitHub Actions runs the devenv tasks as parallel jobs on every pull request and every push to `main`: `ci:check` (format, lint and type check), build (with a check that the Worker bundle stays under 64 MiB uncompressed, the Worker size limit on both plans; Workers docs, Limits, read 2026-11-04), `impeccable detect --github` on `web/`, `pnpm audit --prod --audit-level high`, and the end-to-end suite on each target. The pnpm store is cached; a failed end-to-end job uploads the Playwright report.
- **Docs-only changes.** When every changed path matches `docs/**` or a root `*.md` file, the end-to-end jobs skip themselves with a job-level `if:`; `ci:check` and the build still run. A path outside that list runs every job, so a file missing from the list costs a longer run, never a skipped check.
- **Merging.** `main` requires one aggregate `gate` job that needs every other job and passes when each passed or skipped itself; a workflow-level `paths` filter is not used, because a workflow it skips leaves its required checks pending. Renovate opens dependency updates after a 3-day wait.
- **Secrets and forks.** A pull request from a fork gets no secrets, and a rerun does not change that (GitHub Actions docs). The AI jobs are skipped on fork pull requests; after reading the change, a maintainer pushes it to a branch in the repository, where the AI jobs run. `pull_request_target` is not used, because it would run the fork's code with the secrets.
- **Releases.** A release tag builds and publishes the image with that tag and moves the `release` branch to it.
- **Rollback.** The container rolls back by running the previous image tag. Cloudflare rolls back with `wrangler rollback` to the previous Worker version. Both work because a migration only adds and the previous release still runs on the new schema.

## Testing

`docs/testing.md` is the project's testing policy: no fakes and no replayed recordings; each claim is proven through the real app the way the owner or an agent reaches it.

- **One suite, two targets.** Playwright runs the same `e2e/` suite against the container image (built and started with Podman, real `node:sqlite` and a real folder) and against the Worker under `wrangler dev`, which runs Cloudflare's own workerd with local D1, R2 and Queues. The target's script (`tools/e2e/container.sh`, `tools/e2e/worker.sh`) gives the suite its base URL and the command that restarts the target in `THREADSIFT_BASE_URL` and `THREADSIFT_RESTART`, so the app has no restart route. Tests reach the app through the UI, `POST /api/items`, `GET /api/items` and `/mcp`, and check what the owner sees: Source, Kept comments and Context stubs, Digest fields, search and filters, Read state, Highlights and Notes, and what survives a restart.
- **Hard cases the suite owns,** each brought about through a real route:
  - an export and a restore of a library larger than 100 MB on both targets, each stopped mid-run (the container restarted, the local Worker restarted) and resumed from its checkpoint;
  - a client that disconnects in the middle of a file download and of an MCP stream on the container (Hono's Node adapter has open streaming issues 407, 411 and 388);
  - two `POST /api/items` calls at once, each carrying a ready Digest that names the same new Tag, which must leave one Tag;
  - a Grok Bot result posted for a task whose input revision has moved, which must not be applied and must queue the step again, and a second result for a closed task, which must get 409;
  - many Item changes while a mirror job runs, after which the vault matches the library.

  Lease expiry itself has no real route that a test can time. The guarded batch it relies on was run in the spike (Database and search, Guarded batches); expiry inside the app stays listed under Open items.
- **Real sources.** Fetcher tests call the live GitHub API, live article pages, Reddit's oEmbed and Arctic Shift, and assert on the shape of the result (title present, Markdown text of some length, the repository's stars as a number), not on text that changes. The link tests use pages that do not change: example.com, three is.gd short links created once through is.gd's API (to an article, a Reddit post and an X post; two tinyurl.com links made the day before already answered with tinyurl's `/preview/deprecated/` page), one old Reddit post with two of its comments, and the `KyaniteHQ/commonplace` repository, which GitHub redirects to `KyaniteHQ/threadsift`.
  - **Reddit's rate limit.** `e2e/reddit.ts` spaces the pastes that send an oEmbed request by 2 s. One run of the suite makes 23 such requests (the `reddit-oembed` annotations of the Playwright report). The oEmbed endpoint sends no rate-limit header; 25 requests at one a second all answered 200 on 2026-11-04.
  - **The listener.** The refusal tests start an HTTP listener in the network the app runs in, through `THREADSIFT_APP_EXEC` (empty for the Worker, `podman exec -i <container>` for the container), and send it a control request from the same network first, so its later silence means a refusal and not a wrong address.
  - **The redirectors.** httpbin.org's `/redirect-to` answers 403 to a target on an internal address (`Forbidden redirect target: redirect target is an internal address`, 2026-11-04), so the refusal tests redirect through httpbin.dev, which redirects anywhere, and httpbin.org serves the redirect chains, the stalled body and the encodings.
- **Real AI.** The owner chose real models with secrets the owner supplies (2026-11-04).

  | Executor or Provider | In GitHub Actions | Before each release |
  |---|---|---|
  | HTTP through OpenRouter | one cheap model through a key with a credit limit | same |
  | Claude Code CLI | `claude -p` with `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`; Claude Code's docs offer that token "for CI pipelines, scripts, or other environments where interactive browser login isn't available" | same |
  | Workers AI | one JSON-mode model through `wrangler dev` with a Cloudflare token, because Workers AI has no local simulation and always runs remotely (Workers docs, Development and testing) | same |
  | Anthropic, OpenAI, xAI keys and an OpenAI-compatible URL | not in CI | one `digest` and one `topic_overview` task each, with the owner's keys; a row without a key is reported as unverified |
  | Codex CLI | not on the owner's ChatGPT plan: OpenAI's CI guide says "Do not use this workflow for public or open-source repositories" (`learn.chatgpt.com/docs/auth/ci-cd-auth`) | on the owner's machine |
  | Grok CLI and the grok X fetcher | only if an `XAI_API_KEY` is added; xAI's docs pair CI with that key | on the owner's machine |
  | Grok Bot | not in CI | every AI task kind through the owner's bot |

- **Live-only paths, run before each release:** the Extension on a Reddit thread in a signed-in browser, the owner's Reddit account fetch with a throwaway account's session, X through the grok CLI and through the owner's Grok Bot, and one deploy through the real button to a scratch Cloudflare account, followed by an update through `update-from-upstream.yml`. Until a release run covers them, these stay unproven, and the README's test notes say so.
- **Design checks:** the round-7 review checks (contrast in every theme, accent and Style; no text under 12 px; 44 px targets under 480 px; no sideways scroll; no reader bar overlap at any font; Library's default tokens unchanged) run in Playwright against the built app at 390, 600, 1440 and 1920 px.

## Open items and unverified claims

- Not verified by a real run in slice 1: two saves of one link at the same moment (neither local runtime interleaves two requests between the lookup and the insert, so 20 simultaneous saves pass even when `saveItem` looks the link up before inserting it without a conflict clause; deployed D1 can interleave them, and the conflict clause in `src/core/items.ts` covers that); the tie-break of `GET /api/items` on `id` when two Items share a saved date (a run cannot force two saves into one millisecond, and reversing the tie-break passes the whole suite); the focus that Try again leaves on the list (the real API cannot be made to fail on demand, so a scratch run with Vite proxying to a stopped server showed it); the loading skeleton and its height (on screen for milliseconds, shown by a scratch run that delayed the real response). No fake stands in for any of them.
- Not verified by a real run for link titles and the fetch guard: a meta refresh that leads to a private address, to Reddit or X, or past the 20th redirect, and one with a delay above 0 (no short link service serves one on demand, so these paths share the guard's redirect code and no run reaches them separately); a page whose `<title>` sits after the 512 KiB cap (no stable public page has one); a remote title that changes between two Pastes of one URL(no public page changes its title on demand, and a fixture the suite could edit needs a credential the gate does not have); the paste box's notice for `unreadable` (no real route makes Reddit's oEmbed answer something other than the expected JSON) and its notice for `failed` (the real API cannot be made to fail on demand); the `deflate` encoding on a page with a title (no stable public page serves it; a one-off run of the Node adapter on `https://httpbin.org/deflate` decoded its JSON).
- Open: the name check is missing on the local Worker under `wrangler dev`. A name that resolves to loopback, such as `localtest.me`, passes the core check there, because only literal addresses and `localhost` names are refused, and the Worker adapter calls the global `fetch`, which has no hook between the lookup and the connection. Whether workerd then connects was not run. `e2e/fetch-guard.spec.ts` skips its name test on the Worker for this reason.
- Not verified: Defuddle's CPU time on deployed Workers (measured only on local workerd); scrypt with `maxmem` on deployed Workers; the deploy button provisioning a Queue with its consumer; `codex exec --output-schema` and `claude -p --json-schema` on a real Digest prompt (only grok was run); which Workers AI JSON-mode models return the Digest schema; whether Grok Bot writes good wiki results; whether a button URL ending in `tree/release` deploys that branch (the docs show only `tree/main/<folder>`); whether Actions run in a deployer's copy so that `update-from-upstream.yml` works; lease expiry under a slow model, which no test times; Preact compat with the app's libraries.
- The spec's open items stay open: a read of X's developer terms before the hosted product stores X content, and hosted pricing and whether it includes AI.
