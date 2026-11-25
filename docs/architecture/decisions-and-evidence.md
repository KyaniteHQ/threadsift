# Decisions and evidence

[The spec](../spec.md) states what the app does. This page holds the reasons behind its product decisions and the measured or sourced facts the spec leaves out. A fact here carries the command, address or source that shows it. [Open items and unverified claims](open-items-and-unverified-claims.md) holds a fact no run has proven.

Contents: [Product decisions](#product-decisions), [Design review](#design-review), [Reddit](#reddit), [AI providers](#ai-providers), [Grok Bot](#grok-bot), [The hosted product](#the-hosted-product), [The library wiki](#the-library-wiki), [Trigger depth on D1](#trigger-depth-on-d1), [Worker HTML cap](#worker-html-cap), [X replies read by the Grok CLI](#x-replies-read-by-the-grok-cli), [Parse time of a page](#parse-time-of-a-page), [Worker: ports and app built for each request](#worker-ports-and-app-built-for-each-request), [CPU of a login and a fetch job](#cpu-of-a-login-and-a-fetch-job), [Aborted list reads](#aborted-list-reads).

## Product decisions

- **Name.** Threadsift was picked from 26 checked names for free `.app` and `.dev` domains and no app or real repository of the same name. The repository is named to match. The masthead wordmark reads Threadsift. Words inside the app and the Style named Library stay as the glossary and the design define them.
- **Licence.** AGPL-3.0-only, so a rival hosted copy must publish its changes. The contributor licence agreement (CLA) applies to outside contributions. Contributors keep copyright in their contributions and grant Kyanite Labs a perpetual, irrevocable, non-exclusive licence that includes the right to sublicense. This lets Kyanite Labs license contributions under other terms (CLA section 2).
- **Build or adopt.** The app is its own. Karakeep, Linkwarden, Shiori and Raindrop were rejected as the base. Karakeep was the closest, but it crawls the links it is given and has no comment-thread model, so a saved thread would become flat text, and its open issues report blocked Reddit crawling ([#2885](https://github.com/karakeep-app/karakeep/issues/2885)) and ask for saving X threads ([#1468](https://github.com/karakeep-app/karakeep/issues/1468)). Its repository and docs were read on 2026-11-03.
- **A public address.** Grok Bot's MCP connections run on Cursor's servers (Grok Bot's own answer), so the app needs a public HTTPS address.
- **Tags.** Only the agent sets Tags, and Proposals keep the lists clean over time.
- **The Threadsift bot.** It ships as a public Grok Bot template. Its skill files are in this repository so the bot stays in step with the API, and it has one short profile because a template has one profile field.
- **Obsidian.** The mirror is one-way, as Readwise's Obsidian sync is: the owner reads in Obsidian and edits Highlights and Notes in Threadsift. Vault repositories on other Git hosts are not in the first release ([the spec](../spec.md)).
- **Design of new screens.** Every screen the first design lacks is built from the design system to match the existing screens. The building agent checks each from screenshots in every theme before it lands, and decides the approval.
- **One codebase.** EdgeEver and Open Managed Agents already ship one app on both targets.
- **Token budget default.** A new token starts at 200 Items a day. This is the maintainer's choice, not a measured value.

## Design review

Impeccable Reviews is a GitHub App in closed beta, and its hosted pull request reviews do not run without per-PR previews. The building agent checks screenshots in every theme before landing ([Reviewing code](../agents/reviewing-code.md)).

## Reddit

Reddit blocks anonymous `.json` (HTTP 403), does not take new API access requests, and its app-registration page says "Remaining public API access will end in March 2027". Its User Agreement forbids scraping without written consent, and its Developer Terms forbid paid use of Reddit data without an agreement.

- A tab the owner opened by hand sends no server traffic to Reddit, and the archive fill sends none either.
- Only a connected account makes the owner's own server request threads from reddit.com, with the owner's own session.
- Readeck's add-on works the same way and still works. Tools that fetch Reddit from a server (Linkwarden, Karakeep) are blocked.

Measurements behind the Reddit fetch:

- On a 671-comment thread in the owner's browser, the page held 100 comment elements, and the `.json` returned 465 comments plus 199 behind `more` stubs. `/api/morechildren` answered 403 even to a signed-in session, so the fill uses permalinks (`/comments/<post>/_/<comment id>.json?limit=500&raw_json=1`).
- On a 677-comment thread the first `.json` gave 464 comments and 34 stubs. 67 permalink requests, all HTTP 200, brought it to 659 in 51 s (a throwaway account from a home address).
- Arctic Shift returned 661 comments with no `more` stubs for the 671-comment thread in 1.4 s, with no key, from a home address and from a Worker. 24 of the 661 were marked deleted later and are dropped.
- With the owner's account, the container's platform `fetch` got HTTP 200 from a home and a datacenter address. On Cloudflare, the Workers `fetch` got 403 for the thread's `.json` even with the cookie, while a raw TLS socket from the same Worker got HTTP 200 with 464 comments in 3 of 3 runs. So the Worker sends these requests over a socket.
- Reddit's `me.json` answered 403 with its network-security page for an altered session and 200 for a valid one, so one 403 does not expire the session. The rule that does is in [Fetchers](fetchers.md) (Reddit).
- A `reddit.com/r/<community>/s/<code>` share link needs one redirect, which Reddit answers without a login ([Fetchers](fetchers.md)).

## AI providers

The owner chose `claude-sonnet-5-5` at medium effort for Claude Code and `gpt-6.2-sol` at medium for Codex. The comparison ran Digests on 20 Items from the owner's library on 2026-11-18 with the provider comparison tool ([Providers guide](../guides/providers.md), Compare Providers) at revisions `fd4eee8` and `d43acd8`. The records stay outside the repository.

| Provider | Model | Effort | Digests | Median call | Longest call |
|---|---|---|---:|---:|---:|
| Claude Code | `claude-sonnet-5-5` | Medium | 20/20 | 5.6 s | 9.1 s |
| Claude Code | `claude-sonnet-5-5` | High | 20/20 | 7.1 s | 20.0 s |
| Claude Code | `claude-sonnet-5-5` | CLI default | 20/20 | 5.5 s | 8.6 s |
| Claude Code | `claude-haiku-5-5` | CLI default | 20/20 | 10.3 s | 22.3 s |
| Codex | `gpt-6.2-sol` | Medium | 20/20 | 15.3 s | 26.1 s |
| Codex | `gpt-6.2-sol` | CLI default (low) | 20/20 | 13.9 s | 22.6 s |

Workers AI bills by use. The free OpenRouter rows returned 6 Digests across 120 attempts in the comparison. Grok Bot has no model field. These Providers have no recommendation.

- Anthropic, OpenAI and xAI have no successful live run until the owner supplies a key. Only their refusal of a wrong key ran against the vendors. OpenRouter ran a real Verify on the container with a free model.
- OpenRouter turns a new key on some seconds after it makes it (up to 17.2 s in 16 runs), so Connect saves the key and then checks once a second for up to 45 s.
- Anthropic allows "an end user… signing in to the unmodified Claude Code binary with their own Claude subscription" and forbids a third party from offering "Claude.ai login" or routing plan credentials for its users (`code.claude.com/docs/en/legal-and-compliance`). So the hosted product never offers a Claude plan login. Plan limits are small for an Import, so the Import screen suggests an API key when a plan Provider is picked.

## Grok Bot

The Grok Bot capabilities in [the spec](../spec.md) (Grok Bot) come from the owner's Grok Bot, which marked each answer as checked or inferred.

## The hosted product

Comparable hosted services cost $3 to $13 a month (Karakeep $4, Linkwarden $3, Readwise Reader $7.99, mymind $7.99 to $12.99, from their pricing pages). Threadsift's price is not decided. The rules that bind the hosted product are in [the spec](../spec.md) (Hosted product).

## The library wiki

The wiki follows the [LLM wiki idea](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): the agent builds the synthesis once, when an Item arrives, and keeps it current. The rules in [the spec](../spec.md) (The library wiki) answer the known failures of LLM wikis, taken from the gist's comments:

- A wrong merge becoming a permanent error: overviews cite their Items, and changes go through Proposals.
- Human corrections lost to regeneration: Pins.
- Near-duplicate pages from parallel updates: an overview revision is accepted only while the Topic's inputs are still the ones the run read, a second run is refused and queued again, and Grok Bot starts one overview task per Topic at a time.

## Trigger depth on D1

D1 refuses a statement whose trigger programs nest more than 10 levels, with `triggers nested too deep: SQLITE_ERROR`. It counts the nesting when it compiles the statement, so a trigger that never fires still counts. A project that hit it reports the limit of 10 levels and the compile-time check in [QNFO/qnfo-workers issue 4678](https://github.com/QNFO/qnfo-workers/issues/4678). The [D1 limits page](https://developers.cloudflare.com/d1/platform/limits/) (read 2026-11-21) does not mention triggers, so Cloudflare does not confirm the number.

`node:sqlite` has no such limit, so a test on the container does not show it. Local D1 reproduced the error on a design where every subject table cascades from `proposals` and has a trigger back to it ([Proposals](../proposals.md), The lifecycle). A table that cascades from `proposals` while a trigger of its own deletes `proposals` closes a loop that the subject tables multiply. So the subject tables hold the reference to `proposals(id)` with no action, and a Proposal is removed through its subject row.

A change that adds a trigger or a cascade to a table that an Item, Tag, Topic or Highlight delete reaches must run on local D1 with those deletes before it lands.

## Worker HTML cap

The Worker reads at most 900 KiB (921,600 bytes) of a page's HTML, because a Worker isolate has 128 MB ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)). The cap lies between the largest measured page that stayed under 128 MB and the smallest that passed it:

| Page | HTML bytes | Peak above idle |
|---|---|---|
| Bread | 619,662 | 39 MiB |
| Bird vocalization (revision 1380253618) | 866,784 | 58 MiB |
| Tale of Two Cities (Gutenberg 98) | 944,391 | 194 MiB |
| Great Expectations (Gutenberg 1400) | 1,098,188 | 249 MiB |
| Moby Dick (Gutenberg 2701) | 1,450,985 | 287 MiB |
| Anna Karenina (Gutenberg 1399) | 2,222,084 | 1,012 MiB |
| War and Peace (Gutenberg 2600) | 4,039,247 | 1,490 MiB |

Local `wrangler dev` does not enforce the 128 MB limit, so each number is the peak resident memory of the `workerd` processes (`VmHWM`, sampled every 25 ms during one Paste in `wrangler dev` 4.156.0 on 2026-11-06) minus the same measure for a Paste of `https://example.com/` (214.9 MiB). That counts the whole process, so it overstates the isolate. A text-heavy page just under the cap may still pass 128 MB, so Worker memory stays in [Open items and unverified claims](open-items-and-unverified-claims.md).

## X replies read by the Grok CLI

The reply cut in [Fetchers](fetchers.md) keeps at least 20 and at most 40 replies. Both numbers are our choice. For the DeepSeek post (`https://x.com/deepseek_ai/status/2121247896918253875`, 465 replies reported) the 80% likes rule alone keeps 6 replies, so the minimum brings in the next ones down to the 20th. A fresh read returned 31 replies for that post and 53 to 67 for posts with tens of thousands of replies.

Measured on 2026-11-15 with grok 1.0.77 on the container:

| Run | Result |
|---|---|
| DeepSeek post, one at a time | 31 replies in 73, 77 and 78 s in the app; 5,700 to 6,100 output tokens; 0.30 to 0.33 USD per read |
| 3 X posts pasted at once | 2 ran side by side; the third waited about 70 s for a slot, so the run deadline counts from the slot, and all 3 Items ended `ready` |

## Parse time of a page

`projectText`, `scanMarkdown` and the Reader parse a page's Markdown with `GFM_PLUGINS`. The stock GFM parser takes seconds on one paragraph of many short lines of plain words. `projectText` on about 1 MB of one paragraph (Node 26.13.1, 2026-11-20, load average 5 to 17):

| Page | Stock GFM | `GFM_PLUGINS` |
|---|---|---|
| 20 characters a line, 999,998 bytes | 25.7 s | 1.4 s |
| 80 characters a line, 999,944 bytes | 6.0 s | 0.7 s |
| 200 characters a line, 999,974 bytes | 2.9 s | 0.7 s |
| 1,000 characters a line, 999,998 bytes | 1.0 s | 0.6 s |
| 80 characters a line, 599,966 bytes | 2.8 s | 0.6 s |

The 20-character row is `projectText` on 47,619 lines of `lorem ipsum dolor si`.

### Cause and the two guards

The cause is `micromark-extension-gfm-autolink-literal` 2.1.0, which tries its construct at every word start. Each failed try leaves a new `data` token next to the one before, and `resolveAllText` (micromark 4.0.3) merges each such run with `events.splice`, which moves every later event of the paragraph. A counter around `Array.prototype.splice` saw 4,000 splices move 80,004,000 events for 4,000 lines of 20 characters, so the cost grew with the square of the lines.

`DATA_RUN` takes the text of a failed try into the `data` token before it, so no run is left to merge. It ends a token where `initializeText` does, by calling the `previous` check of every construct that `this.parser.constructs.text` lists for the next code. A micromark update that changes that rule is not noticed by any test.

Four shapes still cost the square of the paragraph after `DATA_RUN`, because the time goes into the resolvers that run once the paragraph is tokenized, and `DATA_RUN` acts while it is tokenized. `DELIMITER_OVERFLOW` limits them. It is the first text construct for `!`, `*`, `[`, `]`, `_` and `~`.

- While the paragraph's text tokenizer holds fewer than `PARAGRAPH_EVENT_CAP` (20,000) events, it refuses before it consumes anything, so a parse below the cap is the parse without it.
- From 20,000 events on, it takes the delimiter into the `data` token before it. No later `*`, `_`, `~`, `[`, `![` or `]` then starts attention, strikethrough, a label, a link, an image or a footnote call. `<https://...>`, `www.`, `http://` and email autolinks and code spans still work past the cap.
- `PostText` and `projectText` both parse with `GFM_PLUGINS`, so the Reader and the server read the same text past the cap and a Highlight's quote still matches.

The `[` and `!` keys matter as much as `]`. A `]` that reads as text leaves every later `[` unbalanced, and `previousUnbalanced` in `micromark-extension-gfm-autolink-literal` 2.1.0 then walks the events back to the last unbalanced label at each word start. With only the `*`, `]`, `_` and `~` keys, one paragraph of 900 `[a](b)` links followed by single-word lines cost 166,341 ms of CPU at 250,000 bytes. With all six keys it cost 1,963 ms.

### What the cap does not cover

The cap stops the six delimiters and not the growth of the event list. Line endings and character escapes still add events past the cap, and a lone `[` before the cap stays unbalanced, so the same walk stays quadratic for `"[ "` followed by lines of `a b c d e` (8,637 ms at 125,000 bytes) and for `"[ "` followed by `a\. ` repeated (50,959 ms), within 5 % of the stock parser. Ending that walk means taking ordinary text and line endings past the cap. A paragraph's line endings must stay events: a construct on every code that consumed the rest of the paragraph made `micromark-util-subtokenize` throw `RangeError: Cannot access index 27504 in a splice buffer of size 27504`. These shapes stay a cost of the parser, and no figure here holds for a page that contains them.

CPU milliseconds of one `parse` of one paragraph, without and with the cap (Node 26.13.1, 2026-11-20 and 2026-11-21):

| Shape | Where the time went | 125,000 without | 125,000 with | 1,000,000 without | 1,000,000 with |
|---|---|---|---|---|---|
| `a* ` repeated (closers with no opener) | `resolveAllAttention`, which scans back once for each closer | 16,226 | 501 | over 2,220,000, not finished | 1,808 |
| `a] b` lines (stray `]`) | `tokenizePotentialGfmFootnoteCall`, which walks the events back for each `]` | 9,915 | 1,336 | 1,876,309 | 5,644 |
| `*a* ` repeated on one line (emphasis pairs) | `splice` of `micromark-util-chunked`, once for each pair | 5,079 | 357 | 366,919 | 1,362 |
| `~~ab~~ cd ef ~~gh~~ ij` lines (strikethrough pairs) | `resolveAllStrikethrough`, once for each pair | 1,888 | 523 | 46,780 | 2,308 |
| `lorem ipsum dolor si` lines (plain words) | none; `DATA_RUN` | 501 | 193 | 2,017 | 1,363 |

The plain-words row shows the cap leaves a paragraph with no delimiter alone. The `a* ` run at 1,000,000 bytes without the cap was stopped after 37 CPU minutes, so its cell is a lower bound. The first row is `remark-parse` with `GFM_PLUGINS` on `"a* "` repeated 41,667 times.

A page of about 1 MB with one `*emphasis*` pair on each 80-character line took 2.4 s with `projectText` before the cap and 1.8 s with it.

### Why the cap is 20,000

The owner chose 20,000. The cap counts the entries of the paragraph's text tokenizer when a delimiter begins: 4 for a soft line break, 8 for an emphasis or strikethrough pair, 28 for an inline link and 30 for an image. So 20,000 is about 5,000 wrapped lines, 2,500 pairs or 700 links. Three corpora, parsed with a cap too high to act, gave the largest count at each `*`, `_`, `~` or `]`.

| Corpus | Documents | Largest | 99th percentile | 1,000 or more | 5,000 or more | 20,000 or more |
|---|---|---|---|---|---|---|
| Markdown that people wrote: this repository's, the READMEs and changelogs under its `node_modules`, and those of other repositories on the machine | 957 | 804 | 522 | 0 | 0 | 0 |
| HTML reference pages (Python, PostgreSQL, SQLite, Nix, OpenSSL and zsh documentation), converted to Markdown by `readArticle` | 868 | 24,152 | 5,648 | 41 | 9 | 2 |
| Conversational prose in 1,268 text blocks, a stand-in for comments | 1,268 | 954 | 806 | 0 | 0 | 0 |

The 9 converted pages at or above 5,000 are index pages that turn a list of 490 to 6,702 links into one paragraph, and OpenSSL manual pages whose synopsis paragraph holds about 1,000 `*`. The corpora held no Reddit posts or comments, no X posts and no news articles, so how often those reach a cap is not known. A saved page is denser than Markdown that a person wrote.

CPU seconds of one `parse` of a 1,000,000-byte page made of paragraphs of one size, the highest of a sweep from 1,000 to 160,000 bytes a paragraph, for four shapes (the sweep ran with the first four keys):

| Cap | `a* ` | `a] b` | `*a* ` | `~~ab~~` lines |
|---|---|---|---|---|
| 5,000 | 7.6 | 8.1 | 7.2 | 4.7 |
| 10,000 | 14.1 | 15.2 | 6.9 | 4.4 |
| 20,000 | 24.4 | 24.2 | 8.6 | 4.6 |

The cost of these shapes grows in proportion to the cap. At 5,000, 9 of the 868 converted pages show raw Markdown after the cap and the shapes cost at most 8.1 s. At 20,000, 2 of 868 do and the shapes cost up to 24.4 s, which keeps more converted pages whole at the price of that cost.

A parse below the cap is the parse without the construct. A differential run compared the mdast and the hast, positions included, of the stock parser and of the cap on 471,958 documents (random strings, Markdown fragments, longer and inline-only documents, and 958 Markdown files). No document below the cap differed, and each of the 20 inline documents that reach it does. A copy of the cap set to 5,000 differed on 111 of 300 inline documents that stay below 20,000, so the corpus catches a wrong cap.

## Worker: ports and app built for each request

The Worker entry builds the ports with `build(env)` for each API request, each valid queue message and each Cron run, and calls `createApp` for each API request. It keeps no value derived from `env` in module scope.

### Why

Cloudflare's [bindings page](https://developers.cloudflare.com/workers/runtime-apis/bindings/#making-changes-to-bindings) says that "Cloudflare may reuse existing isolates that are already running your Worker" when a deploy changes only bindings, and that "The correct approach would be to create a new client instance for each request." The ports hold `drizzle(env.DB)`, the file store, the queue sender, the secret key, the setup code, the public origin and the reset code, so every one of them is derived from `env`.

The stale value, shown on 2026-11-20: two `wrangler dev --local` servers each ran a 6-line entry that calls the real `fetch(request, env)` and, for a request with the header `x-no-setup: 1`, passes `{ ...env, SETUP_CODE: undefined }`, as a reused isolate does after a binding change. `GET /api/session` three times (plain, `x-no-setup: 1`, plain) answered `"code":"set"` three times on the entry that kept the ports (`183eceb7`), and `"set"`, `"missing"`, `"set"` on the entry that builds them for each request.

### The cost rule

The owner's rule is to build per request when the build adds at most 5 ms of CPU per request, half of the 10 ms of the Workers Free plan, the smallest per-request CPU limit on Cloudflare's [limits page](https://developers.cloudflare.com/workers/platform/limits/#cpu-time). That page puts the average Worker at about 2.2 ms. The decision rests on the bindings guidance and the stale value above, and the bound only checks that the cost stays small.

### Measured cost

Two tools start two Workers side by side with `worker-local` (a baseline and a candidate, each with its own local state), send only GETs of the routes in the tables with an owner and an agent token, and call no AI model. `--baseline` takes a git ref of the Worker entry or a file, and `--candidate` a file (default: the working tree). Run them in the devenv shell after `pnpm run build`:

- `node tools/worker-build-cost-wall-time.ts --baseline <ref>` alternates one request to each Worker, 60 warm-up pairs and 400 measured pairs for each route, and prints the median, p95 and p99 of each Worker and of the per-pair difference.
- `node tools/worker-build-cost-cpu-time.ts --baseline <ref>` reads `utime` plus `stime` of the `workerd` processes of each Worker from `/proc`, around 1,500 sequential requests (375 for `GET /api/openapi.json`), 200 warm-up requests before each round, 4 rounds with the Worker order alternated.
- Both commands stop the two Workers and delete their temporary files at the end. A failed cleanup after a finished measurement makes the command exit non-zero, and a cleanup after a failed measurement only logs its own failure.

Wall time, 3 runs on 2026-11-20 against `4cc5f0d4` (Node 26.13.1, 16 cores), each with a 1-minute load average under 8 at its start and end. Each cell is the median of the 3 run medians, with the lowest and highest run in brackets. The tail columns are the p95 and p99 of the per-pair difference, which holds the noise of two requests. The static page, which no change reaches, shows how large that noise is.

| Route | Baseline median, ms | Added, ms | Added, share of baseline | Added p95, ms | Added p99, ms |
|---|---|---|---|---|---|
| `GET /api/session` | 8.53 | 2.03 (1.79 to 2.45) | 23.8 % | 9.33 (5.23 to 11.27) | 15.84 (11.90 to 17.36) |
| `GET /api/items`, agent token | 11.48 | 2.03 (1.81 to 2.21) | 17.6 % | 7.76 (7.10 to 9.95) | 16.99 (10.50 to 19.48) |
| `GET /api/openapi.json`, agent token | 49.58 | 1.00 (0.95 to 2.00) | 2.0 % | 17.41 (17.03 to 18.69) | 26.16 (24.01 to 30.12) |
| `GET /` (the assets serve it, no Worker code) | 4.69 | 0.00 (-0.09 to 0.01) | 0.0 % | 3.03 (1.86 to 3.47) | 5.79 (3.56 to 5.84) |

CPU time, 3 runs against `4cc5f0d4` under the same load rule, in ms of CPU per request, the median of 4 rounds in each run. Each cell is the median of the 3 run values, with the lowest and highest run in brackets:

| Route | Baseline | Added | Added, share of baseline |
|---|---|---|---|
| `GET /api/session` | 6.50 | 2.41 (0.64 to 3.17) | 37 % |
| `GET /api/items` | 8.99 | 3.37 (3.29 to 5.75) | 38 % |
| `GET /api/openapi.json` | 55.73 | 3.09 (3.09 to 3.81) | 6 % |

The median added CPU is under 5 ms on every route, and the highest single run, 5.75 ms on `GET /api/items`, is above it. On `GET /api/session`, the cheapest route, the added CPU is 37 % of the request's own CPU.

- The CPU figures depend on the load of the machine. The same tool at load average 14 to 55 gave +9.4 and +14.7 ms on `GET /api/openapi.json`, and a run at load 7 to 9 gave +5.6 ms.
- The counters include every `workerd` thread, which Cloudflare's CPU meter probably leaves out, so they err high.
- Local D1 has no network wait, so the shares overstate what the owner sees from a browser.
- One sequential client ran on a shared machine, and no deployed Worker was measured.

### Where the cost sits

A new app builds its Hono router matcher on its first request (`buildAllMatchers` in the RegExpRouter of hono 4.13.18), so the cost is more than `createApp` alone. A queue message or a Cron run builds the ports only.

The same two commands with `--candidate` set to an entry that builds the ports for each request and builds the app once for the isolate give, against `183eceb7`, a wall-time difference of 0.00 (-0.21 to 1.19), 0.22 (-0.71 to 0.75) and -0.78 ms (-0.80 to -0.25) on the three API routes (3 runs), and a CPU difference of 0.20, -2.22 and 0.72 ms (1 run). The negative values show that the build of the ports is below what these runs resolve. A queue message or a Cron run therefore pays well under 1 ms. This is inferred from the HTTP routes, because the tools send no queue message and no Cron trigger.

## CPU of a login and a fetch job

Measured on a throwaway pull request copy of the Worker (2026-11-07). A login with scrypt at N=2^15, r=8, p=3 and `maxmem` of 64 MiB used 198 to 211 ms of CPU and 531 to 905 ms of wall time. A fetch job on four pages used 36 to 4,457 ms of CPU. The spread within a page was as large as the spread between pages, so the figures do not isolate Defuddle's share. The largest total is 1.5 % of the `limits.cpu_ms` of 300,000.

## Aborted list reads

An aborted request ends the browser's side only. In a local Worker run (`wrangler dev`, one saved Item), a Playwright script, which the repository does not keep, typed the 6 characters `sqlite` into the search box and counted the `GET /api/items?q=` requests with the page events `requestfinished` and `requestfailed`. Before the ticket aborted a superseded read, 6 requests finished and none failed. After it, 1 finished and 5 failed with `net::ERR_ABORTED`, and the list showed one row and no alert. The local Worker log showed 6 finished handlers in both runs, so the abort saved nothing on the server side of that run. The run says nothing about a deployed Worker, where the request's work may be canceled when the client disconnects.
