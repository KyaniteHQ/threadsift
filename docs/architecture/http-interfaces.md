# HTTP interfaces

`GET /api/openapi.json` describes the REST routes with their bodies and status codes, and it is the contract for them. It omits its own route and the catch-all `ALL /api/*`. It also leaves out `/mcp` and `/share`, which the MCP and Web Share Target sections below cover. This page holds what the schema cannot show: who may call, what a refusal means and which limits apply. [The spec](../spec.md) (Interfaces) lists the behaviour the owner sees.

Contents: [Callers and shared rules](#callers-and-shared-rules), [The Item list](#the-item-list), [A Paste](#a-paste), [Batches and the import cursor](#batches-and-the-import-cursor), [Digest, status and reads](#digest-status-and-reads), [Read state, Highlights and Notes](#read-state-highlights-and-notes), [The Index, the Log and Proposals](#the-index-the-log-and-proposals), [MCP](#mcp), [Settings routes](#settings-routes), [The Grok Bot task routes](#the-grok-bot-task-routes), [The Web Share Target](#the-web-share-target), [Export and Restore](#export-and-restore).

## Callers and shared rules

The paste box, the Extension and agents use the same HTTP API. An agent needs five calls:

| Call | Use |
|---|---|
| `POST /api/items {url}` | Add a link |
| `GET /api/items` | Query (`source`, `read`, `topic`, `tag`, `q`, `url`, `cursor`). `topic` and `tag` match by name with case and spacing ignored |
| `DELETE /api/items/:id` | Delete an Item |
| `GET /api/topics/:key` | Read a Topic page (the key is the Topic's catalog key) |
| `POST /api/topics/:key/overview` | Write a Topic's overview again |

A key that no Topic has but a merged-away Topic had answers the page of the Topic it was merged into, with that Topic's key in `topic.key`, and Try again acts on that Topic. Any other unknown key answers 404.

`GET /api/scopes` answers the `scopes` of the agent token it carries, or every scope for the owner's session, and changes no library data; like every authenticated call it can record the token's last use or renew the owner's session. A client calls it to check its address and token; the Extension calls it at Save settings.

### Who may call

Each route declares who may call it, how large its body may be and how its answer is cached with `access(...)`, and `createApp` stops at start-up when a route has no statement. [Access](access-owner-login-agent-tokens-mcp.md) (Route access) holds the classes, the order of checks, the 401, 403, 404 and 405 answers, and the daily budget refusal (429 `budget-spent`). The routes below name only what sets them apart.

### Search engines

Every answer carries `NO_INDEX_HEADERS` (`X-Robots-Tag: noindex, nofollow`). The Instance answers 404 for `/robots.txt`, because a crawler that `robots.txt` keeps out never fetches a page and never reads its `noindex` rule ([Google Search Central, Block indexing](https://developers.google.com/search/docs/crawling-indexing/block-indexing)). On Cloudflare the platform can answer `/robots.txt` before the Worker runs: a domain on the Free plan with no `robots.txt` of its own gets Cloudflare's Content Signals Policy, a file of comments that holds no rule ([Cloudflare docs, Managed robots.txt](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/)).

- The container sets the header in the `request` listener of `serveContainer`, its HTTP server, before the app runs. It reaches every answer the server writes for a request: the app's, and the 400, 500 and 504 that `@hono/node-server` writes itself, such as the 400 for `OPTIONS *`. A request that Node's HTTP parser refuses gets Node's own 400 without the header, because Node writes it to the socket before a request exists ([Node docs, `clientError`](https://nodejs.org/api/http.html#event-clienterror)).
- The Worker sets it on every answer of its `fetch`. A failure that escapes the app, such as a setting the Worker cannot read, answers 500 `Internal error` through `failedRequest` and logs `request-failed` with the path and the error class, so it carries the header too. The platform serves a file of the built web app before the Worker runs, and Worker code never touches that answer, so `workerHeadersPlugin` writes the header under `/*` in `_headers` for it ([Workers docs, Static Assets, Headers](https://developers.cloudflare.com/workers/static-assets/headers/)). `run_worker_first: true` would let the Worker set it alone, at the cost of one Worker request for each file.

### Canonical numbers

Every route reads a path id (`{id}`, `highlightId`, a Restore's `part`) as text through `CanonicalNumberTextSchema` and refuses a non-canonical id. An ordinary route answers 400; the exceptions are listed below. The same rule reads the numbers of the Item, Highlight, Proposal and Log cursors, the web app's Item address `/items/<id>` and `highlight` query, and the owner id of a storage key. It reads text and not `Number()`, because `Number()` also reads `0x10`, `016`, `16.0`, `+16` and `1e3`, and each would be one more address for a record. The MCP tool `read` takes the same range as a JSON number.

- The served parameter carries the pattern `^[1-9]\d{0,15}$`. The OpenAPI generator appends a regex's flags to its text, and `servedDocument` removes them from a `pattern` value only when the text before the flags is the `source` of a regex in a registered schema.
- A JSON Schema pattern has no flags, so a served regex spells out each case in its character classes. `SentCommentId` reads `^(?:[tT]1_)?[A-Za-z\d]+$`, not the case-insensitive `/iu`, which would also accept the Kelvin sign and the long s.
- The Grok Bot task routes check the id before the credential, so an id the schema refuses is an unknown task there and answers 401.
- The image route `/api/files/items/{id}/{name}` reads `{id}` as part of a storage key and checks the whole key, so a bad one answers 404.

### Derived refusals

The 400, 403, 413 and 415 of each route in `GET /api/openapi.json` come from the route's method, request and gate (`describeDerivedRefusals`), so no route types them. `createApp` stops at start-up when a route lists a schema for one of them that the derived body would not match. The rule copies `hono/csrf` (`CSRF_SAFE_METHODS`, `CSRF_FORM_TYPES`), so a change of the pinned `hono` version must check them.

## The Item list

`GET /api/items` answers one page of at most 50 Items (`PAGE_SIZE`), newest saved first, with `next` for the following page.

- With no `cursor` it also answers the counts the filter pane shows. Each group's counts apply the search and the other groups' filters but not its own group, so a count equals what choosing that value leaves.
- Search splits `q` into runs of letters and digits. Each run is a prefix match, and every run must match.
- The `url` filter finds one Item by its normalized URL. The Extension uses it, with the `fillable` flag, to fill a Link-only Reddit Item.
- Each Item carries `commentCount`, which counts the comments the Reader shows ([the spec](../spec.md), Comment filter).

## A Paste

`POST /api/items` takes `url` and, optionally, a `digest`, `fill`, and at most one of `content` and `page`.

- `content` is the `.json` of a Reddit thread (one text, or 1 to 101 texts with the answers behind its `more` stubs, each up to 4 MiB) or, for an X link, exactly one JSON text of the post and its replies (`XThreadSchema`, at most 500 replies). A `content` that does not parse as a thread of the link answers 400. So does an X thread with fewer replies than the saved one, because the saved thread stays.
- `fill: true` saves a Reddit thread only into the Item with that link while it holds no saved thread.
- `page` is the Extension's own-tab read, up to 1,000,000 bytes. It takes no X or GitHub link, no short link or Reddit share link, and no Reddit link that is not a post or comment (400 with `code: unsupported-link`). A page is saved at the address a short link leads to, so the caller sends it there, or sends the short link alone and the Paste resolves it.
- A link whose host is not globally reachable answers 400.
- The answer is 201 for a new Item and 200 for a known one it refreshed. It is 409 when a `page` meets a Reddit thread already saved, and 503 when a Restore holds the library and the write would store an Item.

`refusalOf` gives the status, code and text of every refusal that `paste`, `pasteLink` and the whole-call refusals of a batch (unknown token, spent budget, Restore) answer with. The routes render it with `refusing`, and the MCP `add` tool reads its `kind`. A refused host inside a batch is an entry of its results. A request that fails validation or scope answers before a Paste runs. `pasteLink` takes a link alone and answers only the kinds a link can meet. `paste` takes `content`, `page` and `fill` as well.

## Batches and the import cursor

`POST /api/items/batch {links, import?}` saves 1 to 100 links (`BATCH_LINKS_MAX`) in one call for a routine or an Import.

- It runs the Paste on each link in order, except that a link the library already holds is not refreshed and answers `known`. An Import adds Items, and refreshing a library would cost one model call per link.
- `results[i]` answers `links[i]` with `added`, `known` or `refused` (a host that is not globally reachable, which does not stop the other links).
- An invalid entry answers 400 and saves nothing.

`import` is `{name, cursor, previous?}`. The caller picks the `name` and an opaque `cursor`, such as the last bookmark id. When `previous` is sent, the Instance saves the cursor only while the stored one equals it (null means only while nothing is stored).

The Instance saves the cursor only after every link has an outcome, so a call that dies half way leaves the old cursor, and the repeat answers `known` for the links already saved. `GET /api/imports/{name}` reads it back, and an agent token calls both ([Data model outline](data-model-outline.md), the import cursor).

## Digest, status and reads

- `POST /api/items/:id/digest` queues a Digest over the stored text and never fetches the Item's own link (a Reddit post's linked page is read again for the Digest). It does nothing while a Digest is open or the Item is failed.
- `GET /api/items/:id/status` answers the Item as the list shows it, for polling a `processing` Item.
- `GET /api/items/:id` answers the Item with its post text, Digest, comments (with the `view` that says why the Reader shows what it shows), Highlights, Note and up to 5 Related Items (`RELATED_MAX`). The MCP `read` tool answers the same.
- `GET /api/files/items/:id/:name` serves a stored image of that Item and nothing else.

## Read state, Highlights and Notes

The owner alone sets Read state, so `PUT /api/items/:id/read-state` answers 403 to an agent token. All Highlight and Note writes answer 403 to an agent token too. `GET /api/highlights` answers one page of the Highlights page and is open to agent tokens.

- `POST /api/items/:id/highlights` answers 409 when the text changed since the owner read it, and 400 with `code` `selector-mismatch` when the passage does not stand at its hint in that text.
- Its `target.commentId` takes the comment id that `GET /api/items/:id` answers (`CommentId`) and answers 400 for an id with Reddit's `t1_` prefix, which a Digest's `keptComments` still accept. A Reader tab that loaded an Item from a build that stored the prefix sends it, so that tab must be reloaded.
- `PUT /api/items/:id/note` takes the Note's `revision` and answers 409 with the stored Note when it moved.
- `GET /api/highlights` answers its `counts` only when the request has no `cursor`, by the rule of the Item list, so a Load more does not count the library again.

## The Index, the Log and Proposals

`GET /api/topics`, `GET /api/log` and `GET /api/proposals` answer one page of the Index, the Log and the open Proposals (with the one being applied), 50 at a time, to the owner's session or an agent token. The MCP endpoint has no tool for them.

- `GET /api/proposals/:id` answers the state of one Proposal, `rejected` and `declined` included, to the same callers.
- `POST /api/proposals/:id/reject` and `/accept` answer 403 to an agent token.
- Accept answers 409 `not-current` when the row no longer holds (a Highlight found again, a Topic with nothing left to cover, an Item with a newer Digest). It answers 409 `no-provider` for an overview row with no Provider saved, and 409 `merge-busy` while another merge is accepting ([Proposals](../proposals.md)).

## MCP

`/mcp` offers the tools `search`, `read` and `add`. They take the filters, the Item id and the link with an optional Digest of the HTTP calls above and answer the same data. It takes an agent token and no owner session ([Access](access-owner-login-agent-tokens-mcp.md), MCP), so it cannot write a Highlight, a Note or a Read state, and `add` sends no page or thread content.

## Settings routes

The settings routes for the Reddit account, the Grok Bot, the X reader and the Provider are closed to agent tokens (403), and none returns a stored secret. The Extension's Connect Reddit button uses `GET`, `PUT` and `DELETE /api/reddit-account` instead. `GET` needs the `read` scope and the others need the `reddit` scope.

The Test and Verify calls of these sections answer every outcome inside HTTP 200, so the bot's or Reddit's own 401 never signs the owner out. Verify with Grok Bot as the Provider holds the request for up to 60 seconds (`VERIFY_WAIT_MS`) while the bot answers, then answers `refused` with `timeout` and closes the task, so a late answer is 409.

## The Grok Bot task routes

The three routes (`GET /api/ai-tasks/{id}`, `POST .../result` and `POST .../intake`) accept only the task's own callback credential ([Access](access-owner-login-agent-tokens-mcp.md), the task callback credential).

| Call | Answer |
|---|---|
| An owner session or an agent token | 403 |
| A missing or unknown credential, or an `{id}` that is not a whole number | 401, with `WWW-Authenticate: Bearer` when the call sent no bearer credential and `Bearer error="invalid_token"` when it sent one that matches no task |
| A task that is closed, past its deadline or already answered | 409. `intake` also refuses an answer whose Item moved on since the task was sent |

The webhook body carries only `{ taskId, kind, callbackToken }`, so the bot reads the rest from `GET`. `intake` takes `{ content, digest? }` (the X thread as one JSON text, as in [Fetchers](fetchers.md), X) or `{ unavailable: true }`, at most 8 MiB. `result` takes `{ result }` or `{ error }`, at most 256 KiB. [AI tasks and Providers](ai-tasks-and-providers.md) holds the rest.

## The Web Share Target

The Web Share Target is a form `POST /share` that the app handles on the server. A trusted share calls the same core save as `POST /api/items`. It needs the owner's session cookie, the browser's `Sec-Fetch-Site: same-origin` and an `Origin` that names the Instance, and an agent token never authorizes it ([Access](access-owner-login-agent-tokens-mcp.md), The share route).

## Export and Restore

The Export and Restore routes answer 403 to an agent token and 401 with no owner session, because a leaked token must not copy the library in one request.

- One Export exists at a time, and a ready one is kept 24 hours.
- A Restore starts only into an empty library. While it runs, a write of `POST /api/items` or `POST /api/items/batch` that would store an Item answers 503 with `code: "restoring"`, and the MCP `add` tool returns an error with the same text. `POST /api/items/{id}/highlights`, `PUT /api/items/{id}/note`, `POST /api/items/{id}/digest`, `POST /api/topics/{key}/overview` and `POST /api/proposals/{id}/accept` (except for a `highlight-lost` row) answer the same 503 ([Export, backup and restore](export-backup-and-restore.md), While it runs).
- [Export, backup and restore](export-backup-and-restore.md) holds the limits of the download on the Worker.
