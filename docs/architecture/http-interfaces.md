# HTTP interfaces

`GET /api/openapi.json` describes the REST routes with their bodies and status codes, and it is the contract for them. It leaves out `/mcp` and `/share`, which the MCP and Web Share Target sections below cover. This page holds the rules around the routes that the schema cannot show: who may call, what a refusal means and which limits apply. `docs/spec.md`, Interfaces, lists the behaviour the owner sees.

## Callers and shared rules

The paste box, the Extension and agents use the same HTTP API. The calls an agent needs are `POST /api/items {url}` to add, `GET /api/items` to query (`source`, `read`, `topic`, `tag`, `q`, `url` and `cursor`; `topic` and `tag` match by name with case and spacing ignored), `DELETE /api/items/:id` to delete, `GET /api/topics/:key` to read a Topic page (the key is the Topic's catalog key) and `POST /api/topics/:key/overview` to write its overview again. A key that no Topic has but a merged-away Topic had answers the page of the Topic it was merged into, with that Topic's key in `topic.key`, and Try again acts on that Topic; any other unknown key answers 404.

A path id (`{id}`, `highlightId`, a restore's `part`) is read by `CanonicalNumberTextSchema` (`src/core/contract/canonical-number.ts`), which `IdParamSchema` and `HighlightParamsSchema` (`src/http/route-input.ts`) reuse, so every route refuses a non-canonical id with the same 400, and each of them lists that 400 through `ID_REFUSAL`. The numbers of the Item, Highlight, Proposal and Log cursors, the Item address `/items/<id>` of the web app, the `highlight` query of the web app and the owner id of a storage key (`OWNER_ID` in `src/core/contract/file-keys.ts`) read the same rule. The schema reads the text and not `Number()`, because `Number()` also reads `0x10`, `016`, `16.0`, `+16` and `1e3`, and each would be one more address for a record. The served parameter carries the pattern as `^[1-9]\d{0,15}$`, set in the schema's metadata because the generator would append the `u` flag to the text of the regex. The MCP tool `read` takes the same range as a JSON number (`CanonicalNumberSchema`). The Grok Bot task routes check the id in `callbackTaskOf` before the credential, so an id the schema refuses is an unknown task there and answers 401. The image route `/api/files/items/{id}/{name}` reads its `{id}` as part of a storage key: `src/core/contract/file-keys.ts` checks the whole key and answers 404.

Each route states in its own declaration who may call it, how large its body may be and how its answer is cached, with `access(...)` (`src/http/access.ts`), and `createApp` stops at start-up when a route has no statement. Every call needs the owner's session or an agent token, except the session check, the first-run setup, the sign-in, the password reset and the three task routes of the Grok Bot, which take the task's own callback credential instead. The owner's session alone, never an agent token, calls `/api/settings`, `/api/tokens`, `/api/password`, the sign-out, a Read state change, a Highlight and a Note (`docs/architecture/access-owner-login-agent-tokens-mcp.md`). An agent token calls only what its scopes allow (`docs/spec.md`, Access, Token scopes), and a call outside them answers 403. A token that has used its budget gets 429 with `code: budget-spent` and `Retry-After` on `POST /api/items` and `POST /api/items/batch`. The MCP tool `add` returns an error result with `code: budget-spent` and `retryAfter`. Under `/api/`, a path with no route answers 404 and a method that the path's routes lack answers 405 with `Allow` to the owner's session or any agent token, and both answer 401 with no credential. `/share` answers 405 with `Allow` to every caller (`docs/architecture/access-owner-login-agent-tokens-mcp.md`, Route access).

## The Item list

`GET /api/items` answers one page of at most 50 Items, newest saved first, with `next` for the following page. With no `cursor` it also answers the counts the filter pane shows. Each group's counts apply the search and the other groups' filters but not its own group, so a count equals what choosing that value leaves. Search splits `q` into runs of letters and digits, each run is a prefix match, and every run must match. The `url` filter finds one Item by its normalized URL; the Extension uses it, with the `fillable` flag, to fill a Link-only Reddit Item. Each Item carries `commentCount`, which counts the comments the Reader shows (`docs/spec.md`, Comment filter).

## A Paste

`POST /api/items` takes `url` and, optionally, a `digest`, `fill`, and at most one of `content` and `page`.

- `content` is the `.json` of a Reddit thread (one text, or 1 to 101 with the answers behind its `more` stubs, each up to 4 MiB) or, for an X link, exactly one JSON text of the post and its replies (`XThreadSchema`, `src/core/contract/x-wire.ts`, at most 500 replies). A `content` that does not parse as a thread of the link answers 400, and so does an X thread with fewer replies than the one saved, because the saved thread stays.
- `fill: true` saves a Reddit thread only into the Item with that link while it holds no saved thread.
- `page` is the Extension's own-tab read, up to 1,000,000 bytes. It takes no X or GitHub link, no short link or Reddit share link (a page is saved at the address a short link leads to, so the caller sends it there, or sends the short link alone and the Paste resolves it) and no Reddit link that is not a post or comment (400 with `code: unsupported-link`).
- A link whose host is not globally reachable answers 400.
- The answer is 201 for a new Item and 200 for a known one it refreshed, 409 when a `page` meets a Reddit thread already saved, and 503 while a Restore holds the library.
- `refusalOf` in `src/features/paste/core/paste-refusal.ts` gives the status, code and text of every refusal that `paste`, `pasteLink` and the whole-call refusals of a batch (unknown token, spent budget, Restore) answer with; the routes render it with `refusing` in `src/http/refusals.ts` and the MCP `add` tool reads its `kind`. A refused host inside a batch is an entry of its results, and a request that fails validation or scope answers before a Paste runs. `pasteLink` takes a link alone and answers only the kinds a link can meet, and `paste` takes `content`, `page` and `fill` as well.

## Batches and the import cursor

`POST /api/items/batch {links, import?}` saves 1 to 100 links in one call for a routine or an Import. It runs the Paste on each link in order, except that a link the library already holds is not refreshed and answers `known`: an Import adds Items, and refreshing a library would cost one model call per link. `results[i]` answers `links[i]` with `added`, `known` or `refused` (a host that is not globally reachable, which does not stop the other links). An invalid entry answers 400 and saves nothing.

`import` is `{name, cursor, previous?}`: the caller picks the `name` and an opaque `cursor`, such as the last bookmark id, and `previous`, when sent, makes the Instance save the cursor only while the stored one equals it (null: only while nothing is stored). The Instance saves the cursor only after every link has an outcome, so a call that dies half way leaves the old cursor and the repeat answers `known` for the links already saved. `GET /api/imports/{name}` reads it back, and an agent token calls both (`docs/architecture/data-model-outline.md`, The import cursor).

## Digest, status and reads

`POST /api/items/:id/digest` queues a Digest over the stored text, never a fetch of the Item's own link (a Reddit post's linked page is read again for the Digest), and does nothing while a Digest is open or the Item is failed. `GET /api/items/:id/status` answers the Item as the list shows it, for polling a `processing` Item. `GET /api/items/:id` answers the Item with its post text, Digest, comments (with the `view` that says why the Reader shows what it shows), Highlights, Note and up to 5 Related Items; the MCP `read` tool answers the same. `GET /api/files/items/:id/:name` serves a stored image of that Item and nothing else.

## Read state, Highlights and Notes

The owner alone sets Read state, so `PUT /api/items/:id/read-state` answers 403 to an agent token. `POST /api/items/:id/highlights` answers 409 when the text changed since the owner read it, and `PUT /api/items/:id/note` takes the Note's `revision` and answers 409 with the stored Note when it moved; all Highlight and Note writes answer 403 to an agent token. `GET /api/highlights` answers one page of the Highlights page and is open to agent tokens.

## The Index, the Log and Proposals

`GET /api/topics`, `GET /api/log` and `GET /api/proposals` answer one page of the Index, the Log and the open Proposals, 50 at a time, to the owner's session or an agent token, and the MCP endpoint has no tool for them. `GET /api/proposals/:id` answers the state of one Proposal, `rejected` and `declined` included, to the same callers. `POST /api/proposals/:id/reject` and `/accept` answer 403 to an agent token. Accept answers 409 `not-current` when the row no longer holds (a Highlight found again, a Topic with nothing left to cover, an Item with a newer Digest), 409 `no-provider` for an overview row with no Provider saved, and 409 `merge-busy` while another merge is accepting (`docs/proposals.md`).

## MCP

The MCP endpoint, `/mcp`, offers the tools `search`, `read` and `add`. They take the filters, the Item id and the link with an optional Digest of the HTTP calls above and answer the same data. It takes an agent token and no owner session (`docs/architecture/access-owner-login-agent-tokens-mcp.md`, MCP), so it cannot write a Highlight, a Note or a Read state, and `add` sends no page or thread content.

## Settings routes

The settings routes for the Reddit account, the Grok Bot, the X reader and the Provider are closed to agent tokens (403), and none returns a stored secret. The Extension's Connect Reddit button uses `GET`, `PUT` and `DELETE /api/reddit-account` instead, which need the `read` scope for `GET` and the `reddit` scope for the others. The Test and Verify calls of these sections answer every outcome inside HTTP 200, so the bot's or Reddit's own 401 never signs the owner out. Verify with Grok Bot as the Provider holds the request for up to 60 seconds while the bot answers, then answers `refused` with `timeout` and closes the task, so a late answer is 409.

## The Grok Bot task routes

The three routes (`GET /api/ai-tasks/{id}`, `POST .../result` and `POST .../intake`) accept only the task's own callback credential: 403 for an owner session or an agent token, 401 for a missing or unknown one, an `{id}` that is not a whole number included, with `WWW-Authenticate: Bearer` when the call sent no bearer credential and `Bearer error="invalid_token"` when it sent one that matches no task. The webhook body carries only `{ taskId, kind, callbackToken }`, so the bot reads the rest from `GET`. Each answer is refused with 409 when the task is closed, past its deadline or already answered, and `intake` also refuses an answer whose Item moved on since the task was sent. `intake` takes `{ content, digest? }` (the X thread as one JSON text, as in `docs/architecture/fetchers.md`, X) or `{ unavailable: true }`, at most 8 MiB, and `result` takes `{ result }` or `{ error }`, at most 256 KiB. Details in `docs/architecture/ai-tasks-and-providers.md`.

## The Web Share Target

The Web Share Target is a form `POST /share` that the app handles on the server. A trusted share calls the same core save as `POST /api/items`; the owner's session cookie, the browser's `Sec-Fetch-Site: same-origin` and an `Origin` that names the Instance are all required, and an agent token never authorizes it (`docs/architecture/access-owner-login-agent-tokens-mcp.md`, The share route).

## Export and Restore

The Export and Restore routes answer 403 to an agent token and 401 with no owner session, because a leaked token must not copy the library in one request. One export exists at a time, and a ready one is kept 24 hours. A restore starts only into an empty library, and while it runs `POST /api/items` and `POST /api/items/batch` answer 503 with `code: "restoring"` and the MCP `add` tool returns an error with the same text (`docs/architecture/export-backup-and-restore.md`). The limits of the download on the Worker are in `docs/architecture/export-backup-and-restore.md`.
