# Decisions and evidence

[The spec](../spec.md) states what the app does. This page holds the reasons behind its product decisions and the measured or sourced facts the spec leaves out. A fact here carries the command, address or source that shows it. [Open items and unverified claims](open-items-and-unverified-claims.md) holds a fact no run has proven.

Contents: [Product decisions](#product-decisions), [Design review](#design-review), [Reddit](#reddit), [AI providers](#ai-providers), [Grok Bot](#grok-bot), [The hosted product](#the-hosted-product), [X developer terms](#x-developer-terms), [The library wiki](#the-library-wiki), [Trigger depth on D1](#trigger-depth-on-d1), [Worker HTML cap](#worker-html-cap), [X replies read by the Grok CLI](#x-replies-read-by-the-grok-cli), [Parse time of a page](#parse-time-of-a-page), [Worker: ports and app built for each request](#worker-ports-and-app-built-for-each-request), [CPU of a login and a fetch job](#cpu-of-a-login-and-a-fetch-job), [Aborted list reads](#aborted-list-reads), [Export entry count on Node 26.13.1](#export-entry-count-on-node-26131), [Highlights page order](#highlights-page-order), [Reading place at a close](#reading-place-at-a-close).

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

Impeccable Reviews is a GitHub App in closed beta, and its hosted pull request reviews do not run without per-PR previews. Impeccable holds no working session for the live Worker: recreating the live Worker's database deleted every stored session, and a sign-in to the Impeccable reviews app on 2026-11-19 answered "Paused for maintenance". No session is renewed, because only a hosted review would use one. In this repository Impeccable runs local-only. Its project config turns telemetry off, which `impeccable telemetry status` reports, so it uploads no scan, critique or design file and the roll API records nothing. The Claude Code and Codex settings turn off the three account features that telemetry leaves on: the block it writes into each agent's user rule file, the Pro engine and the fetch of the account's design preferences. The building agent checks screenshots in every theme before landing ([Reviewing code](../agents/reviewing-code.md)).

## Reddit

Reddit blocks anonymous `.json` (HTTP 403), does not take new API access requests, and its app-registration page says "Remaining public API access will end in March 2027". Its User Agreement forbids scraping without written consent, and its Developer Terms forbid paid use of Reddit data without an agreement.

- A tab the owner opened by hand sends no server traffic to Reddit, and the archive fill sends none either.
- Only a connected account makes the owner's own server request threads from reddit.com, with the owner's own session.
- Readeck's add-on works the same way and still works. Tools that fetch Reddit from a server (Linkwarden, Karakeep) are blocked.

Measurements behind the Reddit fetch:

- On a 671-comment thread in the owner's browser, the page held 100 comment elements, and the `.json` returned 465 comments plus 199 behind `more` stubs. `/api/morechildren` answered 403 even to a signed-in session, so the fill uses permalinks (`/comments/<post>/_/<comment id>.json?limit=500&raw_json=1`).
- On a 677-comment thread the first `.json` gave 464 comments and 34 stubs. 67 permalink requests, all HTTP 200, brought it to 659 in 51 s (a throwaway account from a home address).
- Arctic Shift returned 661 comments with no `more` stubs for the 671-comment thread in 1.4 s, with no key, from a home address and from a Worker. 24 of the 661 were marked deleted later and are dropped.
- With the owner's account, the container's platform `fetch` got HTTP 200 from a home and a datacenter address. On Cloudflare on 2026-11-25, the Workers `fetch` with the same session got HTTP 200 for a 138-comment thread's `.json` and for `me.json` in 3 of 3 runs, and for one comment's permalink `.json` in 2 of 2 runs, from a throwaway Worker on the owner's Cloudflare account. So both targets send these requests through the platform `fetch`.
- Reddit's `me.json` answered 403 with its network-security page for an altered session and 200 for a valid one, so one 403 does not expire the session. The rule that does is in [Fetchers](fetchers.md) (Reddit).
- A `reddit.com/r/<community>/s/<code>` share link needs one redirect, which Reddit answers without a login ([Fetchers](fetchers.md)).

## AI providers

The owner chose `claude-sonnet-5-5` at medium effort for Claude Code and `gpt-6.2-sol` at medium for Codex. The provider comparison tool ([Providers guide](../guides/providers.md), Compare Providers) ran Digests on 20 Items from the owner's library: 16 X posts, 2 Reddit posts, 1 GitHub repository and 1 article. Every row comes from runs on 2026-11-26 at revision `de5a779`, on one capture with snapshot hash `da7b825cd72a…`. Two runs held every Provider, with Claude Code 2.1.332. Two later runs held only the two Codex Providers, with Codex CLI 0.172.0, because the reserved Codex home was not signed in during the first two runs, whose Codex rows recorded `cli-not-signed-in`.

The median and the longest call cover the calls that returned a Digest. The records stay outside the repository.

| Provider | Model | Effort | Digests | Median call | Longest call |
|---|---|---|---:|---:|---:|
| Claude Code | `claude-sonnet-5-5` | Medium | 40/40 | 5.6 s | 9.0 s |
| Claude Code | `claude-sonnet-5-5` | High | 40/40 | 9.7 s | 19.5 s |
| Claude Code | `claude-sonnet-5-5` | CLI default | 40/40 | 5.6 s | 9.5 s |
| Claude Code | `claude-haiku-5-5` | CLI default | 40/40 | 12.6 s | 29.3 s |
| Codex | `gpt-6.2-sol` | Medium | 40/40 | 12.2 s | 24.7 s |
| Codex | `gpt-6.2-sol` | CLI default (low) | 40/40 | 11.1 s | 19.8 s |

Workers AI bills by use, so its row recorded `workers-ai-credentials-missing` and sent no call. In the first two runs six free OpenRouter models returned 6 Digests across 240 attempts. Of the other 234 attempts, 149 were refused as `provider-busy`, 45 as `cut-off` and 40 as `model-not-found`. Grok Bot has no model field; its row recorded `bot-callback-fixed-to-live-instance` for all 40 records and sent no call (Providers guide, Read the results). These Providers have no recommendation.

- Anthropic, OpenAI and xAI have no successful live run until the owner supplies a key. Only their refusal of a wrong key ran against the vendors. OpenRouter ran a real Verify on the container with a free model.
- OpenRouter turns a new key on some seconds after it makes it (up to 17.2 s in 16 runs), so Connect saves the key and then checks once a second for up to 45 s.
- Anthropic allows "an end user… signing in to the unmodified Claude Code binary with their own Claude subscription" and forbids a third party from offering "Claude.ai login" or routing plan credentials for its users (`code.claude.com/docs/en/legal-and-compliance`). So the hosted product never offers a Claude plan login. Plan limits are small for an Import, so the Import screen suggests an API key when a plan Provider is picked.

## Grok Bot

The Grok Bot capabilities in [the spec](../spec.md) (Grok Bot) come from the owner's Grok Bot, which marked each answer as checked or inferred.

## The hosted product

Comparable hosted services cost $3 to $13 a month (Karakeep $4, Linkwarden $3, Readwise Reader $7.99, mymind $7.99 to $12.99, from their pricing pages). Threadsift's price is not decided. The rules that bind the hosted product are in [the spec](../spec.md) (Hosted product).

## X developer terms

Five points of X's developer terms decide how Threadsift may store, show and digest X posts, and only X can settle them. No question went to X. The answers below come from X's policy pages and from replies of X staff on X's developer forum, all read on 2026-11-27.

X staff say the forum is not a binding channel: "We can’t approve a use case or give a binding ruling in the forum." In the same reply they name a route for a definitive answer on a changed use case: "send anything you want a definitive answer on through the Policy Support form" ([Clarification On Monetization And Use](https://devcommunity.x.com/t/clarification-on-monetization-and-use/279055/5), 2026-11-03; the [Policy Support form](https://help.x.com/forms/platform)). On 2026-11-27 that address opened the Help Center home page with no form, the developer console offered an app no use-case field, only a description of 10 to 200 characters, and the [Enterprise interest form](https://docs.x.com/forms/enterprise-api-interest) offered no budget below 42,000 USD. They also say "There isn’t a separate public policy, compliance, or developer-support ticket queue that reviews Developer Agreement questions for a described use case. This forum is not that channel." ([Which channel can provide a formal determination on the service bureau clause?](https://devcommunity.x.com/t/which-channel-can-provide-a-formal-determination-on-the-service-bureau-clause/273665/2), 2026-08-19). So these answers guide a choice and do not bind X. Where X has published no answer, the hosted product and the public demo take the cautious choice. On a self-hosted Instance the risk stays with its owner.

The table splits the second point in two: a stored post and a shown post.

| Point | Published answer | Choice |
|---|---|---|
| What a deletion on X reaches | No published answer | Hosted X Items are Link-only |
| How current a stored post must be | Answered for stored posts: no check interval, removal within 24 hours of a request | Daily check of stored posts |
| How current a shown post must be | No published answer | Hosted X Items are Link-only; a self-hosted Instance shows the stored post |
| Post text sent to a Provider for a Digest | Training ban does not cover it; third-party limit applies; X asks that the use case list the step | The Digest waits until the use case names the step |
| When pay-per-use needs Enterprise | No published end-user threshold | Hosted X Items are Link-only |
| A public demo of other authors' posts | No published answer | The demo shows only the owner's posts |

- **What a deletion on X reaches.** The [Pay-Per-Use Agreement](https://docs.x.com/developer-terms/ppu-agreement) counts as X Content "any copies and derivative works thereof". X has not said whether a Digest or a Topic page overview made from a post must go when the post goes. A forum question about conclusions kept after the post text is deleted got "we’re checking with the team and will follow up in this thread" ([Policy Clarification Request: Private Analysis of Protected X Posts Using ChatGPT](https://devcommunity.x.com/t/policy-clarification-request-private-analysis-of-protected-x-posts-using-chatgpt/279439/2), 2026-10-27) and no answer before the thread closed on 2026-11-21. A question about a private note kept after a deletion got only the general rule quoted under the next point ([Private market research notes from public Posts](https://devcommunity.x.com/t/private-market-research-notes-from-public-posts-app-use-case-guidance/278439/2), 2026-10-16). A self-hosted Instance stores its X Items with their Digests, so there this point is a risk of its owner.
- **How current a stored post must be.** X has answered this. Its [developer guidelines](https://docs.x.com/developer-guidelines) say "Remove content within 24 hours if deleted on X." X staff wrote "This needs to happen as soon as reasonably possible, or within 24 hours of a request from X or the account owner." and "The policy doesn’t set a specific check interval." ([Private market research notes from public Posts](https://devcommunity.x.com/t/private-market-research-notes-from-public-posts-app-use-case-guidance/278439/2), 2026-10-16). Of an app that checks once a day they wrote "Your compliance setup also looks solid: daily batch compliance, removal within 24 hours of a request, and no X content in analytics." ([Clarification On Monetization And Use](https://devcommunity.x.com/t/clarification-on-monetization-and-use/279055/5), 2026-11-03). The choice: Threadsift checks stored X posts once a day, and checks at once on a removal request. The daily check meets the 24 hours that start at a request from X or the account owner. For the 24 hours that start at the deletion on X, X's only published words are the guideline's line and the staff reply that called a daily check solid.
- **How current a shown post must be.** X's [Developer Policy](https://docs.x.com/developer-terms/policy) says "If you don’t use X for Websites to display content, then you must use the X API to retrieve the most current version available for display." No published text says whether a daily check meets that line or whether each display needs a lookup first. The hosted product shows no stored X post, because its X Items are Link-only. A self-hosted Instance shows the stored post, and the daily check removes what X removed. That is a risk the owner of that Instance carries with their own X developer app.
- **Post text sent to a Provider for a Digest.** A Digest sends the post's text to the owner's Provider, a third party. Of the ban on training models, X staff wrote "Inference-only labelling with no training isn’t covered by that clause." They added "The Agreement doesn’t say outright that sending content to a model provider for processing is allowed, so if you want certainty, ask for written confirmation" ([Question: classificating and aggregating opinions about AI](https://devcommunity.x.com/t/question-classificating-and-aggregating-opinions-about-ai/278849/3), 2026-10-20). The [Developer Policy](https://docs.x.com/developer-terms/policy) says "You must notify us of any substantive modification to your use case and receive approval before you may begin using X Content for that new purpose." Two replies ask that the step be listed and confirmed. One says "They don’t name inference-only classification. The agreement does restrict giving X content to third parties, so please list this processing step in your use case and let the reviewers confirm it." ([Clarification On Monetization And Use](https://devcommunity.x.com/t/clarification-on-monetization-and-use/279055/5), 2026-11-03). The other says "If you later expand the scope, for example by sending Post text to a third-party model, keeping a raw-text archive, or using the data commercially, let us know and get approval before you make that change" ([Private market research notes from public Posts](https://devcommunity.x.com/t/private-market-research-notes-from-public-posts-app-use-case-guidance/278439/3), 2026-10-16). A newer reply answers a self-serve personal use: an app that sends posts of the accounts its owner follows to Claude or ChatGPT for a summary, after that owner had updated the app's description. It says "As long as you follow our developer guidelines and Developer Policy, no written approval is necessary." ([X-Ai use case](https://devcommunity.x.com/t/x-ai-use-case/279356/5), 2026-11-20). That reply names only the training ban, the ban on inferring sensitive attributes or profiling users, the official API as the only way to read, and the automation rules for write actions. The choice: the use case of an X developer app that reads posts for Threadsift names the step that sends post text to the Provider. The Digest of an X Item read through the X API starts only once the owner's use case names that step. Whether the owner also asks X to confirm the step through the Policy Support form is an open decision of the owner ([Open items](open-items-and-unverified-claims.md#product)).
- **When pay-per-use needs Enterprise.** The [Pay-Per-Use Agreement](https://docs.x.com/developer-terms/ppu-agreement) says the plan is "designed for hobbyists, commercial prototyping, initial development, early-stage X product integrations, and supporting applications with a limited number of end-users." X staff wrote "there’s no published numeric threshold for “a limited number of end-users.”" ([Does a multi-tenant scheduling SaaS fall under the service bureau restriction?](https://devcommunity.x.com/t/does-a-multi-tenant-scheduling-saas-fall-under-the-service-bureau-restriction-and-what-counts-as-a-limited-number-of-end-users/273470/2), 2026-08-17) and "A solo, early-stage app fits that description. As it grows, X may review your usage and ask you to move to Enterprise." ([Clarification On Monetization And Use](https://devcommunity.x.com/t/clarification-on-monetization-and-use/279055/5), 2026-11-03). X names a route for a formal answer on each kind of question. For whether an app is a service bureau that needs Enterprise, "the Enterprise interest form is the correct starting point, including when you need a use-case / compliance review rather than an immediate purchase." ([Which channel can provide a formal determination on the service bureau clause?](https://devcommunity.x.com/t/which-channel-can-provide-a-formal-determination-on-the-service-bureau-clause/273665/2), 2026-08-19). For a changed use case, X names the Policy Support form quoted above.
- **A public demo of other authors' posts.** X's [Display Requirements](https://docs.x.com/developer-terms/display-requirements) bar the use of "X content to promote any product or service (e.g., by displaying X content in advertising or otherwise displaying X content to imply endorsement of any product or service) without explicit permission from the user." X has not said whether a public demo that shows the posts of authors who gave permission fits pay-per-use. The choice: the public demo shows only the owner's own X posts.

The hosted product stores an X Item as a Link-only Item, because X has published no answer on what a deletion reaches or on how current a shown post must be, and no end-user threshold for pay-per-use ([the spec](../spec.md), Hosted product).

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

Two tools measured it. Each started two Workers side by side with `worker-local` (a baseline and a candidate, each with its own local state), set up an owner and created an agent token on each Worker, then sent only GETs of the routes in the tables, with the token on the routes that need it, and called no AI model. The wall-time tool alternated one request to each Worker, 60 warm-up pairs and 400 measured pairs for each route, and reported the median, p95 and p99 of each Worker and of the per-pair difference. The CPU tool read `utime` plus `stime` of the `workerd` processes of each Worker from `/proc` around 1,500 sequential requests (375 for `GET /api/openapi.json`), with 200 warm-up requests for each Worker and route before each of 4 rounds and the Worker order alternated. It left out the static page.

The tools live in git history at `a155b0fb`. To measure again, restore them in a throwaway worktree with `git restore --source a155b0fb -- 'tools/worker-build-cost-*.ts'`, because a run writes two temporary Worker entries and two Wrangler configurations into the checkout and deletes them at the end. Then run `node tools/worker-build-cost-wall-time.ts --baseline <ref>` and `node tools/worker-build-cost-cpu-time.ts --baseline <ref>` in the devenv shell after `pnpm run build`. They run on Linux only, one run at a time on the machine.

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

An aborted request ends the browser's side only. In a local Worker run (`wrangler dev`, one saved Item), a Playwright script, which the repository does not keep, typed the 6 characters `sqlite` into the search box and counted the `GET /api/items?q=` requests with the page events `requestfinished` and `requestfailed`. Before the ticket aborted a superseded read, 6 requests finished and none failed. After it, 1 finished and 5 failed with `net::ERR_ABORTED`, and the list showed one row and no alert. The local Worker log showed 6 finished handlers in both runs. Server cost was not measured. The run says nothing about a deployed Worker, where the request's work may be canceled when the client disconnects.

## Export entry count on Node 26.13.1

On Node 26.13.1 a `while` loop that counts the entries of an Item that fit in an Export slice returned a wrong `next` after the process had run it for many Items, so the Export ended `ready` without the post text file ([Export, backup and restore](export-backup-and-restore.md), Item notes, images and post text). The core tests of two files in one process (`node --test --test-isolation=none test/export-lifecycle.test.ts test/export-slices.test.ts`) showed it on every run. It did not appear with `--no-maglev` or `--no-maglev-loop-peeling`, and it still appeared with `--no-turbofan`, `--no-opt`, `--no-maglev-inlining`, `--no-maglev-truncation` and `--no-maglev-cons-string-elision`. Logging inside the loop hid it.

## Highlights page order

Measured on 2026-11-26 on synthetic libraries of 1,000, 10,000 and 100,000 Highlights, built with the real migrations through the container's `node:sqlite` binding (SQLite 3.54.0). The statement is the first page of `highlightsPage`, captured from the running code, and each time is the median of 20 runs. Rows read are `meta.rows_read` of the statement's `prepare(...).all()` on the D1 binding that Wrangler's `getPlatformProxy` gives, with the same tables in a local D1 database (wrangler 4.166.0). The numbers cover the page select with no filter and no search. The totals and the counts of the filter groups are separate statements, and a page with a filter or a search was not measured.

| Highlights | Without `highlights_created_at` and `notes_updated_at` | With them |
|---:|---|---|
| 1,000 | 4,323 rows read, 1.64 ms | 215 rows read, 0.34 ms |
| 10,000 | 43,806 rows read, 39.5 ms | 214 rows read, 0.48 ms |
| 100,000 | 438,438 rows read, 395 ms | 215 rows read, 0.35 ms |

At 100,000 Highlights the two indexes add 0.9 % to the database file, and 1,000 inserts took the same time with and without them. The page rows are the same with and without them.

## Reading place at a close

Measured on 2026-11-27 on the container target, on an image built from commit `d6543208`, in Chromium 156.0.8078.4. The window was 390 px wide, so the Reader was the page Reader and the slot was as tall as the window. The pane Reader, the Sheet, Firefox and WebKit were not measured. A Playwright script that the repository does not keep ran as `CLOSE=<close> [HEIGHT=700] ./run.sh <image> <name>`. It saved one synthetic Item of 90 blocks and opened it. It scrolled the Reader slot with 10 wheel steps of 400 px to `scrollTop` 4000 and waited for the save while reading. It then closed the Reader and read each saved place from `sessionStorage`. Last, it reopened the Item once from the place saved at the close and once from the place saved while reading, and read the restored `scrollTop`. Every place saved while reading was block 25, fraction 0.898, offset 0, and the reopen from it restored 4000 in every run. Runs with the same close and height gave the same values.

| Close | Slot height | Runs | Saved at the close | Restored from the close |
|---|---|---|---|---|
| Mouse press on the back control | 844 px | 2 | block 25, fraction 0.898, offset 0 | 4000 |
| Touch tap on the back control | 844 px | 2 | block 25, fraction 0.898, offset 0 | 4000 |
| Escape | 844 px | 2 | block 25, fraction 0.898, offset 0 | 4000 |
| `focus()` on the back control, then Enter | 844 px | 2 | block 24, fraction 0.016, offset 0 | 3578 |
| Shift+Tab from the Reader's title to the back control (5 presses), then Enter | 844 px | 1 | block 12, fraction 0, offset 11.4 | 1890 |
| Mouse press on the gear, Escape to close Look settings, then a mouse press on the back control | 844 px | 1 | block 24, fraction 0.016, offset 0 | 3578 |
| Playwright `click()` on the back control | 844 px | 4 | block 24, fraction 0.016, offset 0 | 3578 |
| Mouse press on the back control | 700 px | 1 | block 25, fraction 0.898, offset 0 | 4000 |
| `focus()` on the back control, then Enter | 700 px | 1 | block 24, fraction 0.347, offset 0 | 3650 |
| Playwright `click()` on the back control | 700 px | 2 | block 24, fraction 0.347, offset 0 | 3650 |
| `focus()` then Enter, with the slot's `scroll-padding-top` set to 0 | 844 px | 1 | block 25, fraction 0.898, offset 0 | 4000 |
| Playwright `click()`, with the slot's `scroll-padding-top` set to 0 | 844 px | 1 | block 25, fraction 0.898, offset 0 | 4000 |

Each focus that reached a control of the Reader bar moved the slot up by half its height, 422 px at 844 px and 350 px at 700 px. In the Shift+Tab run every press moved the slot again, from 4000 to 3578, 3156, 2734, 2312 and 1890. In the runs with a Playwright `click()`, the slot's `scrollTop` was already 3578 at the click's `pointerdown`. Before its first press, a Playwright pointer action sends the DevTools Protocol command `DOM.scrollIntoViewIfNeeded` for its target. Its retries call `scrollIntoView` with the alignments `end`, `center` and `start` ([`_retryPointerAction`, Playwright v1.64.1](https://github.com/microsoft/playwright/blob/v1.64.1/packages/playwright-core/src/server/dom.ts)).
