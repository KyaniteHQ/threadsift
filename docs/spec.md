# Threadsift: v1 spec

Each bullet states one behaviour of v1. A feature the code does not build yet appears only under Hosted product and Later. [The architecture index](architecture.md) lists the pages that hold the mechanics and the status of each part. [Decisions and evidence](architecture/decisions-and-evidence.md) holds the reasons and measurements, and [HTTP interfaces](architecture/http-interfaces.md) the route rules.

## Contents

- [Goal](#goal)
- [Release order](#release-order)
- [Product](#product)
- [The Extension](#the-extension)
- [Settings, look and layout](#settings-look-and-layout)
- [Design](#design)
- [Ingest flow](#ingest-flow)
- [Fetchers](#fetchers)
- [Comment filter](#comment-filter)
- [Agent output per Item](#agent-output-per-item)
- [The library page and the Reader](#the-library-page-and-the-reader)
- [Highlights, Notes and the Highlights page](#highlights-notes-and-the-highlights-page)
- [Export, backup and restore](#export-backup-and-restore)
- [The library wiki](#the-library-wiki)
- [AI providers](#ai-providers)
- [Grok Bot](#grok-bot)
- [Obsidian vault mirror](#obsidian-vault-mirror)
- [Access](#access)
- [Interfaces](#interfaces)
- [Install and deployment](#install-and-deployment)
- [Hosted product (after the first release)](#hosted-product-after-the-first-release)
- [Later (not in the first release)](#later-not-in-the-first-release)

## Goal

Threadsift has two aims:

1. A free, open-source app that anyone can self-host, with a container or a Cloudflare deploy button.
2. Later, the same app as the owner's own hosted product, with its own pricing.

## Release order

| Release | What it is |
|---|---|
| First release | The self-hosted open-source app, one owner per Instance. It ships as a container image (Podman or Docker) and as a Cloudflare deploy button on the same day, and the browser smoke spec runs on both. |
| After it | The hosted product, once its pricing and the AI and content terms are settled. |
| Later passes | A desktop app and mobile apps. The web app comes first. |

## Product

- **Name and licence.** The product is Threadsift. The licence is AGPL-3.0-only. The required CLA check verifies that outside contributors have signed the contributor licence agreement.
- **App type.** A public web app with an owner login. Each connected agent gets its own token. The app needs a public HTTPS address so that Grok Bot can reach it.
- **Search engines.** Every answer of an Instance, on both install targets, carries `X-Robots-Tag: noindex, nofollow`, so a search engine does not list the Instance's address. The one exception is the 400 that the container's Node server writes for a request it cannot parse as HTTP. The Instance answers 404 for `/robots.txt`, because a crawler that `robots.txt` keeps out never fetches a page and never reads its `noindex` rule ([HTTP interfaces](architecture/http-interfaces.md), Search engines). On Cloudflare the platform can answer `/robots.txt` before the Worker runs: a domain on the Free plan with no `robots.txt` of its own gets Cloudflare's Content Signals Policy, a file of comments that holds no rule ([Cloudflare docs, Managed robots.txt](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/)).
- **Intake.** One link at a time through the paste box, the Web Share Target, the Extension, the HTTP API, MCP or Grok Bot, plus an Import of many links at once.
- **Import.** The Import screen at `/import`, opened from the Import link in the settings panel beside Highlights, takes a pasted list or a CSV or text file, shows its progress and resumes a list it imported before ([Web app](architecture/web-app.md), The Import screen). Reddit's saved-posts CSV export goes in through the list import as Link-only Items.
- **X bookmarks.** The Threadsift bot sends the post ids of the owner's X bookmarks, in a sync and in a one-time import of all bookmarks, and the Instance fetches each thread through the bot.
- The sync routine starts paused ([Threadsift bot setup](../bot/setup.md)), runs every 3 hours once the owner turns it on, reads at most 20 pages of 100 ids, and reads the bookmark list only, so folders are not imported. An older bookmark needs the one-time import.
- **Tags.** The UI has no Tag editing. The Provider's Digest checks the existing Tags and Topics before it creates one, so near-duplicates do not appear. A caller-sent Digest sets its own Tags, and a Digest the Threadsift bot writes does not see the Tag list. Proposals keep the lists clean over time.
- **Comments.** A high-pass filter keeps a comment only when it adds something, with no fixed count.
- **Threadsift bot.** A public Grok Bot template that any Grok Bot user can install. Its skill files live in this repository.
- **Reddit.** Thread content comes from the owner's own signed-in tab (the Extension) and, in the self-hosted builds, from the owner's connected Reddit account and then the Arctic Shift archive. The server fetches no thread from reddit.com otherwise, and nothing fills threads in the background ([Reddit post or comment](#reddit-post-or-comment)).
- **Delete.** The owner can delete an Item from the Reader, after a confirmation. Deleting removes the Item, its Digest, its stored images, its Highlights, its Note and the Log entries that name it. Agents use `DELETE /api/items/:id`.
- **Search.** Full-text search covers title, post text, Kept comments (not the comments the Reader shows before a Digest covers the thread), the Digest's clean title, Summary, Tags, a GitHub repository's description and topics, Highlights and Notes.
- **Who changes what.** The owner changes only Read state, Highlights and Notes, accepts or rejects Proposals, and can delete an Item. The agent sets everything else.

## The Extension

- A browser extension for desktop Chrome and Firefox saves the page in the owner's own tab in one click. Firefox for Android is not supported.
- Any http or https page works except a page on x.com, twitter.com or github.com, a page on a link shortener's own address (`bit.ly`, `t.co` and the other short-link hosts) and a Reddit page that is not a post or comment. The server refuses those, and the Extension says it cannot save them.
- On a Reddit thread it sends the thread's `.json` with the answers for the replies behind its `more` stubs, and falls back to Defuddle's Reddit extractor when that request fails or its answers cannot be assembled into one thread.
- A page capture is sent only when the tab still holds the page the Save started on, with a hash, a tracking parameter or a trailing slash the page adds itself ignored. When the tab moved to another page meanwhile, nothing is sent and the Extension says it could not save.
- With "Fill saved Reddit items" on, opening a Link-only Reddit Item's thread fills that Item. In Firefox, Turn on also asks for the optional browsing activity data permission, because Fill sends the Instance the address of each Reddit thread the owner opens; Deny leaves Fill off.
- In the self-hosted builds, the Extension's Connect Reddit button connects the owner's Reddit account ([Connect a Reddit account](guides/reddit-account.md)).
- The owner enters the Instance's address and an agent token on the Extension's settings page, and the browser asks permission for that one host when the address is saved.
- After it saves them, the settings page sends one request with that address and token and says what came back: the address and the token work, the name was not found, the connection was refused or timed out, no secure connection could be made, the browser could not connect, the address is not a Threadsift Instance, the Instance is older than the Extension, the token was refused, the token lacks the Read and Add scopes, or the check did not finish ([Extension and Threadsift bot](architecture/extension-and-threadsift-bot.md), Check the address at Save settings). When the check fails, the fields keep what the owner typed.
- A changed address needs its agent token: the settings page does not keep the saved token for another address and saves nothing until the owner enters one.
- When a save cannot reach the Instance, the popup names the cause the browser reports: the name was not found, the connection was refused or timed out, or no secure connection could be made. Without a reported cause it says it could not reach the address.
- The Extension holds only the `activeTab`, `scripting`, `storage` and `webRequest` permissions, the last to read why its own call to the Instance failed. It asks for the Instance's host at Save settings, and for more only for the two Reddit features ([Extension and Threadsift bot](architecture/extension-and-threadsift-bot.md), Permissions). It saves one page per click and never crawls.
- One command builds the Extension's Chrome and Firefox store zips and the source archive that Firefox Add-ons reviews, checks both zips, fails when a store's listing text gives no reason for a permission, a data collection permission or a host permission of that store's manifest, and rebuilds both from the archive; the gate runs it ([Extension and Threadsift bot](architecture/extension-and-threadsift-bot.md), Package for the stores). The owner uploads the first version to each store by hand; the release workflow submits each later stable release to both, and neither a release candidate nor a stable release older than the newest ([Extension and Threadsift bot](architecture/extension-and-threadsift-bot.md), Extension release).

## Settings, look and layout

- **Layout and reader.** Both are app settings, saved per browser. "Layout: List or Grid": List is three panes (filters, item list, reader); Grid is a card grid. "Open items as: Page or Sheet" applies to Grid: Page grows the card into a full-page reader, Sheet opens a centred sheet over the dimmed grid. Under 760px wide, items always open full screen.
- **Look settings.** Font (6 pairs), Text size (Small, Medium, Large), Text width (Narrow, Medium, Wide), Density (Compact, Comfortable, Roomy), Comment style (Indented lines, Cards, Rail), Accent (5 colours), Tag style (Chips, Text, Dots) and Card images (On, Off). Defaults: Schibsted Grotesk with Commit Mono, Medium text size, Medium width, Compact, Indented lines, Moss, Dots, images on.
- **Reset look.** It resets only the Look settings, Style included. Layout, Open items as and Theme stay, and the panel says so in visible text.
- **Card images.** Off hides the card picture only, never the reader's, and does not load the card pictures at all.
- **Style.** One more look setting: Library (default) plus 10 styles ([Styles](design/styles.md)). While a Style other than Library is on, its fonts and accent replace Font and Accent. Those controls are disabled, and one note under Style, which both controls point to, says "{style} sets Font and Accent. Choose Library to change them." with the Style's name in place of `{style}`. Their stored values stay, and choosing Library restores them, including after a reload.
- **Themes.** Light, Dark, Sepia and System. System follows the device; with no setting stored, the app draws Light.
- **Storage.** All twelve look and view settings (Layout, Open items as, Theme and the nine Look settings) are stored together in the browser. Each Item's reading place is kept for the browser tab. The AI, GitHub token and Grok Bot settings are stored on the server, and the keys and tokens in them are sealed under the Instance's secret key ([Access](architecture/access-owner-login-agent-tokens-mcp.md)).
- **Unavailable actions.** While nothing is saved, Verify and Test in the AI, GitHub token, Grok Bot and Reddit account settings, and Remove or Disconnect in the GitHub token, Grok Bot, Reddit account and Obsidian settings, are unavailable. The section shows the reason under its buttons before any press, and a screen reader reads it with the button.
- **Share from phone.** The app is an installable web app with a Web Share Target, so the Android Share menu sends a link into the same Paste as the paste box.
- While the owner is signed in, a share from the installed app saves the link at once and opens the library with that Item's paste card. A known link opens its Item in the Reader.
- A share the app cannot trust writes nothing. That means a link or form on another site, a request that lacks the browser's origin metadata, or any share while signed out. The library opens with the link in the paste box, and the owner presses Add. A signed-out share keeps its link through sign-in, a wrong password included.
- The link is the first http or https address in the shared url, text or title, in that order, without trailing punctuation.
- A share with words but no link opens the paste box with the shared words and the paste box's invalid-link error. A share with no content at all shows the notice "Paste a link first."

## Design

Every screen the app draws takes its look from the design system, and a screen added later is built from it. [Design system](../DESIGN.md) holds the values, breakpoints and component rules, and the token stylesheet is the one source for every value.

- **Settings:** the settings table (`SETTINGS`) is the one table of settings, and every other list of settings is built from it.
- **Behaviour:** the clickable prototype shows how each screen behaves.
- **Styles:** the 10 Style blocks live in the token stylesheet, with a palette for each Theme. Their fonts load from the Instance.
- **Accessibility:** every text and background pair is at least 4.5:1 and every mark a person needs to see a control or its state at least 3:1, in every theme with every accent and Style. Text is never under 12px. Under 480px every target is at least 44px, except the width of a link or a Highlight mark in the text of a post or comment, a code block included, which keeps the width of its text. The open row and the open Grid card are marked by an edge as well as by colour. Motion has a reduced-motion form.
- **Keyboard:** the first Tab stop in the Library is a button that moves focus to the first Item; j and k move through Items, Enter opens, m marks read or unread, / focuses search, the left and right arrows step to the previous or next Item while one is open in Grid, and Escape closes the open Item.
- **Review:** the building agent checks screenshots in every theme before a screen lands ([Reviewing code](agents/reviewing-code.md)).

## Ingest flow

```text
paste box, Share target, Extension, Import, HTTP API, MCP, Grok Bot
        |
        v
POST /api/items
  {url}
  {url, content}   a Reddit thread (Extension, .json paste), or an X post with its
                   replies from a caller that fetched them
  {url, page}      any other page, from the Extension
        |
        v
classify the URL: reddit post | reddit comment | x post | github repo | article | other
        |
        v
fetch, or take the content the caller sent
  (no Provider call, but a model reads an X post, through the grok CLI
   or the Grok Bot's x_intake AI task)
        |
        v
deterministic clean
        |
        v
agent call: comment filter + Digest (JSON out), unless the caller sent a Digest
        |
        v
store; the Item shows "processing" until done
        |
        v
wiki steps: Topic page, Related Items, Log (see The library wiki)
```

## Fetchers

### X post

- The owner chooses in Settings which reader fetches X links: `auto` (the default), `grok-bot` or `grok-cli`. Under `auto`, a usable Grok Bot webhook goes first, and without one the container tries the installed grok CLI ([Fetchers](architecture/fetchers.md), X).
- `grok-bot` and `grok-cli` use that reader alone and never fall back to the other. When it cannot be used, the Item is Link-only and carries a note that names the cause.
- The bot fetches the post, its thread, replies and media through its X connector and sends them back to `POST /api/ai-tasks/{id}/intake`. A bot that never answers ends the Item `failed`, with no fallback to another source.
- Both readers store the thread unpublished, and a verification job publishes it when the post itself matches X's public oEmbed answer for its id; a reply, follow-up or quoted post that fails the check is left out ([Fetchers](architecture/fetchers.md), The check against X).
- The Reader shows the post with its Author thread (the author's own chain of replies), its Quote chain (the posts it quotes, 5 at most) and its photos. A part that fails the check is left out, and a line says it was not saved.
- Both readers rank replies by likes and keep the smallest set that accounts for 80% of the likes, between 20 and 40, plus those replies' ancestors and the author thread. When a parent is missing, the Reader groups its replies under one Context stub, and a thread with fewer replies than the post reports ends with a "Further replies weren’t saved." row ([Fetchers](architecture/fetchers.md), Replies kept).
- A post X does not show ends the Item `status`, and the Reader says X does not show the post. A Link-only X Item offers Try again when its note is `cli-failed` or `x-unconfirmed`. Every note names the cause, and the other notes say what to do instead ([Fetchers](architecture/fetchers.md), Outcomes and notes).
- A refresh that fails keeps the saved thread.
- A Paste can carry the thread: `POST /api/items` with `{url, content}` for an X link takes one JSON text of the post and its replies (`XThreadSchema`), keeps every supplied reply, is not checked against X and stores it like a Reddit thread.
- The container checks the grok CLI before it reads X posts with it, and again whenever the binary changes: a test run, and a probe run that asks for a file write, a file read and a shell command. A CLI that lists a local tool or acts on a file is not used, whatever its version.
- Once a day the container updates the grok CLI with the CLI's own update command, checks the new version the same way, and switches to it only when it passes. X links are read with the version in use meanwhile. The X posts section of Settings shows the version in use, and a skipped newer version with the reason. The image sets `THREADSIFT_GROK_AUTO_UPDATE=true`, `false` turns the update off, and a Node target started outside the image leaves it off ([Fetchers](architecture/fetchers.md), The update).
- The Cloudflare build has no CLI and does not offer `grok-cli`, so there X needs the webhook.

### Reddit post or comment

- A pasted Reddit link becomes a Link-only Item with its title, author and subreddit from Reddit's oEmbed endpoint.
- On Save, the Extension reads the thread's `.json` with one signed-in request from the owner's tab, fetches the replies behind each `more` stub, and sends the thread's answer and the reply answers together in one request. A reply that still fails becomes a Context stub that says it was not saved ([Fetchers](architecture/fetchers.md), Reddit). When the `.json` request fails, or its answers cannot be assembled into one thread, the Extension falls back to the Reddit extractor of Defuddle on the rendered page.
- With "Fill saved Reddit items" turned on in the Extension's settings, opening a Link-only Reddit Item's thread in the browser saves it the same way, and never overwrites a saved thread. While such an Item is not processing, the Reader says its thread is not saved yet and how to fill it ([Extension and Threadsift bot](architecture/extension-and-threadsift-bot.md)).
- Without the Extension, the owner can send the text of the post's `.json` page from their own browser as `content` of `POST /api/items`. The paste box has no field for it.

### Archive fill (self-hosted builds)

- A Reddit link that arrives without Extension content (Paste, Import, Share) is filled from Arctic Shift when no Reddit account is connected or the account request fails. It is on by default, and a setting turns it off.
- When Arctic Shift returns replies at the top of the tree because their parent is missing, the Reader groups them under one Context stub per missing parent. Comments that Arctic marks as deleted later are dropped. The oEmbed title wins, and the Item names the archive and its date as its source.
- A rate limit, a timeout or an outage leaves the Item Link-only ([Fetchers](architecture/fetchers.md), Archive fill).
- The fill runs once, when the link is pasted and the Item holds no thread. A later Paste of the same link does not replace a saved thread. Extension content replaces an archive fill on the next Save.

### The owner's Reddit account (self-hosted builds)

- An optional setting connects the owner's own Reddit account ([Connect a Reddit account](guides/reddit-account.md)). When connected, it is the first server source for a Reddit link without Extension content, before Arctic Shift, and it fetches the thread the way the Extension does, so a thread is complete and current. The setting shows when the session stops working and asks the owner to connect again. Its status line says what happens meanwhile to a Reddit link without Extension content, by the archive fill choice: tried from the archive, or kept Link-only.
- Every Reddit link without Extension content uses the account: the paste box, Share, Import, a batch call, an agent token's add and the MCP `add` tool alike. An Import of many links is read one thread at a time, oldest first, and each waiting link shows the wait reason `reddit-limit` in the library.
- A 429 or an exhausted request window makes the job wait, and after three limited attempts the fetch uses the archive fill.
- Design: [Fetchers](architecture/fetchers.md), Reddit. Queue: [Jobs, leases and the schedule](architecture/jobs-leases-and-the-schedule.md).

### Share links

- `redd.it/<id>` becomes `/r/all/comments/<id>/` without a request.
- A `reddit.com/r/<community>/s/<code>` link needs one redirect, which Reddit answers without a login. The Item is the post or comment it leads to, with the share link kept as an alias. A redirect that does not end on a post or comment leaves a Link-only Item under the share link, and the Extension saves the thread at its canonical URL. A short link that redirects to a share link is followed through it the same way, and a Link-only Item then stays under the short link.

### Fetcher plug-ins (container only)

- A self-hoster adds their own fetcher, at their own risk, as an ES module named in `THREADSIFT_FETCHERS`, which the container loads at start. The Cloudflare build loads none.
- A Paste of a link the plug-in claims is read by the plug-in before the built-in route, and a page the Extension sent wins over it.
- A plug-in returns page text only, and is never asked about an X or GitHub link, a Reddit link that is not a post or comment, or a Reddit post or comment whose thread is saved. A plug-in that fails, answers an invalid or oversized page or times out ends the fetch `unreadable` or `timeout`.
- A plug-in runs inside the app with the Instance's environment and files and its own network access, with no sandbox ([Fetchers](architecture/fetchers.md), Plug-ins).

### GitHub repo

- The fetch uses the GitHub REST API, anonymous or with the owner's optional token. It gives the description, topics, stars, primary language, last push, license and README. The list row shows the stars, and the Reader shows the rest in a block above the README.
- The README is kept only when it is a Markdown file. A deep link such as an issue address reads its repository. A repository with no README is `ready` with its metadata and no text.
- A repository answer that is not 2xx (not found, unavailable for legal reasons, private) is no failure. The fetch writes nothing, the Item is `ready` with what it already held (a Link-only Item when it is new), and pasting the link again fetches it again.
- **Token.** Settings holds the token, sealed on the Instance, with a link to GitHub's token page ([GitHub token](guides/github-token.md)), a Verify button and a Remove button. The token goes only to `api.github.com`. A token GitHub rejects with 401, or that the Instance cannot open, ends the fetch with a note that tells the owner to replace or remove it in Settings; the Item keeps what it saved before.
- **Rate limit.** When GitHub answers that a limit is reached, the Item shows that it is waiting and when it retries, and the Instance sends no GitHub request for any GitHub link until then. After repeated limits the Item fails with `rate-limited` and keeps its saved content.

### Article, Other and the one hop

- **Article:** readable text extraction (Defuddle, Readability-style), or the page the Extension sent. A page is an Article when it is HTML and reads as 100 words or more; any other page is Other. A page over the reader's size cap is Other with no post text ([Fetchers](architecture/fetchers.md), Article). The Reader shows a long post text whole.
- **Other (YouTube and so on):** a Link-only Item with its title.
- **One hop:** when a Reddit post links to an article or a GitHub repository, the Digest also reads that page's text, so the Summary says what the post was about. The link is the post's target, otherwise the first link in the post text. The page is fetched when the Digest runs, used for that Digest only and not saved. A page that cannot be read leaves the Digest to the post and its comments.

### Media

- An Article's first 20 images are downloaded and stored with the Item; any other image stays a link to its source ([Data model outline](architecture/data-model-outline.md), Media). A Reddit page the Extension sent and an X post store their pictures the same way.
- Videos are kept as links in the text, and a YouTube or Vimeo embed becomes a link to its watch page.
- The Reader draws a stored picture of the open Item; every other image is a link. The List row and the Grid card show the first stored picture while Card images is On.

### Duplicates

- Each Item has one identity, its normalized URL, and pasting a known URL again refreshes that Item.
- A link loses its fragment, credentials, `www.` and tracking parameters, and keeps its scheme and the case of its path, so `http` and `https` make two Items.
- Three Sources have their own rule. An X post is its status id, so x.com and twitter.com, any handle and a media suffix give one Item, while a reply or a quote is another Item. A GitHub repository-root link ignores case and a `.git` suffix, and a deep link is its own Item. A Reddit post or comment id is lower-cased, and a comment is not its post.
- A short link and a Reddit share link are no identity. The Paste follows the redirects, the Item is the page it leads to, and the short link is kept as an alias. Pasting it again or pressing Try again refreshes that Item at its saved address even if the short link now points elsewhere or has died. An alias that ends at a share link names no post or comment, so the Paste resolves the short link again. The Item moves to the post or comment it leads to. When another Item already holds that post or comment, the alias moves to that Item. When the Item is no longer a failed Item under the share link, the Paste saves a new Item. A lookup of the short link in the Item list (`url`) finds the Item its alias names at that moment, before any new resolution.
- A short link that cannot be resolved is saved under the short link with the failure as its fetch result. A timeout or network error on a new Item ends `failed`, and any other failure leaves a `ready` Link-only Item. The next Paste resolves it again ([Fetchers](architecture/fetchers.md), URLs and short links).

## Comment filter

1. The script drops deleted or removed comments, comments by AutoModerator, empty replies and replies that are only "+1", "this", "same", "thanks", "thank you", "lol" or "lmao".
2. The agent keeps a remaining comment only when it adds a fact, a fix, a working link or command, first-hand experience, or a real counterargument. It drops jokes, agreement and repeats.
3. When a kept reply sits under a dropped parent, the parent stays as a one-line Context stub so the tree still reads correctly.
4. X replies follow the same rules.

- The agent makes step 2 in the same call that writes the Digest, over the eligible comments that fit the Digest's input budget ([AI tasks and Providers](architecture/ai-tasks-and-providers.md), Measured Digest input budget). A comment that does not fit is not Kept, and as a parent it shows as the same stub as a comment the agent dropped. The app drops any id the agent returns that it was not shown. A caller-sent Digest names its own Kept comments, and the agent makes no choice for it.
- Until a Digest covers the thread, the Reader shows every comment that passes step 1, as the thread, under a line that says the comments are not filtered by a Digest yet and why. The reasons are: a Digest is being made, the last Digest run failed, no Provider is saved (a Grok Bot chosen as the Provider counts as saved), a Provider is saved and the Item has no Digest yet, or the stored Digest was made from earlier text and does not cover the thread. When the reason is that no Provider is saved and the Item has no Digest, a link to the Settings page sits under the line.
- Once a Digest covers the thread, the Kept comments, and any comment that holds an attached Highlight, show and the line goes.
- A thread whose Digest kept none says that none of the comments added anything.
- A thread whose stored comments all fail step 1 and that no Digest covers shows the comments heading, one line that says its comments were removed, written by bots or empty, and no thread.
- A thread with no stored comment shows no comment section.
- The list row counts the comments the Reader shows ("Showing N of M" before a Digest covers the thread, "Kept N of M" after, "Saved comment" for a saved Reddit comment), and a Highlight can be kept on any comment the Reader shows. Search and the Item notes of the Export hold the Kept comments only.

## Agent output per Item

The agent returns one JSON record, the Digest, stored apart from the fetched content so it can be regenerated without fetching the Item's own link again (a Reddit post's linked page is read again for the Digest):

- a clean title
- one Topic from a Topic list that the agent keeps and grows itself
- up to 3 Tags; before creating a Tag, the agent checks the existing ones, so near-duplicates do not appear
- a 2-line Summary covering the post and what the Kept comments concluded
- Key points
- the ids of the Kept comments

Rules for the Digest:

- **Identity of Topics and Tags.** Case, width, composition and spacing never make a new Topic or Tag, and the first spelling stays visible ([Data model outline](architecture/data-model-outline.md), Catalog keys). Semantic near-duplicates such as "ML" and "Machine learning" are the model's job from the supplied lists and, for the pairs the plain checks find, the Proposals' job.
- **The list.** It uses the stored Digest's clean title and Topic and keeps the fetched title separately. Summary, Key points and Tags wait for the Reader. The last stored Digest stays visible during refresh or regeneration.
- **A failed run.** It shows "Digest failed" only when there is no stored Digest. A kept Digest shows "Digest update failed". Both offer Try again, in the list row and in the Reader beside the note, and a failed Item's failure note in the Reader carries it too. A failed Digest leaves fetched content readable.
- **Try again.** It queues a Digest over stored text without a new fetch, and does nothing while a Digest is already open or the Item is failed. An Item with no Digest source pastes the link again instead. The owner session and agent tokens may call it ([Jobs, leases and the schedule](architecture/jobs-leases-and-the-schedule.md), Fetched Items and Digests).
- **A caller-sent Digest.** `POST /api/items` accepts one from the owner session or an agent token, and an invalid one returns 400 before storage. It sets its own Tags, publishes without a Provider call and drops with a fetch that finds no text. Try again always uses the configured Provider ([Jobs, leases and the schedule](architecture/jobs-leases-and-the-schedule.md), Caller-sent Digests).

## The library page and the Reader

- **Paste card.** A Paste shows a card under the paste box that says what is happening: reading the link, added, already saved and refreshed, already saved with the saved copy unchanged (a refresh whose read failed or that Threadsift does not fetch, a link whose first read has not finished, or Try again on a failed Digest), or a failure note with Try again. The cards of a saved Item have Open and Dismiss. They and the failure cards close themselves after 6 seconds, held while the pointer or focus is inside. Try again on a row pastes the link again for an Item with no stored text, and queues a Digest over the stored text for one with a failed Digest.
- **Search and filters.** The list head says how many Items match. When none do, one button resets the search and the filters. It reads Clear search, Clear filters or Clear search and filters, by which of them is on; the filter pane's own Clear filters link, which keeps the search, is hidden while no Item matches. The API behind the counts is under Interfaces.
- **Read state.** An Item is unread until the owner marks it read, from the Reader bar, the mark on its row or the `m` key. The agent, a refresh and a Digest never change it. In the List Layout at 760px wide and over, the first load opens the first unread Item once and leaves it unread; an Item named in the address wins, and under 760px nothing opens.
- **List row and Grid card.** Each opens with the kept bar, a 3px accent line as wide as the ratio the kept strip's count reads (Kept 5 of 100 draws 5%) once a Digest covers the thread, and the kept strip: the Read state mark, the Source (left out for a Reddit Item whose community is known, because the community names it), the place and the comment count. The title follows, then the author (left out when the strip names it: an X post whose link names its author, or a GitHub repository), the saved time, the Topic and a repository's stars. A List row shows the first stored picture as a 40px thumbnail, or, with Card images On and no stored picture, a tile with the Topic's tint and the Source's mark and no text. A Grid card shows the picture above the title and draws nothing in its place.
- **What the Reader shows,** top to bottom:
  - the header: Source, place, author, posted and saved times, title, and for a Reddit link post the address it points at as a link that opens in a new tab, shortened by the width of the column and never by cutting the address, with no "no post text" line beside it. An X Item with an author shows the author's handle and no place, so the handle appears once;
  - the Topic, Tags, Summary and Key points;
  - for a GitHub repository, its block of description, stars, language, license, last push and topics;
  - the post text, under a heading that names what it holds: "Original post" for a Reddit or X post, "Saved comment" for a saved Reddit comment, "README" for a repository, "Article" for an article and "Page text" for another link;
  - the comments, as the Comment filter describes;
  - the Related Items, with no heading when there are none, each with its Source, title and reason and opening that Item;
  - the Highlights list;
  - the Note box.
- **Markdown** shows without raw HTML, and only `http`, `https`, `mailto` and in-page links work.
- A paragraph with an extreme number of Markdown parts shows its marks as plain characters, in the Reader and in a Highlight's quote alike ([Decisions and evidence](architecture/decisions-and-evidence.md), Parse time of a page).
- **A failed later read.** When a later read of the Item fails, the Reader keeps the body it has and shows the failure. It offers Try again for a failed Item or one with a retry action. An X refresh that ends `unreadable` keeps the saved body and shows the fetch note without a button beside it.
- **The bar** holds the Comments button, Mark read or unread, Open on the Item's Source and Delete, and it drops the key hint and then the button labels until it fits.
- **Comments.** Replies nest under their parent, drawn in the Comment style the owner chose, and the Item author's comments carry an OP badge.
- A comment taller than 8 lines folds to its first 6 lines, and keyboard focus that lands inside a fold opens it.
- A Context stub marks a dropped parent or a parent missing from an X thread or a Reddit archive fill, and a stub that says "Further replies weren’t saved." marks replies behind a `more` stub.
- The Comments button jumps to the section and shortens to "N of M" and then to the count as the bar narrows.
- **Highlights.** The owner selects one passage inside the post text or inside one comment the Reader shows, and a popover offers Keep. A selection across two bodies, or one that touches a control or a Context stub, offers nothing. When a selection does not match the stored text of that version, the Reader keeps the Item as it is and asks the owner to select the passage again or a smaller part.
- A kept passage is marked in place, in List, Grid Page, Grid Sheet and on a phone. Pressing a mark, or Enter on a focused mark (choosing a quote in the Highlights list focuses its mark), opens a popover with Remove. Where several Highlights overlap, the popover lists each Highlight under the pressed mark, in the order of the Highlights list. A row shows the quote underlined between the last 16 code points of the text stored before it and the text stored after it, up to 3 lines, with its own Remove; a quote over 40 code points shows its first 20 and last 20. The list scrolls when the rows do not fit the room the popover has. A Remove takes away that Highlight only and closes the popover. When the removal ends, focus moves to a mark that still carries one of the pressed mark's Highlights, or to the Reader title when none is left, unless the owner moved focus to another control while the removal ran. A popover opened by Enter puts focus on its first Remove. Escape closes the popover without closing the Reader and returns focus to the mark.
- The Highlights list at the end of the Reader holds every Highlight of the Item, and choosing one scrolls to its mark and opens the fold around it. A Highlight whose passage Threadsift can no longer place, because it is gone or appears more than once, shows its quote with the note "The item’s text changed. This passage is missing or appears more than once." Each entry has its own Remove. When that removal ends, focus moves to the Remove of the next entry, or of the previous one when it was the last, or to the Reader title when none is left, unless the owner moved focus to another control while the removal ran; a failed removal leaves focus where it is.
- **Note.** The Note box follows the Highlights list (Highlights, Notes and the Highlights page).
- **Reading place.** Each browser tab remembers where the owner stopped in each Item, for the last 100 Items it saved a place in, and returns there on reopen, as long as the text at that place is still in the Item.
- **Delete.** Delete asks "Delete this item?" with Cancel and Delete item. While the request runs both buttons and Escape do nothing, and after 20 seconds without an answer the dialog reports the failure and offers both again.

## Highlights, Notes and the Highlights page

- In the Reader, the owner selects text in the post text or a comment the Reader shows to keep it as a Highlight, and writes one free-text Note per Item. Highlights stay marked in the Reader.
- When a refresh changes the text so a Highlight no longer matches, or matches two places equally well, the Highlight is kept and marked as no longer found in the Item.
- Only the owner's session keeps or removes a Highlight and writes a Note. An agent token reads both with the Item and never changes them. A refresh, a new Digest or an agent never rewrites a Highlight's quote or a Note.
- A Note is plain text of up to 10,000 code points, saved with the Save button or Ctrl or Cmd with Enter.
- When the Note changed elsewhere since the owner loaded it, the save is refused and the Reader shows the newer Note beside the owner's text, with a choice to keep the owner's text or take the newer one. Text the owner typed and did not save stays in that browser for the Item.
- A second page lists every Highlight and every Item Note, newest first, each with its Item's Source, title and date and a link back to that place in the Reader. Search and the Source, Topic and Tag filters work there too.
- The page opens from the Highlights link, the first of the page links in the settings panel, and at `/highlights`. It shows 50 entries at a time with Load more. The counts beside the filters come with the first 50 entries and stay as they are while Load more adds entries. Load more pressed with the keyboard moves focus to the first new entry once it arrives, unless the owner moved focus to another control while it loaded; the Index, the Log and the Proposals page do the same.
- A Highlight is dated when it was kept and a Note when it was last saved. A Note the owner cleared has no entry.
- Search there matches only the entry's own quote or Note text, not the Item's title, Summary or Tags.

## Export, backup and restore

- The owner downloads the library as a zip with one Markdown file per Item: front matter with Source, URL, author, dates, Topic, Tags, Read state and a title alias when present, then the Summary, Key points, Highlights, Note, post text and Kept comments (not the comments the Reader shows before a Digest covers the thread), with the Item's stored images beside it.
- One export exists at a time, and a ready export is kept 24 hours, then the sweep removes it.
- An export cannot start while a restore holds the library, so no zip holds a half-restored library. A ready export stays, and Start export says why it did not start.
- The export zip also holds every library record (everything except secrets, login data, work in flight, the owner's choice of Provider and of X reader, and the search tables, which are derived from the records).
- A new Instance can restore from the zip after its setup code is entered, so the same zip backs up both install targets and moves a library between them ([Export, backup and restore](architecture/export-backup-and-restore.md)). The restore brings back the records, the stored images, the search rebuild and the Highlight anchors, and it has cancel, resume and a setup page step. It accepts only a zip made at the database migration the Instance runs, so a zip made before an update that brings a migration is refused, and the owner makes a new Export after such an update.
- A cancel deletes the rows of the restored tables ([Export, backup and restore](architecture/export-backup-and-restore.md), Cancel and resume). A second restore is refused while one waits for its upload, runs, or has failed after giving up and still holds the library, so the owner resumes or cancels that one first, and the Restore screen offers no file picker meanwhile.
- While a restore holds the library, these are refused and save nothing: a Paste, keeping a Highlight, saving a Note, an Accept on the Proposals page (except removing a lost Highlight), and asking for a Digest or a Topic overview again. A Provider Verify, saving a Provider and saving the Reddit setting are refused too. So no record of the owner's takes the place of one the zip brings back. Reading, deleting, setting the Read state and Reject work meanwhile.

## The library wiki

The agent builds the synthesis once, when an Item arrives, and keeps it current, instead of searching raw content at question time ([Decisions and evidence](architecture/decisions-and-evidence.md), The library wiki). Each Item's Digest is its summary page; the four parts below add the rest. [The library wiki](wiki.md) and [Proposals](proposals.md) own the mechanics.

### Topic pages

- Each Topic has a page with an overview of up to 5 lines that the agent writes, and the list of its Items with their Summary lines.
- While a Provider is saved, each new Digest opens one small agent call that revises the overview of that Item's Topic from the overview and the new Digest, or leaves it unchanged. The overview names the Items it was built from, so it never stands in for them.
- The page is reached from the Topic in the Reader and in the filters pane. Its address holds the Topic's catalog key, so `İstanbul` and `istanbul` are one page.
- The address of a Topic that an accepted merge removed shows the Topic it was merged into, and Try again acts on the survivor.
- A failed overview shows on the page with Try again and the list of Items still shows. With no Provider saved and no stored overview, the page shows a note and the Items.
- An Item whose stored Digest is not valid JSON, or holds no Summary text, still appears in the list of its Topic page, with an empty Summary line.
- Deleting an Item removes it from the list at once, and the overview runs drop it from the overview.
- Below the overview the page lists the pairs of its Items whose disagreement the owner accepted, under "Known disagreements", each with the agent's reason and a link to each Item, newest first, at most 20, and only while both Items carry the Digests the pair was accepted on.

### Related Items

- The Reader shows up to 5 Related Items, each with a one-line reason. The app finds candidates with the full-text search, and the agent picks the real ones ([The library wiki](wiki.md), Related Items).
- When an Item's Digest lands and a Provider is saved, one agent call picks from the other Items whose Digest title, Summary and Tags best match, and the new set replaces the old one as a whole. The post text, comments, Highlights and Notes of an Item never go to the Provider.
- A pick belongs to the Item that made it, and older Items get no pick. Deleting either Item removes the pair. A failed pick keeps the earlier set and shows no failure note.

### Index and Log

- The Index lists every Topic with its Item count and its overview line. It is reached from the Index link in the settings panel, between the Import link and the Log link, and lives at `/topics`.
- A row appears once for each Topic, ascending by its catalog key, 50 to a page with Load more, and opens the Topic page. A Topic whose Items were all deleted stays in the list with 0. The overview line is the first line of the stored overview.
- The Log lists committed library changes and files the Vault mirror skipped, newest first, and lives at `/log`, reached from a link in the settings panel beside the Index. It is 50 lines to a page with Load more.
- It records the actions listed under Log entry in [GLOSSARY](../GLOSSARY.md). A result that is discarded, stale or rolled back adds nothing.
- A line reads `[YYYY-MM-DD HH:MM] ingest | <title> | topic: X | tags: a, b`, starting with the browser's local date and time, and a `merge` line gives the number of Items that carried the merged-away Tag or Topic. A line keeps the title, Topic and Tag names as they were when it was written; the title opens the Item and the Topic name opens its Topic page.
- A failed Digest, overview or pick, the Verify task and an Item's deletion are not entries. Deleting an Item removes its `ingest`, `digest` and `related` entries and keeps the `topic` and `overview` ones.
- The Log starts empty with the Instance, and an empty Log says the date it began.
- The Index and the Log need no agent call.

### Proposals

All five kinds are built, each with its weekly check, Reject and Accept. [Proposals](proposals.md) owns how each kind works, with its limits, Accept, Reject and Pins.

- The page lists changes the agent suggests and never makes on its own: merge two Tags, merge two Topics, remove a Highlight no longer found, cover the Items a Topic's overview leaves out, and settle two Items of one Topic that disagree.
- Plain checks find the candidates, and the agent judges only those.
- The owner accepts or rejects each one, and the app applies the accepted ones. Reject is final for the pair or row it names. An accepted Tag merge, Topic merge or disagreement is kept as a Pin, so the next regeneration cannot undo it.
- Once a week, while a Provider is saved and at least one Item has a Digest, the app runs the checks for Tags, Topics and Items. A failed check shows nothing on the page.
- The line under the list head, shown above the empty state too, holds the rule every kind shares: Reject is final. Each row says what its own Accept does, above its buttons.
- **Tag and Topic merges:** Accept merges the first into the second with no confirmation and cannot be undone in this release. The row shows both Item counts. A Topic merge also deletes the merged-away Topic, and its address opens the survivor.
- **Lost Highlights:** Accept removes the Highlight and cannot be undone. Reject keeps it.
- **Overview gaps:** Accept starts the same overview run as Try again on the Topic page.
- **Disagreements:** Accept keeps the pair as a Pin, lists it under "Known disagreements" and changes neither Item. A new Digest of either Item ends the Pin.

## AI providers

- The owner picks one Provider in the AI settings, and the screen shows only the fields that Provider needs.
- "Verify" runs one small real Digest, so a model that cannot return the Digest's JSON fails at setup, not on the 200th Item. It uses the saved settings and shows a Digest or a refusal with a recovery action. It adds no Item, Topic or Tag.
- The Settings page offers OpenAI-compatible URL, OpenRouter, Anthropic, OpenAI and xAI, Workers AI on Cloudflare, and on the container Claude Code in this container and Codex in this container (both use the CLI sign-in). It also offers Grok Bot on both targets. Grok Bot takes no field: Save answers 400 until the Grok Bot section holds an address and a key this Instance can open ([HTTP interfaces](architecture/http-interfaces.md), Settings routes).
- The Grok CLI is not offered as a Provider, though the container uses it to fetch X posts, because it gives no proof of its tools before a model request ([Fetchers](architecture/fetchers.md), X).
- Save keeps the API key sealed on the Instance; the screen only reports whether a key is set and whether this Instance can still open it. When it cannot, because `THREADSIFT_SECRET_KEY` changed or was lost, the screen says so and offers both ways back ([Keep the secret key](guides/self-hosting.md#keep-the-secret-key)).
- Saving a Provider opens Digest jobs for older Items with a Digest source, no Item failure marker, no stored Digest and no open Digest job. On the container the job loop wakes when the batch that opens those Digest jobs commits. OpenRouter Connect opens them only after the saved key becomes active. Saving the Provider retries a failed Digest only when its last Digest task was refused for a wrong key. Try again can retry other failed Digests. Each eligible Item with usable text can incur a model call.

| Provider | Self-hosted container | Cloudflare deploy | Hosted product (later) |
|---|---|---|---|
| OpenRouter, by key or the Connect button | yes | yes | yes |
| Anthropic, OpenAI or xAI API key | yes | yes | yes |
| Any OpenAI-compatible URL (Ollama and others) | yes | yes, at a public HTTPS address | no |
| Workers AI | no | yes | maybe |
| Claude Code or Codex signed in in this container | yes, when the app finds the CLI | no | no |
| Grok Bot (the owner's plan runs every AI task: Digests, Topic overviews, Related Items, Proposals) | yes | yes | yes |
| Sign in with ChatGPT | later | later | only after OpenAI approves it |

- **CLIs:** the app never reads or stores a CLI's login. The owner signs in with the CLI's own command, or starts the container with a token from `claude setup-token`, and the AI settings show the sign-in command while the CLI is signed out. Save and Verify stay off until it is signed in. The CLI runs with its tools turned off in an empty folder and a minimal environment, because every Digest call reads other people's posts, and at most 2 CLI tasks run at once on an Instance ([AI tasks and Providers](architecture/ai-tasks-and-providers.md), CLI executors). The Import screen suggests an API key when a plan Provider is picked.
- **OpenRouter Connect:** the Connect button sends the owner to OpenRouter to approve a key and saves the returned key sealed, like a typed key. Once the key works, Connect opens Digests for older Items. It needs the Instance's public address (`THREADSIFT_PUBLIC_ORIGIN`); without it the button gives way to a note ([AI tasks and Providers](architecture/ai-tasks-and-providers.md), OpenRouter Connect).
- **Model field:** a Provider that needs a Model refuses a Model of only spaces, and the error stays until the owner edits the Model or Effort or picks another Provider or CLI choice.
- **Default model:** Claude Code and Codex offer Recommended, CLI defaults and Custom for Verify and every AI task. Only Custom shows Model and Effort, and it requires at least one of them. A model alone uses its CLI default effort, and an effort alone uses the recommended model ([Choose a model and effort](guides/providers.md#choose-a-model-and-effort)). The owner's picks and the Digest comparison are in [Decisions and evidence](architecture/decisions-and-evidence.md#ai-providers).

## Grok Bot

```text
A. The owner drops a link in a Grok Bot chat
   owner      sends the link to the Grok Bot
   Grok Bot   calls POST /api/items on Threadsift, through MCP or an agent token

B. Scheduled X bookmark sync
   Grok Bot   every 3 hours reads the X bookmark list from the top
   Grok Bot   sends the post ids to Threadsift in batches
   Threadsift asks the bot for each new thread (flow C)

C. Intake webhook
   owner      pastes an X link into Threadsift
   Threadsift posts the link to the routine's webhook URL with its key, and the Grok Bot wakes
   Grok Bot   fetches the post, thread and replies (X connector) and writes the Digest
   Grok Bot   calls POST /api/ai-tasks/{id}/intake with the content, the Digest and the task's credential
   (POST /api/items takes no task id, so a callback is never an ordinary save)
```

- The first release works with Grok Bot three ways: saving a link dropped in a Grok Bot chat, a scheduled X bookmark sync routine, and an intake webhook through which Threadsift hands X links to the owner's bot.
- **Setup:** the owner connects Threadsift to Grok Bot once. On the bot's side, they give the bot Threadsift's URL and a token made in Agent tokens (only the bot keeps that token). For C, they paste the webhook routine's URL and key into the Grok Bot section of Settings, which has a Test button that sends a harmless ping.
- The section holds the address and the key and no token. The key stays on the server, sealed, and no screen or route shows it again. Save and Remove contact no one, and Test sends one ping with no library text and costs the bot one run. A new address needs a new key. The address must be a public `https` address.
- **The Threadsift bot:** a public Grok Bot template with one skill that saves links dropped in chat, searches the library, runs the X bookmark sync and answers Threadsift's webhook. Its [setup guide](../bot/setup.md) walks the user through adding their Threadsift URL and token. The bot's Digest reuses the library's Topic names and, when one fits, a Tag it already has, and otherwise picks its Tags itself.
- **AI tasks:** when Grok Bot is the Provider, Threadsift sends it every AI task (a Digest, a Topic overview, a Related Items pick, the weekly Proposals) through the same webhook, and the bot posts the result back. When the text, the Digests, the Tags, the Topics or the Topic page a sent task read change before the bot answers, Threadsift drops that task and sends one on the current input, instead of waiting up to the task's hour for an answer about the old input. Without Grok Bot, every model task runs on the Provider the owner picked, and the X reader choice decides who reads a fresh X link ([AI tasks and Providers](architecture/ai-tasks-and-providers.md), Grok Bot).
- **Speed:** an X link through the webhook may take longer than a direct fetch, because the bot has to wake and run. The Item shows "Waiting for Grok Bot…" until the bot answers.

## Obsidian vault mirror

- The owner opens Obsidian from Settings, enters a GitHub repository, an existing branch and a fine-grained token, and uses Verify to check that the branch is reachable. Verify writes no file and does not test write permission, and with the token field empty it uses the saved token. Save seals the token under the Instance's secret key and never returns it to a screen or route. Agent tokens cannot use these settings routes.
- On the container, the owner can choose Folder in Obsidian and enter the path from the [vault mount instructions](guides/self-hosting.md#mount-an-obsidian-vault). Verify reports whether the mounted folder is writable and distinguishes a missing folder from a write refusal. The mirror writes only within the `Threadsift` folder of the vault and removes only files it wrote. An owner file at a generated path pauses that subject, and the Log records it once. Cloudflare offers GitHub.
- Saving a destination queues every Item and Topic page, the Index and the Log, and library changes queue the notes they affect. Switching destinations mirrors the whole library to the new destination and leaves the old files in place.
- Each Item note keeps an Item-id path with the current title as an alias. Its front matter holds Source, URL, author, dates, Topic, Tags and Read state. The body holds wikilinks to the Topic page and Related Items, plus the Summary, Key points, Highlights, Note, post text and Kept comments. Stored images sit beside the note. A refresh adds new images and removes images the Item no longer holds.
- A Topic page note keeps a Topic-id path through a rename and holds the overview, Known disagreements and wikilinks to its Items. The Index links to every Topic page and shows its Item count and overview line. The Log links to notes by UTC month, newest month first. Each month lists its entries newest first.
- A Topic merge removes the old Topic page note and rewrites the affected Item notes and their wikilinks to the surviving Topic. A Tag merge rewrites the affected Item notes. Accepting a lost Highlight, an overview gap or a disagreement updates the notes when the change is stored.
- A file above GitHub's 100 MiB limit is omitted and recorded in the Log.
- One writer drains the queue, with the same file paths and Markdown for either destination ([Vault mirror](architecture/vault-mirror.md) holds the writer, retry and Restore rules).
- The mirror is one-way: the owner reads in Obsidian and edits Highlights and Notes in Threadsift. Vault repositories on other Git hosts are not in the first release.

## Access

- **Owner password.** Signed in, the owner changes the password in Settings with the current one. Every other session ends, the owner's own session gets a new id, and agent tokens keep working.
- **A lost password.** An owner who lost the password sets `PASSWORD_RESET_CODE` on the server (a container environment variable read at start, or a Worker secret), opens "Reset password" on the sign-in screen and enters the code with a new password. The code is an operator credential of at least 32 characters, works once, ends every session and keeps the agent tokens. With no code on the server nobody can reset anything ([Access](architecture/access-owner-login-agent-tokens-mcp.md)).
- **A wrong secret.** A wrong setup code, password, current password or reset code answers 403 with its own `code`: `wrong-setup-code`, `wrong-password`, `wrong-current-password` or `wrong-reset-code`.
- **Agent access.** Besides the HTTP API, the app serves an MCP endpoint whose tools search Items, read one Item with its Digest, Highlights and Note, and add a link. Each tool runs the same code as the matching HTTP call.

### Token scopes

Each agent token carries scopes that limit what it calls:

| Scope | What it allows |
|---|---|
| `read` | Search and read Items, Topic pages, the Index, the Log, the Proposals, the Highlights page and stored images, and list the token's own scopes (`GET /api/scopes`). |
| `add` | A Paste and a batch of links. |
| `digest` | Queue a Digest or a Topic page overview again, and send a Digest with a Paste. |
| `delete` | Delete an Item. |
| `reddit` | Connect and disconnect the Reddit account through `/api/reddit-account` (reading it there needs `read`). |

- The owner picks the scopes when creating the token, and a new token starts with `read` and `add`. Each scope's checkbox has its own line under the group that says what the scope allows. A call outside the token's scopes answers 403.

### Token budget

Each agent token has a daily budget of new Items. Only a new Item counts, because each one costs the Provider one Digest call; a link the library already holds, a refused host, a read and a search do not.

- The day is a fixed UTC day. A spent token gets 429 with a `Retry-After` of the seconds until 00:00 UTC, and the MCP tool `add` returns an error result with `code: budget-spent`.
- A new token starts at 200 Items a day. The owner can set another whole number above 0, or no budget, when making the token and afterwards in Settings. A token with no budget set is unlimited.
- A batch that would cross the budget is refused whole and saves nothing.
- The owner's session has no budget. Settings shows each token's use and marks a spent one.

## Interfaces

`GET /api/openapi.json` describes the REST routes with their bodies and status codes. [HTTP interfaces](architecture/http-interfaces.md) holds the rules around them, and its MCP and Web Share Target sections cover `/mcp` and `/share`, which the document leaves out.

- The paste box, the Extension and agents use the same HTTP API, and every route answers a refusal the same way for every caller ([HTTP interfaces](architecture/http-interfaces.md)).
- An id in a path and each number in a cursor is a whole number in decimal digits from 1 to 9007199254740991. Any other text in an ordinary parameter answers 400, so one record has one address; the Grok Bot task routes and the image route answer differently ([HTTP interfaces](architecture/http-interfaces.md), Canonical numbers).
- Every call needs the owner's session or an agent token, except the session check, the first-run setup, the sign-in, the password reset and the three Grok Bot task routes, which take the task's own callback credential.
- The owner's session alone calls `/api/settings`, `/api/tokens`, `/api/password`, the sign-out, a Read state change, a Highlight and a Note.
- The MCP endpoint `/mcp` offers `search`, `read` and `add` to an agent token, and cannot write a Highlight, a Note or a Read state.
- The Web Share Target is a form `POST /share` that needs the owner's session.
- The Export and Restore routes answer 403 to an agent token, because a leaked token must not copy the library in one request.

## Install and deployment

| | Container (Podman or Docker) | Cloudflare (Worker) |
|---|---|---|
| Storage | SQLite and a folder for images | D1 and R2 |
| AI Providers | every row of AI providers marked for the container | API keys, OpenRouter, an OpenAI-compatible URL at a public HTTPS address, Workers AI, Grok Bot |
| X fetching | Grok Bot webhook, or the grok CLI installed by the owner, as the owner chooses in Settings | Grok Bot webhook; without it, X links are Link-only Items |
| Reddit | Extension, `.json` paste, archive fill, the owner's Reddit account, Link-only Items, own adapter if added | Extension, `.json` paste, archive fill, the owner's Reddit account, Link-only Items |
| Vault mirror | Item notes and the library wiki in a GitHub repository or mounted folder | Item notes and the library wiki in a GitHub repository |
| Deploy button | none needed | Deploys `release` to the owner's Cloudflare account and creates a GitHub copy in the owner's account. The copy is private when the owner selects **Create private Git repository**. |
| Cost to the self-hoster | their own server | Cloudflare's $5 a month Workers Paid plan; the reason is in [Cloudflare deploy button](architecture/cloudflare-deploy-button.md) |

- A self-hoster can deploy a Cloudflare Instance with the README button or run `pnpm run deploy` to deploy or update an Instance while keeping its library. The button's [live run on 2026-11-19](architecture/cloudflare-deploy-button.md#live-run-on-2026-11-19) verified owner setup, a working Reader, and a later release that kept the library.
- A standalone repository copied from the `release` branch checks for updates weekly or on demand once the owner [sets up the workflow and its token](guides/self-hosting.md#update-a-cloudflare-copy). A failed update opens an issue in the copy.
- The container image is published as `ghcr.io/kyanitehq/threadsift`. Each release tag publishes its version, such as `1.4.2`; a stable release also moves `1.4`, `1` and `latest`, the `release` branch and the GitHub Release's Latest mark, each unless a newer stable tag exists in its range, and a release candidate moves none of them ([CI, releases and rollback](architecture/ci-releases-and-rollback.md), Releases).
- Each release has one version, in Semantic Versioning from `v1.0.0`, which the release command writes into the app, the image and the Extension, and the gate fails when the image or the Extension carries another version than the app; the bot keeps its own `bot-v` numbering until its update follows the Instance. A patch release never carries a migration, and the root changelog holds each release's notes ([CI, releases and rollback](architecture/ci-releases-and-rollback.md#versions-and-the-release-pull-request)).
- Each release attaches the Extension's Chrome zip, Firefox zip and source archive to its GitHub Release. A daily check fails, which mails the owner, when a store rejects, takes down or warns the Extension, or still shows an older version 21 days after a stable release ([CI, releases and rollback](architecture/ci-releases-and-rollback.md#store-status)).
- **README.** It shows a Paste turning into a Digest and screenshots of the Reader, the Highlights page and a Topic page in three Styles. The media comes from an Instance with a library of public links. The README lists the container and Cloudflare install routes side by side.

## Hosted product (after the first release)

- AI comes from API keys, OpenRouter's Connect, Workers AI or the user's Grok Bot. There is no Claude plan login. Sign in with ChatGPT and an xAI plan login come only after the vendor says they are allowed.
- Reddit Items are Link-only, plus what the user's Extension sends, with no archive fill and no account option, until Reddit gives written consent for a paid service.
- X Items are Link-only Items. X has published no answer on whether a Digest must go when its post is deleted, whether a shown post needs a lookup first, or how many end users pay-per-use allows ([Decisions and evidence](architecture/decisions-and-evidence.md#x-developer-terms)).
- The price is not decided ([Decisions and evidence](architecture/decisions-and-evidence.md), The hosted product).

## Later (not in the first release)

- The hosted product (above).
- A desktop app and mobile apps.
- A listing in Grok Bot's plugin catalog, once the way a third party gets listed is known. It needs OAuth on the MCP endpoint.
- Imports from browser bookmark files and from other apps (Raindrop, Pocket, Karakeep).
- Two-way Obsidian sync.
- Digest or resurfacing: the day's new saves, and one old save worth rereading.
