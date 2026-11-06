# Threadsift: v1 spec

Status: agreed in grill sessions with the owner on 2026-11-03 and 2026-11-04. The visual design of the first screens is finished: a prototype and a design system built in Claude Design (see Design below). The tech stack is chosen in `docs/architecture.md`.

## Goal

Threadsift is a reading library. A person pastes a link to something they saved (a Reddit post or comment, an X post, a GitHub repo, an article). The app fetches it, keeps only the useful parts, lets an agent tag and summarize it, and shows everything on one page that can be searched and filtered. As Items arrive, the agent also keeps a small wiki of the library: Topic pages, Related Items, an Index and a Log.

The project has two aims:

1. A free, open-source app that anyone can self-host, with a container or a Cloudflare deploy button.
2. Later, the same app as the owner's own hosted product, with its own pricing.

The owner is also a user: they have many saved bookmarks to bring in and read.

## Release order

| Release | What it is |
|---|---|
| First release | The self-hosted open-source app, one owner per Instance. It ships as a container image (Podman or Docker) and as a Cloudflare deploy button on the same day, and every feature is tested on both. |
| After it | The hosted product, once its pricing and the AI and content terms below are settled. |
| Later passes | A desktop app and mobile apps. The web app comes first. |

## Decisions

| Topic | Decision | Date |
|---|---|---|
| Name | The product is Threadsift; the repo is renamed to match. It was picked from 26 checked names for free `.app` and `.dev` domains and no app or real repo of the same name. The masthead wordmark, which the design draws as "Library", reads Threadsift. Words inside the app (Item, Reader, Highlights page and the rest), and the Style named Library, stay as `CONTEXT.md` and the design define them. | 2026-11-04 |
| Licence | AGPL-3.0-only, so a rival hosted copy must publish its changes. A contributor licence agreement (CLA) is in place before the first outside pull request, so the owner stays the only copyright holder. | 2026-11-04 |
| Build or adopt | Own app. Karakeep, Linkwarden, Shiori and Raindrop were rejected as the base (`docs/research/prior-art.md`). | 2026-11-03 |
| App type | A public web app with an owner login. Each connected agent gets its own token. The app needs a public HTTPS address so that Grok Bot can reach it, because Grok Bot's MCP connections run on Cursor's servers (Grok Bot's own answer on 2026-11-04). | 2026-11-04 |
| Intake | One link at a time through the paste box, the Web Share Target, the Extension, the HTTP API, MCP or Grok Bot, plus an Import of many links at once (see Import). | 2026-11-04 |
| Import | The first release imports the owner's X bookmarks and bookmark folders, through the Threadsift bot's X connector or a one-time export, and a list of many links at once, pasted or uploaded as a file. A Reddit `saved_posts.csv` goes in through the list import as Link-only Items. | 2026-11-04 |
| Tags | Set only by the agent. The UI has no tag editing. Before creating a Tag or a Topic, the agent checks the existing ones, so near-duplicates do not appear; Proposals keep the lists clean over time (see The library wiki). | 2026-11-04 |
| Comments | High-pass filter: keep a comment only when it adds something. No fixed count. | 2026-11-03 |
| Library wiki | The agent keeps Topic pages, Related Items, an Index, a Log and weekly Proposals, so the library compounds as it grows. Details in The library wiki. | 2026-11-04 |
| AI provider | The owner picks one Provider in settings. Details in AI providers. | 2026-11-04 |
| Grok Bot | The first release works with Grok Bot three ways: saving a link dropped in a Grok Bot chat, a scheduled X bookmark sync routine, and an intake webhook through which Threadsift hands X links to the owner's bot. Details in Grok Bot. | 2026-11-04 |
| Threadsift bot | The first release ships a public Grok Bot template, the Threadsift bot, that any Grok Bot user can install. Its skill files live in this repo, so the bot stays in step with the API. | 2026-11-04 |
| Reddit | The server never fetches Reddit thread content from reddit.com; its one request there is oEmbed for a link's title, author and subreddit, unless the owner connects their own Reddit account. Thread content comes from the owner's own signed-in tab, where the Extension requests the thread's `.json` once on Save, and, in the self-hosted builds, from the Arctic Shift archive, on by default with a setting that turns it off. Either self-hosted build can also connect the owner's own Reddit account, which is then the first server source, before Arctic Shift. No background fill. Details in Fetchers. | 2026-11-05 |
| Extension | A browser extension for desktop Chrome and Firefox saves the page in the owner's own tab in one click. Any page works. On a Reddit thread it sends the thread's `.json`, read with the same parser as the `.json` paste, and falls back to Defuddle's Reddit extractor when that request fails. Opening a Link-only Reddit Item's thread with the Extension fills that Item. In the self-hosted builds, the Extension's Connect Reddit button connects the owner's Reddit account. Firefox for Android was declined for now. Details in Fetchers. | 2026-11-04 |
| Obsidian | Vault mirror: each Item is also a Markdown note in a folder of the owner's Obsidian vault. Details in Obsidian vault mirror. | 2026-11-04 |
| Layout and reader | Both are app settings, saved per browser. "Layout: List or Grid": List is three panes (filters, item list, reader); Grid is a card grid. "Open items as: Page or Sheet" applies to Grid: Page grows the card into a full-page reader, Sheet opens a centred sheet over the dimmed grid. Under 760px wide, items always open full screen. | 2026-11-03 |
| Look settings | The look is not locked to one preset. The settings also hold Font (5 pairs), Text size (Small, Medium, Large), Text width (Narrow, Medium, Wide), Density (Compact, Comfortable, Roomy), Comment style (Indented lines, Cards, Rail), Accent (5 colours), Tag style (Chips, Text, Dots) and Card images (On, Off). Defaults: Plex, Medium text size, Medium width, Compact, Indented lines, Cobalt, Dots, images on. "Reset look" resets only the Look settings, Style included; Layout, Open items as and Theme stay, and the panel says so in visible text. "Card images" hides the card picture only, never the reader's, and Off does not load the card pictures at all. | 2026-11-04 |
| Style | One more look setting, "Style": Library (default) plus 10 styles taken from refero.design (`docs/design/styles.md`). While a Style other than Library is on, its fonts and accent replace Font and Accent. Those controls are disabled and say "Set by the style". Their stored values stay, and choosing Library restores them, including after a reload. | 2026-11-04 |
| Themes | Light, Dark, Sepia and Match system. Match system follows the device; with no setting stored, the app draws Light. | 2026-11-03 |
| Settings storage | All twelve look and view settings (Layout, Open items as, Theme and the nine Look settings) are stored together in the browser. Each Item's reading place is kept for the browser tab, so reopening an Item returns to where the owner stopped. The AI, Grok Bot and Obsidian settings are stored on the server. | 2026-11-04 |
| Tech stack | TypeScript on Node 26 and Cloudflare Workers, Hono, SQLite with FTS5 through Drizzle (D1 on Cloudflare), a React single-page app, the AI SDK for HTTP Providers. `docs/architecture.md` holds every choice, its trade-off and its evidence. | 2026-11-04 |
| Delete | The owner can delete an Item from the Reader, after a confirmation. Deleting removes the Item, its Digest, its stored images, its Highlights and its Note. Agents use `DELETE /api/items/:id`. | 2026-11-04 |
| Share from phone | The app is an installable web app with a Web Share Target, so the Android Share menu sends a link straight into the same Paste as the paste box. | 2026-11-04 |
| Highlights and Notes | In the Reader, the owner selects text in the post text or a Kept comment to keep it as a Highlight, and writes one free-text Note per Item. Highlights stay marked in the Reader. When a refresh changes the text so a Highlight no longer matches, the Highlight is kept and marked as no longer found in the Item. | 2026-11-04 |
| Highlights page | A second page lists every Highlight and every Item Note, newest first, each with its Item's Source, title and date and a link back to that place in the Reader. Search and the Source, Topic and Tag filters work there too. | 2026-11-04 |
| Design of new screens | Every screen the first design lacks is built from `design/system/` to match the existing screens: the Highlights page, the Highlight mark and menu, the Note box, the login, Topic pages, Related Items in the Reader, the Index, the Log, the Proposals page, Import, and the AI, Grok Bot and Obsidian settings. Impeccable Reviews and the building agent check each from screenshots in every theme before it lands; the agent decides the approval (owner, 2026-11-04). No Claude Design round. | 2026-11-04 |
| Design review | Impeccable Reviews, a GitHub App in closed beta, reviews every pull request that changes a screen. It posts one review comment with its findings and screenshots, writes no summary into the PR body, and its GitHub check fails on a P1 finding or worse. It judges against a design profile scanned from `design/` and confirmed on 2026-11-04, with the prototype's own tool panels (`.tool`, `.tw`) excluded; against ten rules, six quoted from Design below (token-only values, contrast, the 12px floor, 44px targets under 480px, the open-row bar, reduced motion) and four the app suggested from `design/system/` and the owner kept (the app root never scrolls, the 1px and 2px literals `tokens.css` allows, the unread dot on the first metadata line, the reading width set by Text width); and through four personas, one of them on a phone. Impeccable finds the Worker copy through its `pr-copy` GitHub deployment and signs in with the saved preview account; the desktop capture on 2026-11-06 showed the signed-in list and demo Items. Drafts are not reviewed. `tools/impeccable-wait.sh` waits for the current head’s deployment and review. Impeccable's live address is the live copy, `https://threadsift-live.<subdomain>.workers.dev` (set 2026-11-06), so a review's before comes from `main`. The live copy has its own demo password, and Impeccable's form check found no sign-in form there, so it signs in with a saved browser session made through the real login; Impeccable confirmed that session signs in but opened no page behind it, so the first review of a screen change shows whether the before is the signed-in list. The saved session cookie expires 30 days after it was made (2026-12-06), so it needs a new one before then. | 2026-11-04 |
| Owner password | Signed in, the owner changes the password in Settings with the current one; every other session ends, the owner's own session gets a new id, and agent tokens keep working. An owner who lost the password sets `PASSWORD_RESET_CODE` on the server (a container environment variable read at start, or a Worker secret), opens "Lost your password?" on the sign-in screen and enters the code with a new password. The code is an operator credential of at least 32 characters, works once, ends every session, keeps the agent tokens and signs nobody in. With no code on the server nobody can reset anything. `docs/architecture.md` (Access) holds the rules and the status codes. | 2026-11-07 |
| Agent access | Besides the HTTP API, the app serves an MCP endpoint whose tools search Items, read one Item with its Digest, Highlights and Note, and add a link. Each tool runs the same code as the matching HTTP call. | 2026-11-04 |
| Backup and restore | The export zip also holds every library record (everything except secrets, login data and work in flight), and a new Instance can restore from it after its setup code is entered, so the same zip backs up both install targets and moves a library between them (`docs/architecture.md`, Export, backup and restore). | 2026-11-04 |
| Export | The owner downloads the library as a zip with one Markdown file per Item: front matter with Source, URL, author, dates, Topic, Tags and Read state, then the Summary, Key points, Highlights, Note, post text and Kept comments, with the Item's stored images beside it. | 2026-11-04 |
| README | The README sells the project: a hero screenshot, a short recording of a Paste turning into a Digest, screenshots of the Reader, the Highlights page and a Topic page in several Styles, the two deploy routes as buttons, and a short feature list. An agent drafts its prose and the building agent approves it (owner, 2026-11-04). | 2026-11-04 |

## Design

The design is done for every screen in the first spec; the app takes its look from these files, not from new design work. Screens added later follow the Design of new screens decision above.

- **Values:** `design/system/tokens.css` is the one source for every colour, size, spacing, radius, shadow, motion and breakpoint value. Each option of each Look setting is a `data-*` rule on the app's root, and the default option is the plain value.
- **Settings:** `design/system/settings-table.ts` is the one settings table: each setting's id, label, root attribute, kind, group, Look flag, options and default. Every other list (the defaults, the Look settings that Reset look covers, the stored-settings reader, the root attributes) is built from it, and `web/` imports it.
- **Behaviour:** `design/prototype/` shows how each screen behaves: the reader bar drops the key hint, then the position, then button labels until nothing overflows; long comments and code blocks fold; the reading place is restored; the settings panel becomes a bottom sheet with a fixed header and footer under 760px wide.
- **Styles:** the 10 Style blocks live in `design/system/tokens.css`, with a palette for each Theme. Their fonts load from the Instance. The prototype keeps its copy until it imports the system file.
- **Breakpoints:** 480, 760, 1080 and 1440px, with 1, 2, 3, 3 and 4 grid columns from the narrowest band up.
- **Accessibility:** every text and background pair is at least 4.5:1 in every theme with every accent and Style. Every mark, icon and border a person needs to see a control or its state is at least 3:1 in the same combinations (W3C, WCAG 2.2 Non-text Contrast). Dividers, and the edge of a control that shows visible text, may be fainter. Text is never under 12px. Under 480px every target is at least 44px. The open row is marked by a bar as well as by colour. Motion has a reduced-motion form.
- **Keyboard:** j and k move through Items, Enter opens, m marks read or unread, / focuses search, the left and right arrows step to the previous or next Item while one is open in Grid, and Escape closes the open Item.

## Ingest flow

```
paste box, Share target, Extension, Import, HTTP API, MCP, Grok Bot
   -> POST /api/items {url} (or {url, content} from the Extension and the .json paste)
   -> classify URL (reddit post | reddit comment | x post | github repo | article | other)
   -> fetch (no LLM), or take the content the caller sent
   -> deterministic clean
   -> agent call: comment filter + Digest (JSON out), unless the caller sent a Digest
   -> store; the Item shows "processing" until done
   -> wiki steps: Topic page, Related Items, Log (see The library wiki)
```

Fetchers:

- **X post:** with a Grok Bot webhook set up, Threadsift hands the link to the owner's bot, which fetches the post, its thread, replies and media through its free X connector and sends them back. Without one, the container build uses the grok CLI, headless: `x_thread_fetch` with the post id, and `x_keyword_search` with `conversation_id:<id> filter:replies` for the replies (tested on 2026-11-03 with grok 1.0.70). The Cloudflare build has no CLI, so there X needs the webhook.
- **Reddit post or comment:** a pasted Reddit link becomes a Link-only Item with its title, author and subreddit from Reddit's oEmbed endpoint. On Save, the Extension makes one signed-in request from the owner's tab, `<thread>/.json?limit=500&raw_json=1`, and posts that JSON. Threadsift reads it with the same parser as the `.json` paste, so one parser owns Reddit JSON. On a 671-comment thread in the owner's browser, the page held 100 comment elements, and the `.json` returned 465 comments plus 199 behind `more` stubs (measured 2026-11-04). After the thread's `.json`, the Extension fetches the replies behind each `more` stub by their own permalink, `/comments/<post>/_/<comment id>.json?limit=500&raw_json=1`, and follows the stubs those answers hold; a stub with no children ("continue this thread") is fetched by its parent's id. One parser reads every answer. `/api/morechildren` answered 403 even to a signed-in session, so the fill uses permalinks. The requests are spaced and capped per thread, and a reply that still fails becomes a Context stub that says it was not saved. On a 677-comment thread the first `.json` gave 464 comments and 34 stubs, and 67 permalink requests, all HTTP 200, brought it to 659 in 51 s (2026-11-05, a throwaway account from a home address). When the `.json` request fails, the Extension falls back to the Reddit extractor of Defuddle (MIT, the extractor behind Obsidian Web Clipper) on the rendered page. A Link-only Reddit Item, such as one shared from a phone or imported from `saved_posts.csv`, is filled when the owner opens that thread in a browser with the Extension. The Extension asks Threadsift whether the link is a Link-only Reddit Item and, if so, saves it the same way. The Reader of such an Item offers to open it on Reddit to fill it. Without the Extension, the owner can paste the text of the post's `.json` page from their own browser.
  - **Archive fill (self-hosted builds).** A Reddit link that arrives without Extension content (Paste, Import, Share) is filled from Arctic Shift when no Reddit account is connected or the account request fails, `GET https://arctic-shift.photon-reddit.com/api/comments/tree?link_id=t3_<id>&limit=9999` and `/api/posts/ids?ids=<id>` for the post. It is on by default, and a setting turns it off. On the 671-comment thread it returned 661 comments with no `more` stubs in 1.4 s, with no key, from a home address and from a Worker (2026-11-04). Comments that Arctic marks as deleted later (`_meta.was_deleted_later`, 24 of the 661) are dropped, and `[deleted]` and `[removed]` placeholders are treated as the Comment filter treats them. The oEmbed title wins when Arctic's title differs, and the Item names the archive and its date as its source. On a rate limit, a timeout or an outage the Item stays Link-only, with one retry after `X-RateLimit-Reset`, at most 10 s. Extension content replaces an archive fill on the next Save.
  - **The owner's Reddit account (self-hosted builds).** An optional setting connects the owner's own Reddit account. When connected, it is the first server source for a Reddit link without Extension content, before Arctic Shift: it fetches the thread's `.json` and the replies behind its `more` stubs the same way the Extension does, so a thread is complete and current. It also resolves `/s/` share links on the server. The requests carry the account's `reddit_session` cookie. In the container they use the platform `fetch`, which got HTTP 200 from a home and a datacenter address (2026-11-04). On Cloudflare, the Workers `fetch` got 403 for the thread's `.json` even with the cookie, while a raw TLS socket from the same Worker got HTTP 200 with 464 comments in 3 of 3 runs (2026-11-05), so the Worker sends these requests over a socket. The setting shows when the session stops working and asks the owner to connect again.
  - **Share links.** `redd.it/<id>` becomes `/r/all/comments/<id>/` without a request. A `/s/` link needs one redirect on reddit.com: the owner's browser follows it when the owner opens the Item, and the Extension saves the thread at its canonical URL; with a connected account the server follows it.
  - A fetcher plug-in interface lets a self-hoster add their own adapter, at their own risk.
- **GitHub repo:** the GitHub API: description, topics, stars, last push, license and README.
- **Article:** readable text extraction (Readability-style), or the page the Extension sent.
- **Other (YouTube and so on):** a Link-only Item with its title.
- **One hop:** when a post links to an article or repo, the fetcher also gets that page's text for the Digest.
- **Media:** images are downloaded and stored with the Item; videos are kept as URLs.
- **Duplicates:** URLs are normalized, and pasting a known URL again refreshes that Item.

Why Reddit works this way, checked on 2026-11-04: Reddit blocks anonymous `.json` (HTTP 403 since May 2026), stopped taking new API access requests on 2026-10-31, and its app-registration page says "Remaining public API access will end in March 2027". Its User Agreement forbids scraping without written consent, and its Developer Terms forbid paid use of Reddit data without an agreement. A tab the owner opened by hand sends no server traffic to Reddit, and the archive fill sends none either; only a connected account makes the owner's own server request threads from reddit.com, with the owner's own session. Readeck's add-on works the same way and still works, while tools that fetch Reddit from a server (Linkwarden, Karakeep) are blocked.

## Comment filter

1. The script drops deleted or removed comments, bot accounts (AutoModerator and similar) and short replies with no content.
2. The agent keeps a remaining comment only when it adds a fact, a fix, a working link or command, first-hand experience, or a real counterargument. It drops jokes, agreement and repeats.
3. When a kept reply sits under a dropped parent, the parent stays as a one-line Context stub so the tree still reads correctly.
4. X replies follow the same rules.

## Agent output per Item

The agent returns one JSON record, the Digest, stored apart from the fetched content so it can be regenerated without fetching again:

- a clean title
- one Topic from a Topic list that the agent keeps and grows itself
- up to 3 Tags; before creating a Tag, the agent checks the existing ones, so near-duplicates do not appear
- a 2-line Summary covering the post and what the Kept comments concluded
- Key points
- the ids of the Kept comments

Topic and Tag identity uses `catalogKey` in `src/core/catalog.ts`: NFKC normalization, lower case, trimming and collapsed whitespace. The first spelling stays visible. This normalized key is the app's only duplicate check; semantic near-duplicates such as "ML" and "Machine learning" are the model's job from the supplied lists, and later the Proposals' job.

The list uses the stored Digest's clean title and Topic and keeps the fetched title separately. Summary, Key points and Tags wait for the Reader. The last stored Digest stays visible during refresh or regeneration. A failed run shows "No Digest" only when there is no stored Digest; a kept Digest shows "Digest not updated", and both failure states offer Try again. That action queues a Digest over stored text without a new fetch, and does nothing while a Digest is already open or the Item is failed. A failed Item keeps the paste retry action. The owner session and agent tokens may call it.

A failed fetch keeps the Item `failed` while a remaining Digest closes under it. Otherwise an Item stays `processing` while either job is open, and the batch that closes the last job makes it `ready` with no failure reason. A fetch that stores post text increments the Item's content generation and opens its Digest in the same batch. A Paste alone does not increment it. Items with no post text settle without a Digest job. With post text, the fetch opens a Digest when a Provider is saved or a caller-sent Digest is pending; it decides this in its publishing batch. When a refresh stores new text without opening a Digest job, a retained older Digest gets the failure marker and offers Try again.

A Digest waits for an open fetch before calling the Provider. It publishes only at the generation it read. A stale result is discarded, its AI task fails, and the lease-held job returns to the queue on fresh inputs with the same attempt count. Each job run makes at most one model call.

Wrong keys, missing models, refused addresses, missing configuration or sealing secrets, and Provider HTTP 400 or 422 answers give up immediately. Network failures, timeouts, a busy Provider, and a successful HTTP answer whose output fails the Digest schema retry with the job runner's delays. A failed Digest leaves fetched content readable.

`POST /api/items` accepts a caller-sent Digest from the owner session or an agent token. Invalid Digests return 400 before storage. The last Paste sets or clears the pending Digest. A fetch with no text drops it and keeps any stored Digest; a fetch with text lets it publish by normalized key, without a catalog guard or a Provider call. Its AI task starts before publication with executor `caller`, with no Provider or model; a failed publication leaves a failed task record. Try again always uses the configured Provider.

## The library wiki

A small version of the LLM wiki idea (https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): the agent builds the synthesis once, when an Item arrives, and keeps it current, instead of searching raw content at question time. Each Item's Digest is its summary page; the four parts below add the rest.

1. **Topic pages.** Each Topic has a page with a 3 to 5 line overview the agent writes, and the list of its Items with their Summary lines. After each new Digest, one small agent call revises the overview of that Item's Topic from the overview and the new Digest, or leaves it unchanged. The overview names the Items it was built from, so it never stands in for them.
2. **Related Items.** The Reader shows up to 5 Related Items, each with a one-line reason. The app finds candidates with the full-text search, and the agent picks the real ones. Related Items are links between Items, not prose inside a page.
3. **Index and Log.** The Index lists every Topic with its Item count and its overview line. The Log lists every agent action, newest first, in the form `[2026-11-04] ingest | <title> | topic: X | tags: a, b`, including created Topics, renamed Tags and regenerated Digests. The app builds both from stored records, with no agent call.
4. **Proposals.** Once a week, the Proposals page lists changes the agent suggests and never makes on its own: merge two Tags, merge two Topics, two Items in a Topic that disagree (with both Summary lines), an Item no overview mentions, a Highlight no longer found. Plain checks find the duplicates and orphans; the agent runs only on the Topics those checks touch. The owner accepts or rejects each one, and the app applies the accepted ones. An accepted correction is kept as a Pin, so the next regeneration cannot undo it.

The owner's Highlights and Notes are never regenerated or rewritten by the agent.

The rules above answer the known failures of LLM wikis, from the gist's comments: a wrong merge becoming a permanent error (overviews cite their Items, changes go through Proposals), human corrections lost to regeneration (Pins), and near-duplicate pages from parallel updates (one update at a time per Topic).

## AI providers

The owner picks one Provider in the AI settings, and the screen shows only the fields that Provider needs. "Verify" runs one small real Digest, so a model that cannot return the Digest's JSON fails at setup, not on the 200th Item.

The Settings page currently offers OpenAI-compatible URL and OpenRouter, reached through the gear panel’s Instance settings link. Save keeps the API key sealed on the Instance; the screen only reports whether a key is set. Verify uses the saved settings and shows a Digest or a refusal with a recovery action. It adds no Item, Topic or Tag. Fetched Items with post text now get automatic Digests when the saved Provider loads. The Topic and Tag lists and caller-sent Digests are built. Saving a Provider opens Digest jobs for older Items with post text, no stored Digest, no failure marker and no open Digest job. Saving again does not reopen failed Digests; Try again owns that retry. This spends one model call per eligible Item, with 4 jobs at a time in the container and up to 100 per minute on Cloudflare. OpenRouter has no live proof until the owner supplies a key.

| Provider | Self-hosted container | Cloudflare deploy | Hosted product (later) |
|---|---|---|---|
| OpenRouter, by key or the Connect button | yes | yes | yes |
| Anthropic, OpenAI or xAI API key | yes | yes | yes |
| Any OpenAI-compatible URL (Ollama and others) | yes | yes, at a public HTTPS address | no |
| Workers AI | no | yes | maybe |
| Claude Code, Codex or Grok CLI signed in on this server | yes, when the app finds the CLI | no | no |
| Grok Bot (the owner's plan runs every AI task: Digests, Topic overviews, Related Items, Proposals) | yes | yes | yes |
| Sign in with ChatGPT | later | later | only after OpenAI approves it |

- **CLIs:** the app never reads or stores a CLI's login; the owner signs in with the CLI's own command, and the AI settings show that command when the CLI is signed out. The CLI runs with its tools turned off in an empty folder, because every Digest call reads other people's posts.
- **Plans:** Anthropic allows "an end user… signing in to the unmodified Claude Code binary with their own Claude subscription" and forbids a third party from offering "Claude.ai login" or routing plan credentials for its users (`code.claude.com/docs/en/legal-and-compliance`, read on 2026-11-04). So the hosted product never offers a Claude plan login. Plan limits are small for an Import, so the Import screen suggests an API key when a plan Provider is picked.
- **Default model:** during the build, a 20-Item comparison of the Providers picks the recommended default by Tag quality, Digest quality and run time.

## Grok Bot

```
A. The owner drops a link in a Grok Bot chat
   owner -> Grok Bot -> POST /api/items (MCP or token) -> Threadsift

B. Scheduled X bookmark sync
   Grok Bot (every few hours) -> reads new X bookmarks -> POST each to Threadsift

C. Intake webhook
   owner pastes an X link into Threadsift
   Threadsift -> POST the link to the routine's webhook URL and key -> Grok Bot wakes
   Grok Bot -> fetches post, thread, replies (X connector) and writes the Digest
   Grok Bot -> POST /api/items with the content and the Digest -> Threadsift
```

- **Setup:** the owner connects Threadsift to Grok Bot once, with Threadsift's URL and a token. For C, they paste the webhook routine's URL and key into Threadsift's Grok Bot settings, which has a Test button that sends a harmless ping. The key stays on the server.
- **The Threadsift bot:** a public Grok Bot template with skills that save links dropped in chat, search the library, run the X bookmark sync and answer Threadsift's webhook. Its setup skill walks the user through adding their Threadsift URL and token, because a template cannot carry a custom MCP server.
- **What the API needs for it:** `POST /api/items` is idempotent by URL, accepts content and a Digest the caller already wrote, and returns the Item's URL so the bot can link it in chat; a batch call takes many Items with a cursor (the last bookmark id), so a routine sends only what is new.
- **AI tasks:** when Grok Bot is the Provider, Threadsift also sends it each wiki task (a Topic overview, a Related Items pick, the weekly Proposals) through the same webhook, and the bot posts the result back; without Grok Bot, every task runs on the Provider the owner picked (decided 2026-11-04, `docs/architecture.md`, AI tasks and Providers).
- **Speed:** an X link through the webhook takes seconds to tens of seconds longer than a direct fetch (Grok Bot's own estimate, not measured), because the bot has to wake and run.
- **Later:** a listing in Grok Bot's plugin catalog, once the way a third party gets listed is known. That listing needs OAuth on the MCP endpoint.

Grok Bot's capabilities above come from asking the owner's Grok Bot on 2026-11-04; it marked each answer as checked or inferred.

## Obsidian vault mirror

- Each Item is one Markdown note in a folder of the owner's vault: front matter with Source, URL, author, dates, Topic, Tags and Read state, then the Summary, Key points, Highlights, Note, post text and Kept comments, with its images beside it. Related Items are wikilinks between notes, and Topic pages, the Index and the Log are notes too.
- Threadsift writes the vault in one of two ways: it commits to the vault's repository on GitHub through GitHub's API, on both install targets, or, in the container only, it writes to a vault folder on the same machine. Every change to an Item updates its note. Vault repositories on other Git hosts are not in the first release (decided 2026-11-04, `docs/architecture.md`, Vault mirror).
- The mirror is one-way: the owner reads in Obsidian and edits Highlights and Notes in Threadsift. Readwise's Obsidian sync works the same way.

## Storage and search

- Language, runtime, database and libraries: `docs/architecture.md`.
- Stored records: Items (Source, URL, author, dates, cleaned content), Kept comments, media, Digests, Topics, Tags, Topic pages, Related Items, Log entries, Proposals, Pins, Highlights, Notes, agent tokens and the server-side settings.
- Full-text search over title, post text, Kept comments, Summary, Tags, Highlights and Notes.
- The owner changes only Read state, Highlights and Notes, accepts or rejects Proposals, and can delete an Item; the agent sets everything else.
- Backups: the export zip with its record file, restored on a new Instance (Backup and restore decision above).

## Interfaces

- The paste box, the Extension, the Share target and agents use the same HTTP API: `POST /api/items {url}` to add, `GET /api/items?q=&topic=&tag=&source=&read=&url=` to query (`source` is one of reddit, x, github, article and other; `read` is read or unread; `topic` and `tag` match by name with case and spacing ignored; `url` finds one Item by its normalized URL, which the Extension uses to fill a Link-only Reddit Item), `DELETE /api/items/:id` to delete, and a batch call for Imports and routines. Every call except the owner's login needs the owner's session or an agent token.
- `GET /api/items` answers the matching Items and the counts the filter pane shows: the library total and unread count, and a count for each Source, Read state, Topic and Tag. Each group's counts apply the search and the other groups' filters but not its own group, so a count equals what choosing that value leaves. Search splits `q` into runs of letters and digits, each run is a prefix match, and every run must match; a `q` over 200 characters, or an unknown `source` or `read`, answers 400.
- The MCP endpoint offers the same search, read and add for agents that speak MCP (see Agent access above).
- The Web Share Target hands a shared link to the same Paste.
- The Export is one download of the whole library (see Export above).

## Install and deployment

| | Container (Podman or Docker) | Cloudflare deploy button |
|---|---|---|
| Storage | SQLite and a folder for images | D1 and R2 |
| AI Providers | every row of AI providers marked for the container | API keys, OpenRouter, an OpenAI-compatible URL at a public HTTPS address, Workers AI, Grok Bot |
| X fetching | grok CLI or Grok Bot webhook | Grok Bot webhook; without it, X links are Link-only Items |
| Reddit | Extension, `.json` paste, archive fill, the owner's Reddit account, Link-only Items, own adapter if added | Extension, `.json` paste, archive fill, the owner's Reddit account, Link-only Items |
| Vault mirror | GitHub repository or a local vault folder | GitHub repository |
| Cost to the self-hoster | their own server | Cloudflare's $5 a month Workers Paid plan; the reason is in `docs/architecture.md` (Cloudflare deploy button) |

- One codebase serves both: the database, the file store, the job queue and the AI caller each have one adapter per target. EdgeEver and Open Managed Agents already ship one app on both.
- The owner's own Instance runs in the container on the owner's home server, at a public HTTPS address with the owner login, so Grok Bot can reach it.

## Hosted product (after the first release)

Known so far, from the grill's research on 2026-11-04:

- AI comes from API keys, OpenRouter's Connect, Workers AI or the user's Grok Bot. No Claude plan login; Sign in with ChatGPT only after OpenAI approves it; xAI plan login only after xAI says it is allowed.
- Reddit Items are Link-only, plus what the user's Extension sends, with no archive fill and no account option, until Reddit gives written consent for a paid service.
- Storing X content in a paid service needs a read of X's developer terms first.
- Comparable hosted services cost $3 to $13 a month (Karakeep $4, Linkwarden $3, Readwise Reader $7.99, mymind $7.99 to $12.99, read on their pricing pages on 2026-11-04). Threadsift's price is not decided.

## Later (not in the first release)

- The hosted product (above).
- A desktop app and mobile apps.
- A listing in Grok Bot's plugin catalog.
- Imports from browser bookmark files and from other apps (Raindrop, Pocket, Karakeep).
- Two-way Obsidian sync.
- Digest or resurfacing: the day's new saves, and one old save worth rereading.
