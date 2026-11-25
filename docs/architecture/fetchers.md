# Fetchers

A fetcher turns a pasted link into the content of an Item. `readJob` picks one by the link's route (`linkRouteOf`). X has two readers of its own, the Grok Bot and the grok CLI. A number on this page with no source named is our choice, not a measurement.

Contents: [Article](#article), [GitHub](#github), [Reddit](#reddit), [X](#x), [Other](#other), [One hop](#one-hop), [Plug-ins](#plug-ins), [URLs and short links](#urls-and-short-links), [Private addresses](#private-addresses).

```text
fetch job
  |
  +-- the job holds an Extension page ........ publish that page
  +-- X link ................................. xRouteOf: Grok Bot, grok CLI, or Link-only
  +-- a plug-in matches (container only) ..... publish the plug-in's page
  +-- Reddit post or comment ................. oEmbed, plus account fetch or archive fill
  +-- GitHub repository ...................... GitHub REST API
  +-- any other link ......................... guarded page fetch, then Article or Other
```

## Article

A plain `fetch` through `guardedFetch`, then Defuddle on the linkedom document, with Markdown output (`readArticle`). The title is the page's `<title>`, or Defuddle's title when the page has none. Pages that need JavaScript or a login come in through the Extension, because the Instance renders no pages. Defuddle's CPU cost is why the Cloudflare install needs Workers Paid ([Cloudflare deploy button](cloudflare-deploy-button.md)).

- A page of at least 100 words (`MIN_ARTICLE_WORDS`) is an Article. A shorter page is an Other Item. A video host (`VIDEO_HOSTS`) never becomes an Article. The check uses the final URL, because a page such as the Vimeo terms has thousands of words.
- Defuddle makes no requests. `readArticle` passes `useAsync: false` and a `fetch` option that refuses every request, because some extractors fetch extra pages with the global `fetch`, outside the guard. The guarded fetch cannot be passed instead, because the reader runs where no `Network` port exists (a worker thread on the container).
- The output is Markdown only. Defuddle keeps `video`, `audio` and `iframe` as raw HTML, and the Reader renders none, so `readArticle` replaces them with links before Defuddle runs ([Media](data-model-outline.md)).
- Both targets build the `PageReader` port with `pageReaderOver`. The container runs each page in one `node:worker_threads` worker, because Defuddle blocks the thread that calls it (a 4 MB page blocked the event loop for about 8 s). When a read's deadline passes, the adapter ends the worker, fails that read with `PageReadTimeout` and re-posts the other pending reads to a new worker. The Worker runs the same functions inline under the Worker's CPU limit.
- `maxHtmlBytes` is the largest HTML page an adapter reads: 5 MiB on the container, 900 KiB on the Worker. A page over the cap is cut and never read as an Article, so it becomes an Other Item. The Worker cap lies between the largest page that stayed under the isolate's 128 MB and the smallest that passed it ([Decisions and evidence](decisions-and-evidence.md), Worker HTML cap).
- The `alias` in `wrangler.jsonc` points `turndown` and `@mixmark-io/domino` at their Node builds. Without it, wrangler follows turndown's `browser` field to a build that needs a global `document`, which workerd lacks, and every conversion returns the raw HTML. Wrangler resolves an alias from the project root, so both packages are direct dependencies at the versions `defuddle` resolves, and a `defuddle` update moves them with it.

## GitHub

The GitHub REST API on both targets, anonymous or with the owner's optional token ([Add a GitHub token](../guides/github-token.md)). `fetchedOfRepository` runs for a link of kind `github-repo`, in place of the page fetch. A deep link such as an issue URL has the same kind and reads the same repository.

- The fetch makes one request for the repository and one for its README, with API version `2022-11-28`. The README request uses the owner and name from the repository answer, so a renamed repository reads the README of its new name, while the Item keeps the name it was pasted with ([Item identity](data-model-outline.md)).
- `Authorization: Bearer <token>` goes only on a hop whose origin is exactly `https://api.github.com`, so a redirect never carries it. A token the Instance cannot open ends the fetch as `github-token` without a request, and so does a 401 with a token sent. That fetch writes no content, so the Item keeps its earlier metadata and README, and the read never falls back to anonymous.
- The README request asks for the JSON form, because the raw media type returns no file name, and the fetch needs the name to tell Markdown from another format. The Item keeps the README as post text only when the name ends in `.md` or `.markdown` and the encoding is `base64`. The answer is cut at 768 KiB (`README_ANSWER_BYTES`), which holds a README of 512 KiB after base64 and JSON escaping. A cut answer is never parsed or stored: the read fails with `unreadable`, and a refresh keeps the earlier text and metadata. Relative links and images stay unresolved, because the Reader refuses a relative URL. A license of `NOASSERTION` is stored as no license.
- A repository 200 with a README 404 gives a ready Item with metadata and no text. A repository answer that is not 2xx (404, 451, or a 403 or 429 that is no rate limit), a README answer that is neither 200 nor 404, and a repository marked `private` all end the fetch with `status` and write no metadata. The Item then settles `ready` and Link-only with no failure reason and no Try again, and the owner pastes the link again. An answer that does not parse gives `unreadable`. A network error or a timeout takes the path it takes for a page.
- The guarded finishing batch writes the Item fields, the search parts, the `github_repos` upsert and the content generation together, so a runner whose claim was taken over writes none of them. A failed fetch writes no repository row.

### Rate limits

A 403 or 429 is a primary limit when `x-ratelimit-remaining` is `0`, and a secondary limit when the JSON `message` names a "secondary rate limit" ([GitHub's rate limit docs](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)). A 403 or 429 that is neither takes the ordinary failure path and stores no cooldown. The Vault mirror uses a wider rule ([Vault mirror](vault-mirror.md), Bounds, files and retry).

- The status and headers classify first, so a header-confirmed primary limit never waits on the body. Only an answer the headers do not confirm gets its message read, cut at 8 KiB.
- For a primary limit the later of `x-ratelimit-reset` and `Retry-After` wins, because the later time is the safe one; a secondary limit uses `Retry-After` alone. `retryAfterMs` is the one reader of `Retry-After` for GitHub, the Vault mirror and Reddit, and it follows [RFC 9110, section 10.2.3](https://www.rfc-editor.org/rfc/rfc9110#section-10.2.3). A blank or malformed value is no wait.
- With no usable time, the wait is 60 s for the first limited attempt and 120 s after that. No limit ever gives an immediate retry.

### Cooldown and attempts

- A limited answer stores the Instance's cooldown in `github_cooldown`, one row that never moves earlier. It lasts one hour at most (`MAX_COOLDOWN_MS`), because every documented primary limit is per hour, and a stored time further ahead is cut and written back. Saving or removing the token deletes the row and makes every `fetch` job that waits with `github-rate-limit` due in the same batch, because the token has its own limit, and then queues those jobs. Removing a token that is not saved changes nothing. A `fetch` job that defers with `github-rate-limit` after the row was deleted is due at once.
- Every request checks the cooldown first, so a Paste of any GitHub link waits for it. A request sent with a credential that was replaced or removed meanwhile stores no cooldown and goes out again with the current credential.
- A limited attempt counts once, whichever request was limited. The first two defer the job. The third ends the Item `failed` with the reason `rate-limited`, keeps its saved content and drops a pending caller Digest like `gave-up`. Finding a cooldown counts no attempt.
- Verify token on an Instance with no sealing key answers the refusal `secret-missing` before it looks for a token. With a sealing key and no token saved it answers `not-configured`, and with a token the Instance cannot open, `secret-missing`.
- Verify token sends no request during a stored cooldown and answers the refusal `rate-limited`. GitHub may count `GET /rate_limit` against the secondary limit, and a Verify during a secondary backoff would add to the load that caused it.

## Reddit

The title, author and community come from oEmbed. The thread comes from the first source that works: the Extension's `.json` content, `content` sent with a Paste, the connected account (self-hosted builds only, when its session works), or the archive fill. The Extension's `page` is the fallback when its `.json` request failed. One `.json` parser (`parseRedditThread`) reads the Extension's content, a Paste's content and the account fetch, and the archive fill builds the same wire types for the same thread builder. A `more` stub whose replies were not fetched becomes a Context stub.

### Archive fill

The fill runs inside the fetch job next to the oEmbed request, only when the archive setting is on and the Item holds no thread. It reads Arctic Shift's post and comment tree with two guarded requests, one at a time: the post (`/api/posts/ids?ids=<id>`) and the whole tree (`/api/comments/tree?link_id=t3_<id>&limit=9999`).

- On a 429 the request is sent once more after the seconds in `X-RateLimit-Reset`. The wait ends when the fetch deadline aborts, and the request is then not sent. A reset over 10 s or a second 429 leaves the Item Link-only without waiting.
- An answer over 8 MiB, a timeout, an outage, a post the archive lacks and an answer the parser refuses all leave the Item Link-only. None of them fails the Item or retries the job.
- The oEmbed title wins. The archive's title is used only when oEmbed failed.
- When the archive puts a reply at the top of the tree because its parent is missing, the fill keeps the parent id, and the Reader groups those replies under one Context stub. The Extension, supplied JSON and connected account require the parent id to match the tree.
- A comment marked `_meta.was_deleted_later` becomes the `[deleted]` placeholder before parsing, so the Comment filter drops it and its replies keep their place.

### Connected account

The account is the first source for a post or comment with no saved thread, before the archive fill and whether or not the fill is on ([Connect a Reddit account](../guides/reddit-account.md)).

- The turn check runs first, so a job that has to wait sends no request, not even oEmbed. The oEmbed request starts after the account step, so a job that waits after its first answer (a window too small for the hidden replies, or a 429) has sent that one request to Reddit and no oEmbed request. One fill runs at a time, oldest job first ([Jobs, leases and the schedule](jobs-leases-and-the-schedule.md), The Reddit turn).
- The fill requests the post's `.json`, then the replies behind each `more` stub by permalink. Each address comes from `redditRefOf`, never from the pasted text. The Extension runs the same loop.
- The limits are 500 ms between request starts (kept on the account row, so it holds from one fill to the next), at most 100 requests, 8 MiB held, a stop at the first 429, and a server deadline of 90 s. The Extension's deadline is 150 s.
- Before each request the server asks whether the run still holds the turn, so Disconnect, `expired`, a closed or deleted job and a takeover stop the fill within one request.
- A fill that stops early stores the thread with Context stubs, so the requests already made are not thrown away. The stored thread has a null `archived_at`, because it is current.

### Transport

`Ports.redditSession` is one `get(path, cookie, signal)` to `www.reddit.com`. The shared adapter fixes the host, follows no redirect with the session, sends the app's `Threadsift/1` User-Agent, refuses a path without a leading `/` and a path or cookie with a line break, and cuts the body at `THREAD_CONTENT_BYTES`.

- A request that throws and an answer whose body cannot be read or passes `THREAD_CONTENT_BYTES` both count as status 0 in the `reddit-fill` line. Each also writes its own line first: `reddit-request-failed`, or `reddit-answer-unread` with the status of the answer, and the error class in both (`RangeError` for a body over `THREAD_CONTENT_BYTES`). No line holds the cookie, the path or the body.
- The container uses the platform `fetch`.
- The Worker writes HTTP/1.1 by hand over `connect()` from `cloudflare:sockets`, because Reddit answers the Workers `fetch` client with 403 even with the cookie, while a raw socket from the same Worker got 200 ([Decisions and evidence](decisions-and-evidence.md), Reddit). It opens one connection for each request (`Connection: close`, because a socket cannot outlive its invocation), asks for `Accept-Encoding: identity` and refuses an encoded body. No maintained HTTP client over `connect()` exists, so the reader is the app's own.

### Request limit and session health

- Reddit's `x-ratelimit-remaining` and `x-ratelimit-reset` (100 requests per about 600 s) are stored on the account row. No job takes the turn while the stored window is used up or `limited_until` is in the future. A used-up window whose answer has no usable `x-ratelimit-reset` (absent, not a number, or `0`) is stored as resetting after `WAIT_CHECK_MS` (5 minutes), the longest wait of a waiting job, unless a later reset is already stored. A stored window reset is cut to one hour, like `limited_until`.
- A 429 stores `window_remaining = 0` and `limited_until`: the largest of the answer's `x-ratelimit-reset`, its `Retry-After` and 60 s, cut to one hour. The job waits with `reddit-limit` and counts an attempt, and the third limited attempt uses the archive fill.
- A first answer that shows fewer requests left than the hidden replies need is dropped, and the job waits for the reset and counts no attempt, so a thread with fetchable stubs is not stored. A thread that needs 100 requests or more is stored with stubs.
- A 401 or 403 sends one `me.json` check with the same session. A 403 there is `blocked`, not `logged-out`, because Reddit answers 403 with the same network-security page to an altered session and to no session. A 401, or a 200 that names no account, is `logged-out` and sets the state `expired` at once.
- A fill whose first request and `me.json` check both answer 403 is one refused fill. `refused_threads` keeps the post id of each refused thread since the last answer that showed the session works, so a thread counts once however many retries it takes, and the third distinct thread sets `expired`.
- Another status, a timeout, a network error or a parse refusal uses the archive fill for that fetch and leaves the state alone. How Reddit answers `me.json` for a logged-out session (401, a 200 that names no account, or 403) is unmeasured ([Open items and unverified claims](open-items-and-unverified-claims.md)).

### Supplied thread

`POST /api/items` with `content` is a Paste of a post or comment link with its `.json`. The server sends no request for thread JSON.

- `content` is one JSON text, or 1 to 101 texts: the thread's `.json`, then the permalink answers behind its `more` stubs. A comment link's tree starts at the response's outermost comment, whose parent may be outside the response ([Reddit's `context` parameter](https://www.reddit.com/dev/api/#GET_comments_{article})). Every other `parent_id` must match inside the response.
- The parser checks ids against the link and tree, and drops a deleted or removed body, `AutoModerator` and a bare agreement from the Kept comment candidates.
- The first text sets the Item's post, title and `reported` count. Each later text is a thread of the same post with exactly one comment at its top. That comment and its replies take the place of the `more` stub that lists its id. The stub stays, listing the ids not yet answered, until none is left. An answer that fills no stub answers 400 and changes nothing. A stub that stays is stored as a `more` row, which the Reader shows as a Context stub that says its replies were not saved.
- The thread rows go in as JSON arrays expanded with `json_each`, so no statement nears D1's 100-parameter or 2 MB limits. One batch writes the content and rows, increments the content generation, marks every open fetch job done so that an older fetch cannot overwrite the thread, and opens the Digest the caller sent.
- The caller's `keptComments` apply only in the batch that publishes that Digest, so a refresh keeps the last published selection readable until its Digest is accepted. A Digest from the Provider chooses its own Kept comments and keeps only ids it was shown.
- A Paste of the link alone refreshes the Item through oEmbed and keeps the stored thread.

### Supplied page

A Reddit post or comment link takes `page` as the Extension's fallback.

- When the Item already has a thread header (`reddit_threads`, so also a thread with no comments or no published Digest), the server refuses the page with 409 `page: the saved thread stays`, because a page holds fewer comments than the saved `.json` and would drop them at the next Digest. The check guards the batch that queues the page, so a `.json` save that lands meanwhile is never replaced.
- Otherwise the page takes the path of any sent page ([Publishing a sent page](extension-and-threadsift-bot.md#publishing-a-sent-page)). The Item keeps its Reddit Source and kind, gets the title, author and date of the page and the community from the link's `/r/<community>/` segment, and has no thread header and no comment rows.
- The 100-word minimum decides only whether the Item gets post text and images. Below it the Item keeps its title, author and community and stays a Reddit Item. A refresh by a page below the minimum clears the post text, the date and the stored images and advances the content generation (`empty-page`). The source and kind never change to Article.

## X

The owner chooses one reader in Settings. `routeOf` decides the route from the choice and the readers' states, and the fetch job follows that route and nothing else.

| Choice | Route |
|---|---|
| `auto` (also a missing choice) | The Grok Bot when its settings are saved and its key opens, otherwise the grok CLI when it is installed, otherwise Link-only |
| `grok-bot` | The Grok Bot only |
| `grok-cli` | The grok CLI only |

- When the chosen reader cannot be used, the fetch ends a Link-only Item with a note that names the cause (`items.x_note`, `X_READ_NOTES`). The other reader is not tried.
- `offeredReaders` leaves `grok-cli` out on the Worker, and `chosenXReader` counts a `grok-cli` row from a Node database as `auto`. On Cloudflare without a Grok Bot webhook, an X link becomes a Link-only Item.
- Each reread follows the current choice, except that while the job has an open Grok Bot task (`hasOpenIntakeTask`), `xRouteOf` keeps the bot route. A failed bot answer is never retried through the CLI.
- A Paste with `content` ignores the choice, because it makes no fetch job.

### Grok Bot

`readJob` asks `xRouteOf` before any plug-in or built-in fetch. On the bot route the job runs `xIntakeKind`, so the send, the wait, the cap and the retries are the Grok Bot task lifecycle ([AI tasks and Providers](ai-tasks-and-providers.md), Grok Bot). No other source is tried after a failure. A bot that never answers ends the Item `failed` with `gave-up`. A bot that answers `unavailable` ends it Link-only with the note `bot-unavailable`.

### Grok CLI

`grokXFetcher` is `Ports.xFetcher` (`null` on the Worker, and on the container when no `grok` binary is on `PATH` at start). The CLI is an agent harness. The status id is the only outside input in its prompt. Posts reach the model only as tool results, so a run can return an incorrect answer, which is why the check against X exists.

- The CLI has its own `GrokSlots` of width 2 (`CAPACITY.xFetches`, because xAI's quota is not Claude's or Codex's). A run waits up to 3 minutes for a slot and then runs up to 3 minutes. The fetch job's deadline on this route is the sum, and its claim adds the margin ([Jobs, leases and the schedule](jobs-leases-and-the-schedule.md), Deadlines, attempts and retries). Heavy posts took 90 to 110 s from the request, which is why the 120 s of other fetches is too short.
- The process starts with an environment built from nothing, so no key, proxy or `THREADSIFT_*` variable reaches it. The prompt asks the model for the post and a hostile post can override it, so the deadline and the 2 slots are the real bounds. The answer schema stays an object with a nullable `thread`, because the proven argument list (`PROVEN_ARGUMENTS`) is the one probed. The reader ranks the answer's replies and parses it with the parser a Paste uses, so the stored rows are the same.
- The run makes one `x_thread_fetch` for the post, which also returns its top replies nested under their parents (the one source of `parentId` for them), and one for each quoted post. Then it makes at most 6 `x_keyword_search` calls (`MAX_REPLY_CALLS`) with `mode: "Latest"` and `limit: 10`, the tool's largest limit: one for each band of likes (`min_faves:300`, `min_faves:100 -min_faves:300`, `min_faves:30 -min_faves:100`, `min_faves:10 -min_faves:30`, `-min_faves:10`), and one more with `max_id:<lowest id returned>` when a call returns 10 posts (`MAX_CALLS_PER_QUERY` is 2).
- The tool's `Top` mode is not ordered by likes, while `min_faves` filters exactly. On a post with tens of thousands of likes the first bands fill their pages with the band's latest replies, not its most liked. `max_id` is inclusive, so a band yields at most 19 distinct replies, and a repeated reply id in an answer keeps its first occurrence.

### The isolation rule

The run reaches the two X tools and the CLI backend's `web_search` and `open_page`. It reaches no local tool: no shell, file, edit, subagent, MCP or workflow tool.

- grok 1.0.77 cannot turn the backend tools off without losing `x_keyword_search`. `--disable-web-search`, `GROK_BACKEND_SEARCH=0` and `--disallowed-tools` with `web_search` each remove it, and `--tools x_thread_fetch,x_keyword_search` restricts nothing.
- The backend tools run on xAI's side and touch nothing on the host. A hostile reply can still make the model open a public page, which sends public post text and the Grok account's saved rules to a page of the attacker's choice. The stored answer still passes the shape checks (`XThreadSchema`, handle and size limits, `post.id` equal to the asked id) and the check against X, so a hostile run cannot store a post that X does not show under that id and author. A dedicated Grok account is the owner's mitigation ([Providers](../guides/providers.md)).
- The CLI's own record of a run holds the tool calls and the model's answer, never the tool results, so it cannot serve for the check.
- Probe: with the local tools of `DENIED_TOOLS` in `--disallowed-tools`, the run's `tool_definitions.json` is `[]` and the model still calls both X tools. A hostile prompt that asked for a file write, a file read and a page fetch could do none of the local things and fetched a public page through `web_search` and `open_page`. The hostile text sat in the prompt, not in a post, so no run showed a post steering the model.

#### The check at run time

The proven surface is one constant: the exact `grok --version` string (`PROVEN_VERSION`), the argument list and the local tool names the run exposes, which are none. `tool_definitions.json` under the run's `GROK_HOME` (not a documented interface) lists local tools only, so a change of the backend tools on xAI's side goes undetected.

- A preflight run with the same arguments and a prompt that holds no external text reads that file before the first real fetch after start, and whenever the binary's path, size or modification time changes.
- Every real run, a failed one too, is checked after it ends. A list with any tool refuses the fetch and bars the binary (`extra-tools`). A list that cannot be read discards the answer and proves again on the next fetch. A different version bars the binary (`version-changed`). A later result never replaces a bar (`keptBar`), because a run that started before a bar can end after it.
- A bar lasts until the process restarts or the binary changes ([Providers](../guides/providers.md) says how the owner clears one). The binary can still be replaced between the preflight and the process start, and only the check after the run covers that window.
- A refused fetch logs `x-fetch-refused` with the category `surface-unproven`, and Settings shows `not-proven` with the version. The constant changes only through a code change that records a new probe.

### The check against X

Both routes store the parsed thread unverified and unpublished and queue one `x_verify` job (`xVerifyHandler`). The Item shows nothing of the thread until that job publishes it.

```text
CLI or bot answer
      |
      v
stored unverified (x_verifications)
      |
      v
x_verify job: one oEmbed request per post, in slices
      |
      +-- X unavailable: wait, retry the x_verify job only
      |
      v
all posts judged: publish the joined text (post, quotes, author thread, photos)
```

- `x_verifications` holds the thread, its Digest, a `revision` that guards every write of the job, and the `judged` map of post id to verdict. Every write of content for the Item (`closeItemJobs`) closes its `x_verify` job and deletes the row in the same batch, so a waiting check cannot overwrite newer content.
- A thread whose JSON after reply selection exceeds `MAX_ROW_BYTES` is refused with a 400, because the row is one value under D1's 2 MB limit.
- The job asks X's public oEmbed (`GET https://publish.x.com/oembed?url=https://x.com/i/status/<id>&omit_script=1`, no login) per post, in slices of at most 40 planned requests, the root alone first. The root takes a slice of its own, and each other post plans 2 requests plus one for each link, up to 20 (`MAX_LINKS`). The 40 comes from the Workers Free plan's 50 subrequests per invocation. The first 429 or other unavailable answer stops the slice. The oEmbed slice runs under a 90 s signal (`X_VERIFY_DEADLINE_MS`). The publish then runs its checks under no signal, and a second 90 s signal bounds only the media storage of its settling step. The post text write takes none. One attempt can run both signals, so the claim lasts the 90 s plus `CLAIM_MARGIN_MS`, 210 s in all ([Jobs, leases and the schedule](jobs-leases-and-the-schedule.md)).

The rules are exact, with no similarity and no length guess.

- **Existence.** A post must exist on X under that id and author (the handle in `author_url`, compared without case). A 404 or 410 means X does not show it. A 403 means the same only when its JSON error exactly matches the recorded protected-post response ("Sorry, you are not authorized to see this status."). Any other 403 is unavailable.
- **Whole posts.** The stored text must equal X's text after one normalisation: white-space runs collapse and `<br>` is one separator. X drops the line break before a mention anchor that follows text with no white space, so that anchor reads as a separator. A mention joined to the word before it (`with@name` where X shows `with @name`) stays rejected.
- **Links.** A media link is ignored only when X's answer has the media anchor. Every other link must agree with the anchor in the same position, by `href`, by display text, or by the address its `t.co` link redirects to (one request that stops at the first redirect).
- **Cut posts.** A cut is recognised only by text that ends in U+2026, optionally followed by links, with a weighted length of at least 250 before the mark (`MIN_CUT_HEAD`, from recorded cuts). The weights are those of [twitter-text v3](https://github.com/twitter/twitter-text/blob/30e2430d90cff3b46393ea54caf511441983c260/config/v3.json): most Korean, Japanese and Chinese code points count 2, each link 23, each emoji sequence 2. The emoji sets come from the runtime's Unicode data, so Node and workerd may differ on the newest emoji. The stored text must start with the text before the mark, and the rest is stored unverified and counted.
- **Replies.** A reply can start with recipient handles that oEmbed omits. After any leading whitespace, each handle must be a whole `@name` followed by whitespace, with 1 to 15 ASCII letters, digits or underscores. The remaining text must be nonempty and agree with X. A mention X shows stays. The job saves the text without the removed mentions, with its verdict, before the next slice. A failing reply is dropped and counted, its replies move to the nearest reply that stays (or to the post), and the post's reply count is raised to at least the replies received plus those dropped.
- **Not checked.** A Paste with `content` (the caller's own statement), the tail of a cut post, media, anything oEmbed does not return, and the Digest that comes with an intake answer.

When X does not answer (a timeout, a 429, a 5xx, a redirect or any 403 other than the protected-post response), a post stays without a verdict. The slice saves its progress and waits with `x-verify` and the existing retry delays. It counts an attempt only when X was unavailable, and a slice that made progress runs again at once. On the last attempt the job ends `unreadable` on both routes (`x-verify-refused`) and shows nothing of the thread. A retry retries only the `x_verify` job, never the CLI or the bot. The oEmbed endpoint needs no authentication and documents no rate limit, and X's developer policy does not name this use (unverified).

When the check refuses the root of a CLI answer, the job discards the answer and queues the next fetch after the existing delay. The bot route and the last CLI attempt end the Item `unreadable` with `x-unconfirmed` and keep any previously published thread.

### Author thread

`joinedAuthorThread` appends the author's follow-ups to the post text after the check.

- A follow-up is a reply that passed the check, by the post's author, whose parent is the previous part, or a rejected reply of the author whose parent leads to the previous part, so a rejected middle follow-up does not hide the ones after it. An author's reply to another person's reply never joins. A reply that an earlier CLI reader moved to the post because its parent was missing (`repairedParent`, never accepted from a Paste or the bot) never joins either.
- Each follow-up follows after a blank line while the joined text stays within 1,000,000 bytes (`INLINE_TEXT_BYTES`). Follow-ups past that limit are left out like a rejected one. A last line says a part was not saved.
- When the post text, its quoted posts and that line pass the limit, `joinedPost` cuts the post text at a whole UTF-8 character (before a word that holds a link) and drops every quoted post and follow-up. The text ends with a cut note, and the post is saved. A post with no follow-up and no quoted post whose text alone passes the limit is refused.
- The follow-ups stop being replies, so the reported count drops by the follow-ups and rejected parts. The count of joined follow-ups is stored as `reddit_threads.follow_ups`, and the fewer-replies comparison counts comments plus `follow_ups` on both sides.
- A Paste with `content` joins the same way with every reply kept. Its text is not checked, so it gets the not-saved line only when the byte limit leaves a follow-up out.

### Replies kept

Both readers keep the most important replies by the 80/20 rule the owner chose. The cut runs before the check, so the check asks only for replies the Item keeps.

- Replies rank by likes, then by their own reply count (zero for the bot, which omits it), then by the older id. The cut keeps the smallest set of top replies whose likes reach 80% of all fetched likes (`X_REPLIES_LIKES_PERCENT`), never fewer than 20 (`X_REPLIES_MIN`) and never more than 40 (`X_REPLIES_KEPT_MAX`). When fewer replies qualify than the minimum, both readers keep all of them. The minimum makes the Item read as a discussion, not as its top few, and the maximum bounds a fresh read. Neither number is measured against the Digest ([Decisions and evidence](decisions-and-evidence.md), X replies read by the Grok CLI).
- Author-thread replies (`authorPartsOf`) are not ranked and count toward neither the likes total nor the limits. The cut runs before the check, so when the first follow-up fails, a later one that the cut dropped for few likes is not joined.
- Bot intake also keeps replies that the Digest names in `keptComments` (the bot's Digest, otherwise the pending one), even below the cut, so a bot read can keep more replies than a CLI read of the same link. Verification still checks every selected reply.
- A kept reply keeps its fetched ancestors on top of the limit, so the Reader draws the thread above it.
- Replies with empty text or the CLI placeholder `(No text content)`, and replies whose parent id is older than the root or at least as new as the reply, are not ranked, because verification rejects them.
- When the cut drops a fetched reply, the post's reported reply count rises to at least the replies fetched, so "Further replies were not saved" shows.
- The cut keeps at least as many posts as the Item holds (`storedReplyCount`), because refusing a thread with fewer replies than the stored one would otherwise reject a refresh that read the same replies. The owner chose that this floor wins over the maximum, so an Item stored with more than 40 replies keeps that count.

#### Partial threads

A run reads a few dozen replies at most. Every X thread follows two rules, whichever route it came from.

- When the post's reply count is larger than the replies in the thread, or unknown while replies exist, code (never the model) appends a `more` row, which the Reader shows as "Further replies were not saved" (`entriesOf`).
- A thread with fewer replies than the stored one never replaces it. The database decides at commit time (`holdsAtLeastStored` in each route's precondition). `publishThread` refuses a Paste with 400, and the CLI and the intake are refused with `x-fetch-refused` and `fewer-replies`. An owner who wants a smaller thread deletes the Item first.

### Quoted posts

`post.quoted` holds the chain the post quotes, in order. The grok answer schema requires it, so the run states the chain, empty or not.

- `x_thread_fetch` shows a post's quoted post inside its own result, so the run reads the next level by calling it again for the last quoted post. A post that only a reply quotes is never added. The cap is 5 (`X_QUOTES_MAX`), because each level costs the run one call and the check one oEmbed and one `t.co` request. The Grok Bot skill asks the bot for the chain with the same cap.
- Each quoted post gets an oEmbed request by its own id and the same rules. The ids must fall along the chain (each below the id of the post that quotes it) and differ from every other id of the thread, or the answer is refused (`checkedQuoted`) and a Paste with such a chain answers 400.
- A post that quotes another ends its oEmbed paragraph with the quote's own `t.co` link, which the stored text does not hold. The check ignores that link and asks for its address, then compares the status that link leads to with the next listed quoted post. When they differ, that quoted post is judged `rejected`. When the link leads to a post that no listed quoted post follows, that id is judged `rejected` too, and the join reads it as a quoted post that was not saved. A post with no link at all cannot quote, so a quoted post listed after it is rejected. A cut post shows no quote link, so the quoted post after it is accepted on its own check.
- The leading quoted posts, up to the first one judged `rejected`, go into the post text right after the post's own text and before the author thread, as nested Markdown block quotes (`joinedPost`). When a quoted post failed, did not fit or was left out, one line (`Quoted posts were not saved.`) stands where it would stand, and its room is kept before the quotes are fitted. The follow-ups fit after the quotes.
- The quoted text is part of the post text, so the Digest, search, the Reader, the export and the Vault mirror read it. The Digest takes the first bytes up to the AI input cap ([AI tasks and Providers](ai-tasks-and-providers.md), Measured Digest input budget), so a long post and thread lose the end of the thread before a quoted post.
- A refresh whose read lacks a quoted post that the Item held saves the line in its place. There is no stored count to compare, as there is for replies, so the owner pastes the link again.

### Images

The post, each quoted post and each reply carry `images`, the addresses of their photos.

- The CLI run copies them from the `Media` lines of the tool results (a video lists only a `video.twimg.com` address, so a video is not kept). The Grok Bot sends photos in its intake answer, which `XBotThreadSchema` takes. No run has read them through the bot's own tools yet ([Open items and unverified claims](open-items-and-unverified-claims.md)).
- An address is kept only when it equals its parsed form, is an `https://pbs.twimg.com/media/` address and is at most 4,096 bytes (`isXImageUrl`). The join writes each address as a Markdown image, so an address that equals its parsed form cannot carry Markdown into a post the check has already judged. The download refuses a redirect to any address that fails the same rule.
- Both readers keep photos only on author-thread replies. A Paste carries none, because `XThreadSchema` takes `images` only empty.
- The join puts each photo after the text it belongs to: after the post, inside the block quote of its quoted post, and after each follow-up. A post with an open code fence or an open HTML comment, `script`, `pre`, `style` or `textarea` block gets it closed first, or it would swallow the photo. A post of only photos has the tool's `(No text content)` placeholder replaced by an empty text, so X's answer, which holds only the media link, matches. Its title is `@<handle>`.
- `storeMedia` stores the photos at publish like an Article's images ([Media](data-model-outline.md)), inside the settling step of the `x_verify` publish and its 90 s signal. A photo that cannot be stored, or one past the 20 of the Item (`ITEM_IMAGES_MAX`), becomes the line `A photo was not saved.`.
- oEmbed holds the `pic.x.com` link of a post with media. A post with stored photos whose oEmbed answer has no media link loses its photos, and the check records `no-photos:<post id>` in `judged`. Which photo belongs to which post is not checked.

### Outcomes and notes

Outcomes map to existing fetch results only. When `structuredOutput` is null, the CLI reader parses the last JSON object at the end of `text`, and the final object wins.

| Situation | Attempts left | Last attempt |
|---|---|---|
| Answer the schema refuses | Wait `x-reread`, read again | Ask oEmbed once: absent gives `status` with `x-post-absent`, otherwise `unreadable` with `cli-failed` |
| `found: false` | Ask oEmbed once: absent gives `status` with `x-post-absent`, otherwise wait `x-reread` | Same, but otherwise `unreadable` with `cli-failed` |

- `outcomeOf` and `versionRefusal` map the run's end to a result and a category. `internal` marks an error of our own code, logged as `x-fetch-error` with the error's class and errno code and no message. `x-fetch-refused` names every category and the exit code and holds no output.
- The Item stores the cause of an `unreadable` result, or `x-post-absent`, in `items.x_note`. Every write of a fetch result sets it in the same statement, so a later successful fetch clears it.
- A Link-only Item with `x-unconfirmed` or `cli-failed` offers Try again. Every other `unreadable` and `status` result leaves no retry button, so the owner pastes the link again after signing in.

### Sign-in state

`GET /api/settings/x` answers the reader choice and the state of both readers (`readXSettings`).

- The first line of `grok models` gives the CLI hint. `You are logged in with grok.com.` is `signed-in`, `You are not authenticated.` is `signed-out`, and any other line or a timeout is `unknown`. `not-proven` is for a different version or a binary that failed the check.
- **Renewal after the banner.** `grok models` renews an expired login on its own and prints the signed-out line while it does, so after a first `signed-out`, `readSignIn` runs it once more in fresh per-run folders with the same `GROK_AUTH_PATH` and returns that result. Both runs share one 15 s bound, and the version check has its own 15 s in parallel, so both fit the 20 s page deadline.
- A known result with a version stays cached for 10 s, long enough that reloads start no second pair of processes and short enough that a sign-in shows within a reload.
- The app never reads, copies or returns `auth.json`.

### Supplied X thread

`POST /api/items` with `content` for an X link is exactly one JSON text (`saveThread`). A second text, `page` and `fill` answer 400.

- `XThreadSchema` defines the shape. Every id is a digit string with no leading zero, because status ids are above 2^53. A handle is letters, digits and underscores only, so no `@` or space reaches the Reader's byline or the OP comparison. `images` stay empty.
- `parseXThread` returns the same `ParsedThread` as the Reddit parser, so `publishThread`, the content generation, the closing of open fetch jobs and the Digest opening are the Reddit code. The bounds are the Reddit parser's plus 500 replies (`X_REPLIES_MAX`).
- The title is the first line of the post text, cut at a word to 120 characters (`postTitle`), until a Digest gives a clean one. `archived_at` is null.

## Other

A Link-only Item with the page's `<title>` (`readTitle`), or Defuddle's title when the page has none, and no AI task, because there is no text to digest.

## One hop

A Reddit post's Digest also reads the page the post links to, when that page is an article or a GitHub repository.

- `chooseCandidateLink` picks one link per post when the thread is saved: the post's `url` (Reddit's link target), otherwise the first link in the post text (images excluded). A link must be `http` or `https`, at most 4,096 bytes, and not a Reddit or X link, a `redd.it` media host, a video host or a refused address (`isRefusedLink`). A failing link is skipped for the next. A self post's `url` is its own permalink, so it is skipped. A saved Reddit comment, an Article, a GitHub repository and the Extension's Reddit `page` fallback get none. Every way a Reddit thread arrives sets it, because they share `parseRedditThread`.
- The hop runs in the Digest job before the model call (`hoppedPage`), not in the fetch job, because a thread saved with `content` closes the Item's open fetch jobs. The hop calls `fetchLink`, so the Article and GitHub fetchers, the fetch guard, the saved GitHub token and the GitHub cooldown apply as for a pasted link. Plug-ins are asked about an Item's own link only. The hop has its own fetch-deadline signal and a fixed GitHub `attempts` of 1, so AI retries do not change GitHub backoff.
- Only Article text or a non-empty README counts as linked text. A refused address, a timeout, a non-2xx answer, a page that is not an Article, a repository without a README, a GitHub `waiting` answer and a `github-token` answer each give none. The Digest still runs on the post and the Kept comment candidates, and the hop adds no attempt, failure or deferral. Nothing of the page is stored as Item records. The excerpt, its URL and title stay in the AI task's `inputs`, and Try again or a refresh fetches the page again.
- After the hop the job checks the generation, the pending Digest and the open fetch again before it spends a model call (`staleOutcome`). A stale run requeues at the same attempt count, so a refresh or caller Digest that arrives during the hop never receives the old result. A caller-sent Digest makes no hop and no model call. After a hop with no linked text and no other text, the run ends as empty input.
- `hasDigestSource` is the one predicate that job opening, the scheduling of older Items when a Provider is saved, the clearing of a pending Digest with no text, the Digest view and the retry action read. It counts a current-generation candidate when no caller Digest is pending, because a pending Digest publishes without a hop.

## Plug-ins

Container only. The loaded plug-ins are the registry `Ports.fetchers`. A self-hoster's fetcher is an ES module whose default export is a `Fetcher`: `matches(url)` returns a boolean, and `fetch(url, { signal })` returns a promise of a page. `THREADSIFT_FETCHERS` is a comma-separated list of modules, and the container loads every one before it starts any work. The Worker loads none, because its bundle is built from the repository, so a plug-in there means a fork. A plug-in is trusted code of the Instance's owner, and nothing here sandboxes it.

- A plug-in returns `markdown`, `title` and optional `author` and `published`, the fields of the Extension's page without `videos`. A strict Zod object (`PluginPageSchema`) parses the answer, so an unknown field fails it. The serialized answer is at most 1,000,000 bytes (`PAGE_BYTES`), with no truncation. An empty `title` ends the fetch `no-title`. The context carries the deadline signal only: no database, file store, sealer, `Network` or `Ports`.
- The core asks `matches` only for a link that takes a page: never an X or GitHub link, and never a Reddit link that is not a post or comment, because a page there would lose the repository or post kind. A Reddit post or comment is asked only while the Item holds no thread, and its page publishes through the Reddit page path ([Supplied page](#supplied-page)). Every other link publishes through the sent-page path: 100 words or more become an Article, fewer a Link-only Item with the plug-in's title. A video-host link keeps the title-only publication. A short link is asked by its resolved address.
- Before any `matches` runs, the loaded wrapper refuses a name under `.localhost` and a literal address that is not globally reachable (`assertPublicHost`), then resolves the host and applies `publicAddressesOf`, the classification of the container's connect-time `lookup`. A host that resolves with no globally reachable address ends the fetch `refused`. A host that does not resolve is still offered, because the plug-in may know it. The check covers the link a plug-in is asked about, not the plug-in's own network calls.
- `readJob` asks the plug-ins before the built-in route, in listed order, only for a job with no Extension page, which wins over every plug-in. The first `matches` that returns `true` fetches, and nothing else runs for that link. The answer reaches the Item only through the fetch job's guarded finishing batch ([Jobs, leases and the schedule](jobs-leases-and-the-schedule.md)), so an answer that arrives after the job was closed or taken over publishes nothing.
- `matches` must return the boolean `true` or `false`. A thrown error, a Promise or any other value is a plug-in failure, and so are a thrown or rejected `fetch`, an answer that fails the schema and one over `PAGE_BYTES`. Each ends the fetch `unreadable` without trying later plug-ins or the built-in route, so a broken plug-in shows as a failed fetch and not as quietly different content. `unreadable` keeps earlier content, Highlights and Note.
- A plug-in runs in the app process with the Instance's environment, files, database and `THREADSIFT_SECRET_KEY`. The container runs up to 4 jobs at once (`CAPACITY.jobs`), and a retry or lease takeover may call a plug-in again for one link, so exactly-once is not promised. Its own network calls do not pass `guardedFetch` ([Private addresses](#private-addresses)).

### Deadline

The plug-in gets the fetch job's deadline signal. `pluginPage` calls nothing when the signal has already aborted, so a throwing matcher cannot turn an expired deadline into `unreadable`. Otherwise it races the answer against the signal. Only that signal aborting gives `timeout`: a matcher that throws after the signal aborted and a signal that aborted before the plug-in's `fetch` starts (which is then not called) give it too. An `AbortError` thrown while the signal is open is a plug-in failure.

The deadline stops the app waiting, not the plug-in: a synchronous loop, a runaway allocation, a timer or `process.exit()` still reach the whole process. Process isolation is not built, because the spec gives no isolation promise ("at their own risk").

### Loading

The loader runs first in `startNode`, before the CLI runners, the job loop and the listener, and lives in the Node target because the core folders refuse a computed `import()`.

- An entry is an absolute path, or a `file:` URL with an empty or `localhost` host and no query or fragment. Any other entry, a missing file, a directory, an empty entry and two entries with the same real path fail the start. Zod checks the default export (`z.function()` would wrap the function and check nothing).
- A failure throws one error with the module as written, a fixed stage word (`specifier`, `file`, `import`, `shape`) and the failure's class name, so the module's own error text is not printed.
- The import has 30 s (`IMPORT_DEADLINE_MS`, half of the 60 s the start check waits), so a module whose top-level `await` never settles fails the start with `TimeoutError`.
- `.mjs` (recommended) or `.mts` work. `.js` and `.ts` follow the nearest `package.json` `type`. `.ts` runs on Node's type stripping, so it takes only erasable syntax, explicit import extensions and no `tsconfig.json`.
- Loading happens at start only, so adding or removing a module needs a restart. No screen lists plug-ins, and the start-up lines (`fetcher-loaded`) are the record.
- Each plug-in failure writes one `fetcher-failed` line with the module as written, a fixed stage word (`matches`, `fetch`, `page`, `size`, `timeout`) and the error's class name, and no URL, message, stack or page content. Plug-in code can call `console` itself.

## URLs and short links

One normalizer (lower-case host, no `www.`, tracking parameters dropped, short links followed) gives each Item its identity.

- A redirect to Reddit or X stops without a request, so the oEmbed-only and X no-request rules ([Spec](../spec.md), Product) hold for a short link or a redirect. The pasted URL stays the identity, and the answer is `redirect-stopped`. The 21st redirect answers `redirect-limit` even when it points to Reddit or X. One hop is the exception: a short link that redirects to a Reddit share link sends that share link's own request, with the share-link policy below, and the Item follows the share link to the post or comment. That hop is one request that follows no redirect, so a short link sends at most 21 requests, the first and one for each of 20 redirects, whether or not it ends on a share link.
- A short link (`SHORT_LINK_HOSTS`) or a Reddit share link is the only redirect that changes an Item's identity. Its final URL becomes the Item's URL, and the short link is recorded as an alias ([Short-link aliases](data-model-outline.md#short-link-aliases), which also says what a failed resolution saves). `resolveShortLink` reads no body on a hop that is not a short link host, because the fetch job reads the page, so a page that stalls after its headers still resolves. A short link that already has an alias is not resolved at all, unless the alias's address is a Reddit share link, which names no post or comment and so counts as not resolved ([Short-link aliases](data-model-outline.md#short-link-aliases)). Any other redirect only decides where the title comes from.
- A final dot on a host (`x.com.`) is dropped before any of these rules.
- A Reddit share link answers a redirect without a login, a cookie or a challenge: a 301 to `/r/<community>/comments/<post>/<title>/` for a post, or `/r/<community>/comments/<post>/comment/<comment id>/` for a comment (32 of 32 links checked on both targets). An unknown or removed code answers 307 to the community root, `old.reddit.com/r/<community>/s/<code>` answers 302 to a login page, and `reddit.com/s/<code>` answers 301 to a page that answers 200. Those links are saved as pasted.
- A page from a short link host that ends the chain as HTML with a `<meta http-equiv="refresh">` of delay 0 counts as one more redirect, per the HTML standard's [shared declarative refresh steps](https://html.spec.whatwg.org/multipage/document-lifecycle.html#shared-declarative-refresh-steps). The target goes through the same address, Reddit and X, `http(s)` and 20-redirect checks, and a page on any other host is never followed this way. tinyurl.com needs it, because it sometimes answers an old link with a 302 to a preview page whose head holds the refresh.

## Private addresses

A pasted link, a one-hop link or a redirect could point a fetcher at the server's own network, and the page would then be stored, served over MCP and mirrored to GitHub. So every request to a pasted address goes through `guardedFetch`. The one exception is a plug-in's own network calls (the images in its Markdown still download through the guard).

The guard follows redirects by hand and checks each hop before it connects. The `Network` port makes one request per call without following redirects: the container's adapter is `node:http` and `node:https`, and the Worker's is the global `fetch` with `redirect: "manual"`. On Cloudflare, that `fetch` answers a host that does not resolve with Cloudflare's own `530` and the body `error code: 1016`, so the Worker's adapter turns that answer into a network failure, and a new Item ends `failed` as on the container.

- A literal address is allowed only when it is global unicast and outside every block of the IANA special-purpose registries whose Globally Reachable value is not True, plus multicast and the reserved IPv4 block. The guard also refuses `2002::/16` (6to4), decodes the IPv4 address embedded in `64:ff9b::/96` ([RFC 6052](https://www.rfc-editor.org/rfc/rfc6052)), and refuses `64:ff9b:1::/48` whole, because the registry marks it Globally Reachable False. Blocks whose registry rows hold a True sub-block (`192.0.0.0/24`, `2001::/23`) are refused whole. The URL parser turns `2130706433` and `0x7f.1` into `127.0.0.1` before the check. `localhost` and every name under `.localhost` are refused by name ([RFC 6761](https://www.rfc-editor.org/rfc/rfc6761)).
- On the container, the adapter passes a `lookup` function to `http.request`, so the check runs on the addresses the connection will use, and the name is never resolved a second time. A name such as `localtest.me`, which resolves to `127.0.0.1` in public DNS, is refused after it resolves.
- A Worker deployed on Cloudflare cannot reach the owner's network, so there the check covers literal addresses and `localhost` only. The local Worker under `wrangler dev` runs on the owner's machine, so the missing name check matters there ([Open items and unverified claims](open-items-and-unverified-claims.md)).
- A fetch that ends `status` writes one `fetch-status` line with `httpStatus`, the status of the last hop, and no URL, host or body. The Item keeps `status` without the code, so this line shows whether the host answered 404, 429 or 503.

### Limits

Every hop has an 8 s deadline from the lookup to the last body byte (`HOP_DEADLINE_MS`). The guard follows 20 redirects (the Fetch standard's own limit) and cuts the body at a cap after content decoding.

- An HTML page fetched for a pasted link is cut at the page reader's `maxHtmlBytes` (see [Article](#article)). A page of any other media type, the Reddit oEmbed call and the HTML of a short link host are cut at 512 KiB (`DEFAULT_BODY_BYTES`). A cut body is never read as an Article.
- The adapter passes `autoSelectFamilyAttemptTimeout: HOP_DEADLINE_MS` to `http.request`. Node gives each attempt that time before it tries the next address (250 ms by default) and cuts the last attempt at it, so a smaller value ends a host whose addresses all hang early. The cost is a host whose first address drops packets while a later one works: it uses up the hop and answers `timeout` on the container.
- A connection that never answers and a body that stalls after the connection is open both run to the 8 s deadline on both targets.

### Posting to the Grok Bot

`Network.post(url, body, signal, headers)` makes one POST without following a redirect, so a 3xx answers as a status. The core allows the saved address only as `allowedAiUrl(address, true)` (public `https`, no credentials, query or fragment), not by the container's own AI rule (`publicOnly: false`), which accepts `http` and private hosts.

- On the container, `lookup: globalAddressesOnly` refuses a name that resolves only to non-global addresses at connect time, so a public name that resolves to 10.0.0.1 answers `refused` with no request sent.
- On both targets, `networkOver` refuses a literal private address and a name under `.localhost` before a POST (`assertPublicHost`), because Node skips `lookup` for a literal address. Both adapters send one header set (`User-Agent`, `Accept` and `Accept-Encoding: identity`, then the caller's headers, lower-cased). When the origin honours `identity` ([RFC 9110, section 12.5.3](https://www.rfc-editor.org/rfc/rfc9110#section-12.5.3)), an answer with a `Content-Encoding` the container cannot decode does not become `unreachable`. What a deployed Worker puts on the wire for `Accept-Encoding: identity` is unconfirmed.
- The Worker cannot check the address a public name resolves to, because Cloudflare resolves it, so a name that points to a private address is checked on the container only. Three more limits depend on the deployed Cloudflare network and are not enforced. Each stays a limit of the Worker target, because only the owner sets the address.
  - Without the compatibility flag `global_fetch_strictly_public`, which `wrangler.jsonc` does not set, a `fetch` to a host in the Worker's own zone goes to that zone's origin server, so a saved address in the Instance's own zone would reach the origin with the key in two headers.
  - For a site proxied by Cloudflare, a port the proxy does not support is ignored, so `https://host:12345/` would reach port 443.
  - A Workers subrequest can only go to a URL, not to an IP address.
- The key travels only in `Authorization: Bearer` and `X-Automation-Key`. The ping writes one `grok-bot-ping` line with no address and no key.
- A wrong key answers 401 and a routine id that does not exist answers 401 too, so a wrong id shows `wrong-key`. `not-found` and a 403 were not seen.
