# Access: owner login, agent tokens, MCP

This page explains who can call the Instance and how each caller proves it. It is reference for the owner's login, agent tokens, the task callback credential, the MCP endpoint and the request limits. [HTTP interfaces](http-interfaces.md) holds the routes themselves, and [the spec](../spec.md) holds what the owner sees.

Contents: [Setup](#setup), [Owner login and sessions](#owner-login-and-sessions), [Throttle](#throttle), [Change and reset the password](#change-and-reset-the-password), [Route access](#route-access), [The task callback credential](#the-task-callback-credential), [Agent tokens](#agent-tokens), [Daily budget](#daily-budget), [Secrets at rest](#secrets-at-rest), [Request limits](#request-limits), [The share route](#the-share-route), [MCP](#mcp), [Screen states](#screen-states).

## Setup

A new Instance shows a setup page. It asks for the one-time `SETUP_CODE`, then for a new password, then offers Start with an empty library or Restore a backup. The choice shows once, right after the password is created, because the page keeps that step in its own state. A reload signs the owner in to the library. Restore a backup opens `/settings#backup`, where the Restore is offered while the library is empty ([Export, backup and restore](export-backup-and-restore.md)).

The setup code keeps a stranger from claiming a fresh public Instance.

- The Cloudflare deploy button prompts for `SETUP_CODE` and `THREADSIFT_SECRET_KEY` as secrets ([Cloudflare deploy button](cloudflare-deploy-button.md)). In the container both are environment variables.
- Without `SETUP_CODE`, the container prints a generated one as a `Setup code:` log line at each start while no owner exists.
- A code shorter than 16 characters (`SETUP_CODE_MIN`) is refused with 503 on both setup calls. A Worker with no code gets the same 503.
- Every refusal from the setup, login, change and reset handlers carries one `code` in the error body, named in `REFUSAL_CODES`. The gate's 403 for a foreign origin or content type runs before those handlers and carries none. The web client reads `code` and never guesses from the status.
- While no owner exists, `GET /api/session` also answers `code` (`set`, `missing` or `short`, from `anonymousState`), so the setup page opens on the block that names the fix. The field reveals only what the 503 already reveals, and it is absent once an owner exists.
- The single `owner` row makes a second setup a 409.

## Owner login and sessions

| Rule | Value | Reason |
|---|---|---|
| Password length | 15 to 1,024 code points after NFKC normalization (`PASSWORD_MIN`, `PASSWORD_MAX`) | NIST SP 800-63B-4 sets 15 as the minimum for a password alone |
| Hash | scrypt from `node:crypto` at N=2^15, r=8, p=3, `maxmem` 64 MiB | One of OWASP's Password Storage settings. Node's default `maxmem` of 32 MiB rejects it (`ERR_CRYPTO_INVALID_SCRYPT_PARAMS`). OWASP's default N=2^17 needs 128 MiB, the whole memory of one Worker |
| Stored form | `scrypt$N=…$r=…$p=…$salt$key` | A later cost change still verifies old hashes |
| Session | 32 random bytes in the `__Host-threadsift_session` cookie, stored in `sessions` as a SHA-256 digest with its expiry | |
| Lifetime | 30 days from the last use | A use renews the session once less than 29 days remain |

The renewal is one `UPDATE ... RETURNING` that matches only an unexpired row (`checkSession`). A session that a password change or a logout deleted after the read gets no row back and is refused with no cookie.

A login commits its session in a guarded batch ([Database and search](database-and-search.md)) that holds only while the password hash it verified is still the stored one. A login that raced a password change or a reset gets 409 `password-changed` and starts no session. Setup does the same: it inserts the owner, then commits its session on the hash it wrote.

Chromium keeps the `Secure` `__Host-` cookie over `http://127.0.0.1`, so the local suite runs the real cookie.

## Throttle

The `throttles` table holds one row for each of `setup`, `login` and `reset`. One atomic upsert counts each attempt before its code or password is checked, so parallel guesses each count and only ten of them are checked.

- The tenth counted attempt locks the kind for 60 seconds. Each attempt counted after a lock ends, before a success, doubles the next lock, up to 1 hour.
- A locked kind answers 429 with `Retry-After` without checking anything, even for the right code or password. An attempt during a lock is not counted and does not extend it.
- A wrong setup code, password, current password or reset code answers 403 with its own `code` (`wrong-setup-code`, `wrong-password`, `wrong-current-password`, `wrong-reset-code`), never 401. RFC 9110 15.5.2 requires a `WWW-Authenticate` challenge in every 401, and a secret sent in the JSON body has no scheme to challenge with.
- A success deletes the row only when it is the latest counted attempt, so a late success cannot clear a lock that newer attempts set.
- The lock lives in the database, so a restart keeps it.
- The lock is global, not per address, because behind a proxy the app has no address it can trust. Anyone who can reach the login can lock the owner out of signing in for up to an hour. Open sessions and agent tokens keep working.

## Change and reset the password

Both end every session and keep the agent tokens, which the signed-in owner revokes separately. Every refusal leaves the password, the sessions and the spent codes as they were.

**Change.** `POST /api/password` is owner-only and closed to tokens.

- It refuses a new password outside 15 to 1,024 characters (400) before it counts an attempt.
- It verifies the current password under the `login` throttle kind, so a guess through the login or through the change draws on one budget (OWASP Authentication Cheat Sheet).
- A wrong current password answers 403 `wrong-current-password`, never 401, because the web client treats a 401 as signed out.
- One guarded batch sets the new hash, deletes every session and inserts the caller's new session. It holds only while the stored hash is still the verified one and the calling session still exists. The new cookie is sent only after the commit (OWASP Session Management Cheat Sheet).
- A call that loses the race gets 409 `password-changed` and changes nothing.
- A change runs two scrypt hashes in one request. On a Worker copy it answered 204 in 1.6 s of wall time with no CPU-limit error. The CPU milliseconds are not read ([Open items and unverified claims](open-items-and-unverified-claims.md)).

**Reset.** `POST /api/password/reset` is public and works only while the server holds `PASSWORD_RESET_CODE`: a container environment variable read at start, or a Worker secret read from each request's `env`.

- The code is an operator credential on the owner's own server, like `SETUP_CODE`, so it has no expiry. That departs on purpose from the Forgot Password Cheat Sheet's expiry advice. Its single use, the 32-character minimum (`RESET_CODE_MIN`) and its removal after use make up for it.
- The code is compared by SHA-256 digests with `crypto.equal`, under the `reset` throttle kind.
- One guarded batch holds only while the stored hash is unchanged and the code is unspent. It inserts the code's digest into `spent_reset_codes`, sets the hash, deletes every session and clears the `login` throttle row, because that lock protected the old password.
- A spent digest stays refused after later codes are used, and the same code a second time answers 409 `reset-used`.
- When the batch fails, the reset answers `reset-used` if the code is spent and `password-changed` otherwise, so a reset never overwrites a change that committed after it read the hash.
- The reset starts no session and sets no cookie.
- A missing or short reset code answers 503, which reveals only whether a code exists, as the setup 503 does.
- On Cloudflare, `wrangler secret put` deploys a secret at once and `wrangler secret delete` removes it, so a second `put` replaces the code and a `delete` makes the reset answer 503 `reset-missing`.

The rules come from NIST SP 800-63B-4 3.1.1.2 and 3.2.2 as selected guidance (15 characters, no composition rules, no forced rotation, an attempt limit). They are not full conformance, and its section 4 on recovery was not read.

## Route access

Each route declares who may call it with `access(...)`, and the same statement sets its body cap and cache headers. `createApp` stops at construction (at start on the container, for each API request on the Worker) unless `withPorts` is the first registration and the first handler of every route is an `access(...)` gate. `verifyPolicies` reads Hono's `app.routes` for this, so a route added later stays closed to everyone until it names its callers.

- The check knows a gate and `withPorts` by identity. A function that only carries a `who` property does not pass.
- It also stops the app when a route names `read` on a method other than `GET` or `HEAD`, names another scope on a `GET` or `HEAD`, or names any scope on `ALL`, so every read stays under the `read` scope.
- A mounted app sets no `onError`, because Hono wraps its handlers and the check would find no gate. The app's one `onError` is `answerFailure`.

| Class | Who may call |
|---|---|
| `owner` | The owner's session alone. An agent token gets 403, because Read state, Highlights, the Note, Settings, Export, Restore and the Proposal decisions are the owner's |
| A scope: `read`, `add`, `digest`, `delete`, `reddit` | The owner's session (not limited by scopes), or an agent token that holds the scope (403 otherwise). `POST /api/items/batch` and `GET /api/imports/{name}` are scope routes, so an agent token reaches both ([Data model outline](data-model-outline.md), the import cursor) |
| `anyone` | The session check, the first-run setup, the sign-in and the password reset |
| `callback` | The three Grok Bot task routes ([The task callback credential](#the-task-callback-credential)) |
| `self` | `/mcp` and `/share`, which check their own caller. The gate only caps the body. `ownCheck(...)` puts the route's own check in front of the gate |

The route's text in `GET /api/openapi.json` repeats the caller rule from the same `access(...)` value. `accessNote` and `accessRefusals` write the owner-only or scope sentence and the 401 and 403 answers. `describeDerivedRefusals` adds the cross-site form 403 from the gate's `Plan.csrf` value.

### Gate order

For `owner` and a scope route the gate checks, in order:

1. A credential: an owner session cookie or an agent token. The answer is 401 for no credentials, for an `Authorization` header with no bearer token (an empty one, or another scheme such as `Basic`), and for an unknown or revoked token.
2. That the token is allowed on the route (403).
3. Hono's `csrf` (403), only for requests without an `Authorization` header, because a bearer token is no ambient credential a foreign page could make the browser send.
4. `body-limit` (413).

Credentials come before the cap, so a call with no access and a large body gets 401, not 413. `anyone` and `callback` routes run `csrf`, then the cap. A `HEAD` request to `GET /api/ai-tasks/{id}` takes the same credential step as its `GET` and gets the same answer without the body (RFC 9110, 9.3.2).

A check that needs the parsed body reads who calls from `principal`. A `digest` sent with a Paste needs the `digest` scope besides `add` (`requirePasteScopes`, for `POST /api/items` and for each entry of `POST /api/items/batch`).

### Bearer challenges

`refusedBearer` returns the bearer refusals as JSON, and `challengeOf` is the one source of their `WWW-Authenticate` text. Every 401 carries it, because RFC 9110 15.5.2 requires a challenge in a 401.

- `Bearer` means the call sent no bearer credential. A `Basic` or empty `Authorization` header gets it too, because RFC 6750 3.1 gives a request that lacks authentication information no error code.
- `Bearer error="invalid_token"` means the call sent an unknown or revoked agent token or task credential.
- The same rule holds on the gate, on the task routes and on `/mcp`.
- A browser raises no authentication prompt for a `Bearer` challenge. Chromium 156 raised a prompt for a `Basic` challenge and none for `Bearer`, by navigation and by `fetch()` (run on 2026-11-20). Firefox registers only `negotiate`, `basic`, `digest` and `ntlm`, so it raises none either (a reading of its source, not a run).
- The refusal that Hono's `csrf` throws as an `HTTPException` becomes a JSON answer in `answerFailure`, so the cache headers and the sign-in redirect of a route cover its refusals, including the 413 of the cap.

### Unrouted paths

A call to `/api/*` that matches no route for its method goes through `unrouted()`. [HTTP interfaces](http-interfaces.md) links here for these answers.

- The owner's session and any agent token, whatever its scopes, get 404 when no route has the path, and 405 with an `Allow` header when the path has routes for other methods (RFC 9110 9.1 and 15.5.6). That includes `/api/ai-tasks/{id}/result` and `/intake`.
- A call with no credentials gets 401 for both, because a caller who has signed in nothing must not learn which paths exist.
- The gate asks for a session or a token and no scope (`"any"` in `Plan.credentials`), and runs no `csrf` check, because no answer depends on either.
- `refusingMethods` builds the 405 with Hono's `methodNotAllowed` middleware, which lists the methods of `app.routes` for the path and adds `HEAD` wherever `GET` is, so no list of paths or methods is kept by hand. The same middleware sits on `app.all("/*", ...)` for the paths that `createApp` registers outside `/api`, so `PUT /share` answers 405 with `Allow: GET, HEAD, POST` to every caller whose body is within the cap; a larger body answers 413 first.
- `/mcp` is one `all` route and refuses a method itself.
- A path that no route registers is never a 405. On the container the web app's routes serve it after `createApp`. On the Worker, `isServerPath` sends only `/api`, `/share` and `/mcp` to `createApp`, and `serveDocument` answers the rest, so a `POST` to a page or an asset answers 404 on both.
- `UNROUTED_PATHS` is the one path table left. The OpenRouter connect paths add the `private` cache headers to the 404 and the 405, the file and export download paths add the `file` cache headers, and `/api/ai-tasks/{id}` adds `Cache-Control: no-store`, as its `GET` route declares. The OpenRouter callback allows `GET` only: `getOnly` refuses a `HEAD` before the handler, and `refusingMethods` drops `HEAD` from its `Allow`.

## The task callback credential

`GET /api/ai-tasks/{id}`, `POST /api/ai-tasks/{id}/result` and `POST /api/ai-tasks/{id}/intake` are the only routes declared `access("callback")`. They take a per-task credential, and the gate looks for no session or agent token before it.

- `callbackTask` calls `callbackTaskOf`, which finds the task by the SHA-256 digest of the secret (`ai_tasks.callback_hash`) and the path's `{id}` together.
- The answer is 401 for a missing, malformed or unknown credential, another task's included, and for an `{id}` that `CanonicalNumberTextSchema` refuses. The `WWW-Authenticate` header follows [Bearer challenges](#bearer-challenges).
- An owner session or an agent token without the task's credential gets 403, so no other principal can answer a task.
- The secret is made when the task is sent and shown once, in the webhook body only. A resend of the same task replaces it.
- A task keeps its digest after it closes, so a late answer finds the task and gets 409, not 401.
- `csrf` and the body cap run before the credential step, so `csrf` still refuses a form content type from another origin (403).
- The credential reads and answers one task and nothing else.

## Agent tokens

One random token per connected agent: `tsa_` and 32 random bytes in base64url, shown once and stored as a SHA-256 hash (the token is high-entropy, so a fast hash is enough). The owner revokes it in Settings. The Extension, Grok Bot and MCP clients use tokens as bearer tokens.

- `last_used_at` updates at most once an hour through a conditional `UPDATE`, so a busy agent does not write on every request.
- Each token holds scopes in the JSON column `agent_tokens.scopes`. The scopes are `read`, `add`, `digest`, `delete` and `reddit`; the default is `read` and `add`. [The spec](../spec.md) (Access, Token scopes) says what each covers, and the routes that use a scope are the ones whose `access(...)` names it.
- `scopesOf` is the only decoder of the column, and `createToken` is the only writer. The column is plain text with no default, so an insert that leaves it out fails.
- A stored value that does not decode reads as no scopes and writes a `token-scopes-unreadable` log line with the `tokenId` and nothing else, on each read of that row. The token list then shows the token with no scopes so the owner can revoke it, and each call that needs a scope answers the 403 of a token that lacks it (fail closed), never 500. On `/mcp` that is each tool call. `initialize` and the tool list answer 200 as they do for a token without the scope.
- The Grok Bot settings hold no token. The routes that take AI task results use the per-task credential.

## Daily budget

`withinBudget` runs for `paste`, `pasteLink` and the batch through `admitted`, which also holds the Restore gate. `tokenItemsToday` supplies the same count to Settings.

- The count is the Items a token added in the current UTC day. A deleted Item frees its place, a save that fails after the insert still counts, and a refresh never counts.
- The owner's session and tokens with no budget have no cap. A new token starts at 200 Items a day (`DEFAULT_TOKEN_BUDGET`).
- Known links, short-link aliases included, do not count. A short link whose alias ends at a Reddit share link counts as possibly new, whatever Item sits under the short link, because the next Paste resolves it again and can add an Item.
- A limited request reads the count once before saving and is refused whole when its possibly new Items would cross the cap. A refusal answers 429 with `code: budget-spent` and `Retry-After` until the next UTC midnight.
- Two requests at the same moment can read the same count and both pass, exceeding the limit by one request's links. A batch holds up to `BATCH_LINKS_MAX` (100) links. A held link deleted during a batch and a batch that crosses midnight are not checked again. This is enough for one owner's agents.

## Secrets at rest

Provider keys, the GitHub token, the Grok Bot webhook key and the owner's Reddit session cookie are sealed with AES-GCM (WebCrypto, on both targets) under `THREADSIFT_SECRET_KEY`, which the app reads from its environment and never shows.

- No route returns the Grok Bot key. The address, which the bot's docs call partly secret, goes only to the owner's session, because `/api/settings` is closed to agent tokens.
- A Save without a key keeps the stored key only when the address is unchanged, so a mistyped address never receives the old key.
- `openedSession` is the only code that opens the Reddit session. It passes the cookie to the adapter as an argument, in one `Cookie` header that goes only to `www.reddit.com`. The cookie never goes into a job row, a task input, an error or a log, and a redirect is never followed with it.
- `GET /api/settings/reddit-account` answers a state and never the value. The state `unreadable` (the sealing key changed) sends no request.

## Request limits

Hono's `body-limit` middleware caps request bodies on both targets, because Node has no cap of its own and Cloudflare's cap depends on the zone's plan (100 MB on Free and Pro).

| Route | Cap |
|---|---|
| Every route, `/mcp` included | 64 KiB |
| `POST /api/items` | 8 MiB, because it carries a thread (413 above it) |
| AI task `GET` and `result` | 256 KiB |
| AI task `intake` | 8 MiB |
| A Restore part | The part size (`PART_CAP`) |

The cap holds without `Content-Length` too. A larger body answers 413 and writes nothing, and the SDK's 4 MiB default for `/mcp` never applies.

## The share route

`/share` is the manifest's `share_target` action. It is declared `access("self", { cache: "no-store" })`, so the gate checks no session, token or origin, because the route decides for itself who is trusted. It caps the body and sets `Cache-Control: no-store` on every answer to a `GET`, `HEAD` or `POST`, the 413 included. Another method never reaches the route ([Unrouted paths](#unrouted-paths)). Its 405, or its 413 for a body over the cap, carries no `Cache-Control`, and its body is a fixed message that names no private data.

A write needs a `POST` with all three of these (`sentByOwnPage`):

- an owner session cookie,
- `Sec-Fetch-Site: same-origin`,
- an `Origin` whose host equals the request's host.

Missing metadata, `Origin: null` and an agent token never authorize a write.

- The session cookie is `SameSite=Lax`, so a cross-site `POST` carries no cookie. The two header checks stop a same-site page on another port, whose `POST` does carry it.
- The pattern is the `csrf()` default of Hono, made stricter: Hono lets a request pass on either header, this route needs both.
- It compares the host of the `Origin` and not its scheme. The container sees plain HTTP behind the owner's TLS proxy while the browser's `Origin` says `https`, and `Sec-Fetch-Site: same-origin` already covers the scheme.

A trusted share calls `pasteLink` as the owner and answers 303 to `/?saved=<id>`, or `/?refreshed=<id>` for a known Item that had been fetched. Every other arrival writes nothing and answers 303 to `/?link=<link>`, with a `notice` from `PREFILL_NOTICES` (`empty`, `invalid`, `private`, `restoring`) when a trusted share saved nothing.

- The link is the first `http:` or `https:` address in `url`, then `text`, then `title` (`sharedContentOf`). `linkIn` strips trailing punctuation, so an address that ends in `)`, such as a Wikipedia title with a bracket, loses it. That is the cost of the rule.
- A share with words and no address prefills the first nonblank of `text`, `url` and `title` and carries `notice=invalid`.
- The address carries at most 1,000 UTF-16 code units (`PREFILL_MAX`), so the redirect stays under Node's default header limit of 16 KiB even when every unit percent-encodes to 9 bytes, the worst case for a three-byte UTF-8 character. A longer link is cut to that and carries `notice=invalid`.

## MCP

`/mcp` serves Streamable HTTP on both targets through `createMcpHandler` from `@modelcontextprotocol/server`. The tools are not in OpenAPI: `/api/openapi.json` stays the REST contract, and an MCP client finds the tools with `tools/list`.

- Each app construction builds one handler. Its factory builds a fresh `McpServer` for each request, and the app keeps no session registry, because the SDK changelog for 2.3.0 records that one server shared by overlapping requests fails them.
- The handler serves the 2026-07-28 per-request exchange and, statelessly, the 2025 handshake.
- The handler checks no token, no Host and no Origin, and it reads up to 4 MiB. So `mcpGate` and the 64 KiB cap of `access("self")` run in front of it.

### Gate

`/mcp` is declared `ownCheck(mcpGate(ports))` and then `access("self")`. `mcpGate` runs first, so the start-up check finds a gate in front, and `access("self")` adds the cap.

- `mcpGate` runs on every HTTP request, `initialize` included, and caches nothing, so a token the owner revokes fails on the next request of a client that is still connected.
- It accepts the `Authorization` header only: no cookie, query string or body field. A valid owner cookie never replaces a missing, malformed or revoked token.
- The statuses are 401 `Bearer` for no header or no bearer token, and 401 `Bearer error="invalid_token"` for an unknown or revoked token ([Bearer challenges](#bearer-challenges)).
- `presentedToken` reads the header and calls `verifyToken`, which the REST routes use too, so the parse, the hash and the `last_used_at` rule have one copy.
- Each tool registers a `scopeChallenge` built with the SDK's `requireScopes`. A call without the scopes answers 403 with `WWW-Authenticate: Bearer error="insufficient_scope"`.
- `pasteScopes` is the one copy of the Paste scope rule for HTTP and MCP.

### Host and Origin

The SDK's validators match hostnames without a port, so the gate has its own rules, and none of them reads the allowlist from the request. The gate answers 403 before it asks for credentials.

| `THREADSIFT_PUBLIC_ORIGIN` | `Host` must be | A present `Origin` must be |
|---|---|---|
| Set | That origin's host with its port, also when that host is loopback. A request with another host, a loopback host included, is refused | The whole origin: scheme, host and port |
| Not set | `localhost`, `127.0.0.1` or `[::1]` on any port. Reaching `/mcp` from another machine needs the variable | A loopback origin |

A request without `Origin` passes, because CLI clients send none. `Origin: null`, a malformed one and an unlisted one answer 403.

### Tools

`search`, `read` and `add` call the same functions as `GET /api/items`, `GET /api/items/:id` and `POST /api/items` (`readItemPage`, `readItem` and `paste`) and answer the same JSON as `structuredContent`.

- No tool writes a Highlight, a Note or a Read state, which stay the owner's.
- `add` takes `url` and an optional `digest`, never `content`, `page` or `fill`. It keeps the 503 refusal while a Restore runs and answers `{item, url}`, without saying whether the Item was new.
- A gate refusal is an HTTP status. A missing Item, a refused host, a spent daily budget, the Restore refusal and an argument the input schema rejects are tool results with `isError: true`. The first four carry the REST route's text, and the last carries the SDK's validation message.
- Any other failure is logged by class name and answers the tool result `Internal error`, so no exception text reaches the client.
- A client that goes away releases its request and its stream. An `add` whose Paste committed keeps its Item and its jobs, which finish through the job runner as for any Paste.
- Agent tokens take no part in the login throttle. `/mcp` has no rate limit of its own. `add` draws on the token's daily budget, and `search` and `read` have no limit.

OAuth for Grok Bot's catalog comes later ([the spec](../spec.md), Later).

## Screen states

- `useGuard` sets a ref before its first await, so a second press in the same frame does nothing while the first request is on its way, where a `busy` state alone is still false until the next render. A button the guard blocks keeps `aria-disabled` instead of `disabled`, so focus stays on it.
- The Revoke question, the budget change on a token row and the GitHub, Grok Bot and Reddit sections run through `useFlow`, which keeps its state in a ref for the same reason. The Proposals page holds one `busyId` ref for all its rows.
- Cancel and asking about another token work while a revoke is on its way. The answer of that revoke then removes the token from the list and ends any question still open about it, so a second revoke that answers 404 shows no failure (`reduceRevoke`, `revokeToken`).
- The session check aborts after `CHECK_DEADLINE_MS` (10 s) and ends on the unreachable screen with Retry. An unreachable answer leaves the signed-in view in place (`answeredView`). An explicit sign-in or sign-out supersedes the check in flight, so that check's late answer changes nothing.
