# Decisions and evidence

`docs/spec.md` states what the app does. This page holds the reasons behind its product decisions and the measured or sourced facts that the spec leaves out. A fact here has the command, address or source that shows it; a fact no run has proven is in `docs/architecture/open-items-and-unverified-claims.md`.

## Product decisions

- **Name.** The repository is named to match. Threadsift was picked from 26 checked names for free `.app` and `.dev` domains and no app or real repository of the same name. The masthead wordmark, which the design draws as "Library", reads Threadsift. Words inside the app (Item, Reader, Highlights page and the rest) and the Style named Library stay as `GLOSSARY.md` and the design define them.
- **Licence.** AGPL-3.0-only, so a rival hosted copy must publish its changes. The contributor licence agreement (CLA) applies to outside contributions. Contributors keep copyright in their contributions and grant Kyanite Labs a perpetual, irrevocable, non-exclusive licence that includes the right to sublicense. This lets Kyanite Labs license contributions under other terms (section 2 of `CLA.md`).
- **Build or adopt.** The app is its own. Karakeep, Linkwarden, Shiori and Raindrop were rejected as the base. `docs/research/prior-art.md` compares Karakeep with other projects and does not name the other three.
- **A public address.** The app needs a public HTTPS address so that Grok Bot can reach it, because Grok Bot's MCP connections run on Cursor's servers (Grok Bot's own answer).
- **Ownership of Tags.** Only the agent sets Tags, so the UI has no Tag editing, and Proposals keep the lists clean over time.
- **One Provider.** The owner picks one Provider in settings. The Threadsift bot ships as a public Grok Bot template, with its skill files in this repository so the bot stays in step with the API, and one short profile because a template has one profile field. The bot's rules live in its skill.
- **Obsidian.** The mirror is one-way, as Readwise's Obsidian sync is: the owner reads in Obsidian and edits Highlights and Notes in Threadsift. Vault repositories on other Git hosts are not in the first release (`docs/spec.md`).
- **Design of new screens.** Every screen the first design lacks is built from `design/system/` to match the existing screens. The building agent checks each from screenshots in every theme before it lands, and decides the approval. No Claude Design round.
- **README.** The README sells the project. An agent drafts its prose and the building agent approves it.
- **One codebase.** EdgeEver and Open Managed Agents already ship one app on both targets.
- **Token budget default.** A new token starts at 200 Items a day. This is the maintainer's choice, not a measured value.

## Design review

Impeccable Reviews is a GitHub App in closed beta. Hosted pull request reviews do not run without per-PR previews, so the building agent checks screenshots in every theme before landing (`docs/agents/reviewing-code.md`).

When it runs, Impeccable posts one review comment with its findings and screenshots, writes no summary into the PR body, and its GitHub check fails on a P1 finding or worse. It judges against a design profile scanned from `design/`, with the prototype's own tool panels (`.tool`, `.tw`) excluded; against ten rules, six quoted from `docs/spec.md`, Design (token-only values, contrast, the 12px floor, 44px targets under 480px, the open-row bar, reduced motion) and four the app suggested from `design/system/` and the owner kept (the app root never scrolls, the 1px and 2px literals `tokens.css` allows, the unread dot on the first metadata line, the reading width set by Text width); and through four personas, one of them on a phone. Drafts are not reviewed.

Impeccable's live address is the live copy, `https://threadsift-live.<subdomain>.workers.dev`, so a review's before comes from `main`. The live copy has its own demo password, so Impeccable signs in there with a saved browser session made through the real login. The saved session expires on 2026-12-06 and needs a new one before then. No review has shown a before yet, because each review rendered only the pull request copy.

## Reddit

Reddit blocks anonymous `.json` (HTTP 403), does not take new API access requests, and its app-registration page says "Remaining public API access will end in March 2027". Its User Agreement forbids scraping without written consent, and its Developer Terms forbid paid use of Reddit data without an agreement. A tab the owner opened by hand sends no server traffic to Reddit, and the archive fill sends none either; only a connected account makes the owner's own server request threads from reddit.com, with the owner's own session. Readeck's add-on works the same way and still works, while tools that fetch Reddit from a server (Linkwarden, Karakeep) are blocked.

Measurements behind the Reddit fetch:

- On a 671-comment thread in the owner's browser, the page held 100 comment elements, and the `.json` returned 465 comments plus 199 behind `more` stubs.
- `/api/morechildren` answered 403 even to a signed-in session, so the fill uses permalinks (`/comments/<post>/_/<comment id>.json?limit=500&raw_json=1`).
- On a 677-comment thread the first `.json` gave 464 comments and 34 stubs, and 67 permalink requests, all HTTP 200, brought it to 659 in 51 s (a throwaway account from a home address).
- Arctic Shift returned 661 comments with no `more` stubs for the 671-comment thread in 1.4 s, with no key, from a home address and from a Worker. 24 of the 661 were marked deleted later and are dropped.
- With the owner's account, the container's platform `fetch` got HTTP 200 from a home and a datacenter address. On Cloudflare, the Workers `fetch` got 403 for the thread's `.json` even with the cookie, while a raw TLS socket from the same Worker got HTTP 200 with 464 comments in 3 of 3 runs, so the Worker sends these requests over a socket.
- Reddit's `me.json` answered 403 with its network-security page for an altered session and 200 for a valid one, so one 403 does not expire the session. The rule that does is in `docs/architecture/fetchers.md`, Reddit.
- A `reddit.com/r/<community>/s/<code>` share link needs one redirect, which Reddit answers without a login (`docs/architecture/fetchers.md`).

## AI providers

The owner chose `claude-sonnet-5-5` at medium for Claude Code and `gpt-6.2-sol` at medium for Codex. The comparison ran Digests on 20 Items from the owner's library on 2026-11-18 with `tools/provider-comparison.ts` at revisions `fd4eee8` and `d43acd8`. The records stay outside the repository.

| Provider | Model | Effort | Digests | Median call | Longest call |
|---|---|---|---:|---:|---:|
| Claude Code | `claude-sonnet-5-5` | Medium | 20/20 | 5.6 s | 9.1 s |
| Claude Code | `claude-sonnet-5-5` | High | 20/20 | 7.1 s | 20.0 s |
| Claude Code | `claude-sonnet-5-5` | CLI default | 20/20 | 5.5 s | 8.6 s |
| Claude Code | `claude-haiku-5-5` | CLI default | 20/20 | 10.3 s | 22.3 s |
| Codex | `gpt-6.2-sol` | Medium | 20/20 | 15.3 s | 26.1 s |
| Codex | `gpt-6.2-sol` | CLI default (low) | 20/20 | 13.9 s | 22.6 s |

Workers AI bills by use. The free OpenRouter rows returned 6 Digests across 120 attempts in the comparison. Grok Bot has no model field. These Providers have no recommendation.

- The Providers Anthropic, OpenAI and xAI have no successful live run until the owner supplies a key; only their refusal of a wrong key was run against the vendors. OpenRouter ran a real Verify on the container with a free model.
- OpenRouter turns a new key on some seconds after it makes it (up to 17.2 s in 16 runs), so Connect saves the key and then checks once a second for up to 45 s.
- Anthropic allows "an end user… signing in to the unmodified Claude Code binary with their own Claude subscription" and forbids a third party from offering "Claude.ai login" or routing plan credentials for its users (`code.claude.com/docs/en/legal-and-compliance`). So the hosted product never offers a Claude plan login. Plan limits are small for an Import, so the Import screen suggests an API key when a plan Provider is picked.

## Grok Bot

Grok Bot's capabilities in `docs/spec.md`, Grok Bot, come from the owner's Grok Bot, which marked each answer as checked or inferred. The extra time an X link takes through the webhook, seconds to tens of seconds, is the bot's own estimate and is not measured.

## The hosted product

Comparable hosted services cost $3 to $13 a month (Karakeep $4, Linkwarden $3, Readwise Reader $7.99, mymind $7.99 to $12.99, from their pricing pages). Threadsift's price is not decided. The rules that bind the hosted product are in `docs/spec.md`, Hosted product.

## The library wiki

The wiki follows the LLM wiki idea (https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): the agent builds the synthesis once, when an Item arrives, and keeps it current. The rules in `docs/spec.md`, The library wiki, answer the known failures of LLM wikis, from the gist's comments:

- A wrong merge becoming a permanent error: overviews cite their Items, and changes go through Proposals.
- Human corrections lost to regeneration: Pins.
- Near-duplicate pages from parallel updates: overview revisions are accepted only while the Topic's inputs are still the ones the run read, with a second run refused and queued again, and Grok Bot starts one overview task per Topic at a time.

## Parse time of a page

`projectText`, `scanMarkdown` and the Reader parse a page's Markdown with `GFM_PLUGINS` (`src/core/contract/gfm-markdown.ts`). One paragraph of many short lines of plain words used to take seconds to parse. `projectText` on about 1 MB of one paragraph (Node 26.13.1, 2026-11-20, load average 5 to 17):

| Page | `main` | `GFM_PLUGINS` |
|---|---|---|
| 20 characters a line, 999,998 bytes | 25.7 s | 1.4 s |
| 80 characters a line, 999,944 bytes | 6.0 s | 0.7 s |
| 200 characters a line, 999,974 bytes | 2.9 s | 0.7 s |
| 1,000 characters a line, 999,998 bytes | 1.0 s | 0.6 s |
| 80 characters a line, 599,966 bytes | 2.8 s | 0.6 s |

The 20-character row: `node --input-type=module -e 'import { projectText } from "./src/core/contract/text-projection.ts"; const t = Array.from({length: 47619}, () => "lorem ipsum dolor si").join("\n"); console.time("projectText"); projectText(t); console.timeEnd("projectText")'`.

The cause is `micromark-extension-gfm-autolink-literal` 2.1.0, which tries its construct at every word start. Each failed try leaves a new `data` token next to the one before, and `resolveAllText` (`micromark/lib/initialize/text.js`, micromark 4.0.3) merges each such run with `events.splice`, which moves every later event of the paragraph. A counter around `Array.prototype.splice` saw 4,000 splices move 80,004,000 events for 4,000 lines of 20 characters, so the cost grew with the square of the lines. `DATA_RUN` takes the text of a failed try into the `data` token before it, so no run is left to merge. It ends a token where `initializeText` does, by calling the `previous` check of every construct that `this.parser.constructs.text` lists for the next code, so a micromark update that changes that rule is not noticed by any test.

Four shapes still cost the square of the paragraph after `DATA_RUN`, because the time goes into the resolvers that run once the paragraph is tokenized, and `DATA_RUN` acts while it is tokenized. `DELIMITER_OVERFLOW` limits them. It is the first text construct for `!`, `*`, `[`, `]`, `_` and `~`. While the paragraph's text tokenizer holds fewer than `PARAGRAPH_EVENT_CAP` (20,000) events it refuses before it consumes anything, so a parse below the cap is the parse without it. From 20,000 events on it takes the delimiter into the `data` token before it, with the tokenizer and the merge of `DATA_RUN`, so no later `*`, `_`, `~`, `[`, `![` or `]` starts attention, strikethrough, a label, a link, an image or a footnote call. `<https://...>`, `www.`, `http://` and email autolinks and code spans still work past the cap. `PostText` and `projectText` both parse with `GFM_PLUGINS`, so the Reader and the server read the same text past the cap and a Highlight's quote still matches.

The `[` and `!` keys are needed as much as `]`. A `]` that reads as text leaves every later `[` unbalanced, and `previousUnbalanced` in `micromark-extension-gfm-autolink-literal` 2.1.0 then walks the events back to the last unbalanced label at each word start. With `*`, `]`, `_` and `~` alone, one paragraph of 900 `[a](b)` links followed by lines of single words turned a parse that was linear on `main` into a square one. CPU milliseconds of one `parse`, 900 links and then lines of `word`:

| Keys | 125,000 | 250,000 | 1,000,000 |
|---|---|---|---|
| before the cap | 1,367 | 2,275 | 5,316 |
| `*`, `]`, `_`, `~` only | 15,731 | 166,341 | not run |
| all six keys | 1,415 | 1,963 | 5,394 |

**What the cap does not cover.** It stops the six delimiters, not the growth of the event list. Line endings and character escapes still add events past the cap, and a lone `[` before the cap stays unbalanced, so the same walk stays quadratic for `"[ "` followed by lines of `a b c d e` (8,637 ms at 125,000 bytes) and for `"[ "` followed by `a\. ` repeated (50,959 ms), CPU milliseconds that the cap leaves within 5 % of `main`. Ending that walk means taking ordinary text and line endings past the cap, and a paragraph's line endings must stay events: a construct on every code that consumed the rest of the paragraph made `micromark-util-subtokenize` throw `RangeError: Cannot access index 27504 in a splice buffer of size 27504`. These shapes remain a cost of the parser, and no figure below holds for a page that contains them.

CPU milliseconds of one `parse` of one paragraph, before the cap and with the cap (Node 26.13.1, 2026-11-20 and 2026-11-21):

| Shape | Where the time went | 125,000 before the cap | 125,000 with the cap | 1,000,000 before the cap | 1,000,000 with the cap |
|---|---|---|---|---|---|
| `a* ` repeated (closers with no opener) | `resolveAllAttention`, which scans back once for each closer | 16,226 | 501 | over 2,220,000, not finished | 1,808 |
| `a] b` lines (stray `]`) | `tokenizePotentialGfmFootnoteCall`, which walks the events back for each `]` | 9,915 | 1,336 | 1,876,309 | 5,644 |
| `*a* ` repeated on one line (emphasis pairs) | `splice` of `micromark-util-chunked`, once for each pair | 5,079 | 357 | 366,919 | 1,362 |
| `~~ab~~ cd ef ~~gh~~ ij` lines (strikethrough pairs) | `resolveAllStrikethrough`, once for each pair | 1,888 | 523 | 46,780 | 2,308 |
| `lorem ipsum dolor si` lines (plain words) | none; `DATA_RUN` | 501 | 193 | 2,017 | 1,363 |

The first row: `node --input-type=module -e 'import remarkParse from "remark-parse"; import { unified } from "unified"; import { GFM_PLUGINS } from "./src/core/contract/gfm-markdown.ts"; const t = "a* ".repeat(41667); const c = process.cpuUsage(); unified().use(remarkParse).use(GFM_PLUGINS).parse(t); console.log(process.cpuUsage(c).user / 1000, "ms")'`. The plain-words row shows the cap leaves a paragraph with no delimiter alone. The `a* ` run before the cap at 1,000,000 bytes was stopped after 37 CPU minutes, so its cell is a lower bound.

**Value.** The owner chose 20,000. The cap counts the entries of the paragraph's text tokenizer at the moment a delimiter begins: 4 for a soft line break, 8 for an emphasis or strikethrough pair, 28 for an inline link and 30 for an image, so 20,000 is about 5,000 wrapped lines, 2,500 pairs or 700 links. Three corpora gave the largest count; each ran with a cap too high to act, and the counts are of events where a `*`, `_`, `~` or `]` begins:

| Corpus | Documents | Largest | 99th percentile | 1,000 or more | 5,000 or more | 20,000 or more |
|---|---|---|---|---|---|---|
| Markdown that people wrote: this repository's, the READMEs and changelogs under its `node_modules`, and those of other repositories on the machine | 957 | 804 | 522 | 0 | 0 | 0 |
| HTML reference pages (Python, PostgreSQL, SQLite, Nix, OpenSSL and zsh documentation), converted to Markdown by `readArticle` | 868 | 24,152 | 5,648 | 41 | 9 | 2 |
| Conversational prose in 1,268 text blocks, a stand-in for comments | 1,268 | 954 | 806 | 0 | 0 | 0 |

The 9 converted pages at or above 5,000 are index pages that turn a list of 490 to 6,702 links into one paragraph, and OpenSSL manual pages whose synopsis paragraph holds about 1,000 `*`. The corpora held no Reddit posts or comments, no X posts and no news articles, so how often those reach a cap is not known, and a saved page is denser than Markdown that a person wrote.

CPU seconds of one `parse` of a 1,000,000-byte page made of paragraphs of one size, the highest of a sweep from 1,000 to 160,000 bytes a paragraph, for the four shapes above:

| Cap | `a* ` | `a] b` | `*a* ` | `~~ab~~` lines |
|---|---|---|---|---|
| 5,000 | 7.6 | 8.1 | 7.2 | 4.7 |
| 10,000 | 14.1 | 15.2 | 6.9 | 4.4 |
| 20,000 | 24.4 | 24.2 | 8.6 | 4.6 |

The sweep ran with the first four keys. The cost of these shapes grows in proportion to the cap. At 5,000, 9 of the 868 converted pages show raw Markdown after the cap and the four shapes cost at most 8.1 s; at 20,000, 2 of 868 do and the shapes cost up to 24.4 s. The owner chose 20,000 over 5,000, which keeps more converted pages whole at the price of that cost.

A parse below the cap is the parse without the construct. A differential run compared the mdast and the hast, positions included, of `main` and of the cap on 471,958 documents: 300,000 strings of 1 to 40 random characters, 125,000 documents of 1 to 30 Markdown fragments, 36,000 longer ones (24,000 strings of 200 to 2,000 characters and 12,000 documents of 100 to 1,000 fragments), 10,000 inline-only documents of 100 to 6,000 fragments and 958 Markdown files. No document below the cap differed. 20 of the 10,000 inline documents reach the cap, and each of them differs. A copy of the cap set to 5,000 differed on 111 of 300 inline documents that stay below 20,000, so the corpus sees a wrong cap.

A page of about 1 MB with one `*emphasis*` pair on each 80-character line took 2.4 s with `projectText` before the cap and 1.8 s with it.
