# Threadsift: v1 spec

This file states what v1 does. Each bullet matches the code, and a change to the code adds, changes or deletes the bullets it makes untrue, in the same pull request. A feature the code does not build yet says "Not built". The status table of `docs/architecture.md` lists the parts that are not fully built.

Technical detail lives in `docs/architecture/`, indexed by `docs/architecture.md`. `docs/architecture/decisions-and-evidence.md` holds the reasons behind the product decisions and the measurements the bullets rely on. `docs/architecture/http-interfaces.md` holds the route rules.

## Goal

Threadsift is a reading library. A person pastes a link to something they saved (a Reddit post or comment, an X post, a GitHub repo, an article). The app fetches it, keeps only the useful parts, lets an agent tag and summarize it, and shows everything on one page that can be searched and filtered. As Items arrive, the agent also keeps a small wiki of the library: Topic pages, Related Items, an Index and a Log.

The project has two aims:

1. A free, open-source app that anyone can self-host, with a container or a Cloudflare deploy button.
2. Later, the same app as the owner's own hosted product, with its own pricing.

The owner is also a user, with many saved bookmarks to bring in and read.

## Release order

| Release | What it is |
|---|---|
| First release | The self-hosted open-source app, one owner per Instance. It ships as a container image (Podman or Docker) and as a Cloudflare deploy button on the same day, and the browser smoke spec runs on both. Not built: the Cloudflare deploy button. |
| After it | The hosted product, once its pricing and the AI and content terms are settled. |
| Later passes | A desktop app and mobile apps. The web app comes first. |

## Product

- **Name and licence.** The product is Threadsift. The licence is AGPL-3.0-only. The required CLA check verifies that outside contributors have signed the contributor licence agreement.
- **App type.** A public web app with an owner login. Each connected agent gets its own token. The app needs a public HTTPS address so that Grok Bot can reach it.
- **Intake.** One link at a time through the paste box, the Web Share Target, the Extension, the HTTP API, MCP or Grok Bot, plus an Import of many links at once.
- **Import.** The Import screen at `/import`, opened from the Import link in the settings panel beside Highlights, takes a pasted list or a `.csv` or `.txt` file, shows its progress and resumes a list it imported before (`docs/architecture/web-app.md`, The Import screen). A Reddit `saved_posts.csv` goes in through the list import as Link-only Items.
- **X bookmarks.** The Threadsift bot sends the post ids of the owner's X bookmarks, in a sync and in a one-time import of all bookmarks, and the Instance fetches each thread through the bot.
- The sync routine starts paused (`bot/setup.md`), runs every 3 hours once the owner turns it on, and reads at most 20 pages of 100 ids (`bot/skills/threadsift/SKILL.md`), so an older bookmark needs the one-time import.
- The bot reads the bookmark list only, so bookmark folders are not imported.
- **Tags.** The UI has no Tag editing. The Provider's Digest checks the existing Tags and Topics before it creates one, so near-duplicates do not appear. A caller-sent Digest sets its own Tags, and a Digest the Threadsift bot writes does not see the Tag list. Proposals keep the lists clean over time.
- **Comments.** A high-pass filter keeps a comment only when it adds something, with no fixed count.
- **Library wiki.** The agent keeps Topic pages, Related Items, an Index, a Log and weekly Proposals, so the library compounds as it grows (The library wiki).
- **AI provider.** The owner picks one Provider in settings (AI providers).
- **Threadsift bot.** A public Grok Bot template that any Grok Bot user can install. Its skill files live in this repository.
- **Reddit.** The server never fetches Reddit thread content from reddit.com unless the owner connects their own Reddit account.
- Its other requests there are oEmbed for a link's title, author and subreddit and the one redirect that resolves a Reddit share link.
- Thread content comes from the owner's own signed-in tab, where the Extension requests the thread's `.json` once on Save, or when the owner opens a Link-only Reddit Item's thread with "Fill saved Reddit Items" on.
- In the self-hosted builds it also comes from the Arctic Shift archive, on by default with a setting that turns it off.
- Either self-hosted build can connect the owner's own Reddit account, which is then the first server source, before Arctic Shift.
- There is no background fill (Fetchers).
- **Obsidian.** The GitHub Vault mirror keeps the library wiki and Item notes current on both install targets (Obsidian vault mirror).
- **Tech stack.** `docs/architecture/the-stack-at-a-glance.md` lists it: TypeScript on Node 26 and Cloudflare Workers, Hono, SQLite with FTS5 through Drizzle (D1 on Cloudflare), a React single-page app, the AI SDK for HTTP Providers. `docs/architecture.md` holds every choice, its trade-off and its evidence.
- **Delete.** The owner can delete an Item from the Reader, after a confirmation. Deleting removes the Item, its Digest, its stored images, its Highlights, its Note and the Log entries that name it. Agents use `DELETE /api/items/:id`.
- **Search.** Full-text search covers title, post text, Kept comments (not the comments the Reader shows before a Digest covers the thread), the Digest's clean title, Summary, Tags, a GitHub repository's description and topics, Highlights and Notes.
- **Who changes what.** The owner changes only Read state, Highlights and Notes, accepts or rejects Proposals, and can delete an Item. The agent sets everything else.

## The Extension

- A browser extension for desktop Chrome and Firefox saves the page in the owner's own tab in one click. Firefox for Android is not supported.
- Any http or https page works except a page on x.com, twitter.com or github.com, a page on a link shortener's own address (`bit.ly`, `t.co` and the other short-link hosts) and a Reddit page that is not a post or comment. The server refuses those, and the Extension says it cannot save them.
- On a Reddit thread it sends the thread's `.json`, read with the same parser as the `.json` paste, and falls back to Defuddle's Reddit extractor when that request fails.
- With "Fill saved Reddit Items" on, opening a Link-only Reddit Item's thread fills that Item.
- In the self-hosted builds, the Extension's Connect Reddit button connects the owner's Reddit account (`docs/guides/reddit-account.md`).
- The owner enters the Instance's address and an agent token on the Extension's settings page, and the browser asks permission for that one host when the address is saved.
- The Extension holds only the `activeTab`, `scripting` and `storage` permissions. It asks for reddit.com when the owner turns on "Fill saved Reddit Items" or chooses Connect Reddit, and for `cookies` only at Connect Reddit. It saves one page per click and never crawls.

## Settings, look and layout

- **Layout and reader.** Both are app settings, saved per browser. "Layout: List or Grid": List is three panes (filters, item list, reader); Grid is a card grid. "Open items as: Page or Sheet" applies to Grid: Page grows the card into a full-page reader, Sheet opens a centred sheet over the dimmed grid. Under 760px wide, items always open full screen.
- **Look settings.** Font (5 pairs), Text size (Small, Medium, Large), Text width (Narrow, Medium, Wide), Density (Compact, Comfortable, Roomy), Comment style (Indented lines, Cards, Rail), Accent (5 colours), Tag style (Chips, Text, Dots) and Card images (On, Off). Defaults: Plex, Medium text size, Medium width, Compact, Indented lines, Cobalt, Dots, images on.
- **Reset look.** It resets only the Look settings, Style included. Layout, Open items as and Theme stay, and the panel says so in visible text.
- **Card images.** Off hides the card picture only, never the reader's, and does not load the card pictures at all.
- **Style.** One more look setting: Library (default) plus 10 styles (`docs/design/styles.md`). While a Style other than Library is on, its fonts and accent replace Font and Accent. Those controls are disabled and say "Set by the style". Their stored values stay, and choosing Library restores them, including after a reload.
- **Themes.** Light, Dark, Sepia and Match system. Match system follows the device; with no setting stored, the app draws Light.
- **Storage.** All twelve look and view settings (Layout, Open items as, Theme and the nine Look settings) are stored together in the browser. Each Item's reading place is kept for the browser tab. The AI, GitHub token and Grok Bot settings are stored on the server, and the keys and tokens in them are sealed under the Instance's secret key (`docs/architecture/access-owner-login-agent-tokens-mcp.md`).
- **Share from phone.** The app is an installable web app with a Web Share Target, so the Android Share menu sends a link into the same Paste as the paste box.
- While the owner is signed in, a share from the installed app saves the link at once and opens the library with that Item's paste card. A known link opens its Item in the Reader.
- A share the app cannot trust writes nothing. That means a link or form on another site, a request that lacks the browser's origin metadata, or any share while signed out. The library opens with the link in the paste box, and the owner presses Add.
- A signed-out share keeps its link through sign-in, a wrong password included.
- The link is the first http or https address in the shared url, text or title, in that order, without trailing punctuation.
- A share with words but no link opens the paste box with the shared words and the paste box's invalid-link error. A share with no content at all shows the notice "Paste a link first."

## Design

Every screen the app draws takes its look from these files. A screen added later is built from `design/system/` to match the existing screens.

- **Values:** `design/system/tokens.css` is the one source for every colour, size, spacing, radius, shadow, motion and breakpoint value.
- **Settings:** `design/system/settings-table.ts` is the one settings table, and every other list of settings is built from it.
- **Behaviour:** `design/prototype/` shows how each screen behaves. The app's reader bar has no position step. The prototype keeps its own copy of the tokens until it imports the system file.
- **Styles:** the 10 Style blocks live in `design/system/tokens.css`, with a palette for each Theme. Their fonts load from the Instance.
- **Breakpoints:** 480, 760, 1080 and 1440px, with 1, 2, 3, 3 and 4 grid columns from the narrowest band up.
- **Accessibility:** every text and background pair is at least 4.5:1 in every theme with every accent and Style. Every mark, icon and border a person needs to see a control or its state is at least 3:1 in the same combinations (W3C, WCAG 2.2 Non-text Contrast). Dividers, and the edge of a control that shows visible text, may be fainter. Text is never under 12px. Under 480px every target is at least 44px, except the width of a link inside the text of a post or comment, which stays the width of its text (WCAG 2.2 SC 2.5.8, Inline exception; `DESIGN.md` holds the rule). The open row is marked by a bar as well as by colour. Motion has a reduced-motion form.
- **Keyboard:** the first Tab stop in the Library is a button that moves focus to the first Item; j and k move through Items, Enter opens, m marks read or unread, / focuses search, the left and right arrows step to the previous or next Item while one is open in Grid, and Escape closes the open Item.
- **Review:** the building agent checks screenshots in every theme before a screen lands (`docs/agents/reviewing-code.md`). `docs/architecture/decisions-and-evidence.md`, Design review, describes the Impeccable review.

## Ingest flow

```
paste box, Share target, Extension, Import, HTTP API, MCP, Grok Bot
   -> POST /api/items {url} (or {url, content} for a Reddit thread from the Extension and the .json paste, or for an X post with its replies from a caller that fetched them, or {url, page} for any other page from the Extension)
   -> classify URL (reddit post | reddit comment | x post | github repo | article | other)
   -> fetch (no Provider call, but a model reads an X post, through the grok CLI or the Grok Bot's `x_intake` AI task), or take the content the caller sent
   -> deterministic clean
   -> agent call: comment filter + Digest (JSON out), unless the caller sent a Digest
   -> store; the Item shows "processing" until done
   -> wiki steps: Topic page, Related Items, Log (see The library wiki)
```

## Fetchers

### X post

- The owner chooses in Settings which reader fetches X links: `auto` (the default), `grok-bot` or `grok-cli` (`docs/architecture/fetchers.md`, X).
- With a Grok Bot webhook set up, `auto` hands the link to the owner's bot first. The bot fetches the post, its thread, replies and media through its X connector and sends them back to `POST /api/ai-tasks/{id}/intake`. Each routine run counts toward the owner's plan usage. A bot that never answers ends the Item `failed`, with no fallback to another source. The bot reads at most the first 100 replies of the post, because it types each reply into its answer by hand, while the intake route takes up to 500.
- Without a saved webhook whose key opens, `auto` fetches on the container build through the owner's grok CLI when it is installed and signed in, headless. A saved bot is never skipped for the CLI.
- `grok-bot` and `grok-cli` use that reader alone and never fall back to the other. When it cannot be used, the Item is Link-only and carries a note that names the cause.
- A reread uses the current reader choice. A job with an open Grok Bot task stays on the bot whatever the choice says, so the bot's answer is accepted and the task ends in a final state.
- The CLI run reaches no tool of the server: no shell, file, edit, subagent, MCP or workflow tool (`docs/architecture/fetchers.md`, X, holds the isolation rule and its probe).
- Both routes store the parsed thread unpublished and answer success at once. A verification job then checks every post against X's public oEmbed answer for its id (`docs/architecture/fetchers.md`, X) and publishes the thread only when the check ends. A post must exist under that id and author, and every character X shows must equal the stored text once whitespace is collapsed, with each link compared by its displayed, stored or resolved address. The check uses X's character weights to decide whether an ellipsis marks a cut. For a cut post, the stored text must start with the part X shows, and the rest of it is stored unchecked.
- The full-text check decides the author thread. Every other reply, including a separate reply by the post's author, can start with extra @mentions that X omits. If the remaining text is nonempty and passes the check, the Item stores it without those mentions. A reply that fails the check is dropped.
- The author thread (the author's own chain of replies to their post) joins the post text in order after the check, with a last line that says a part was not saved when one of them fails.
- The quote chain (the post the post quotes, the post that one quotes, and so on, 5 at most) is checked the same way and joins the post text right after the post's own text, before the author thread, as nested block quotes, each with its author, time and address. A quoted post that fails, with the ones after it, or that X shows but the read did not return, is replaced by one line that says quoted posts were not saved.
- The photos of the post, of each author follow-up and of each quoted post are stored as files like an Article's images and shown after the text they belong to. The grok CLI route and the Grok Bot's answer send their addresses, only `https://pbs.twimg.com/media/` ones are kept, and a video is not kept. A photo that cannot be stored is replaced by one line that says a photo was not saved, and the rest of the Item is saved. A Paste carries no photos.
- When the CLI returns null for `structuredOutput`, the last JSON text in its answer must match the answer schema. A recovered thread goes through the same check against X. For any `found: false` from the CLI, including one recovered from its text, each attempt asks X whether it shows the post. If X confirms the post is absent, the Item ends `status`. If X shows the post or cannot give a verdict, the fetch reads again within its remaining attempts. On the last attempt it ends `unreadable` with the note `cli-failed`. A refresh that ends this way keeps the saved thread.
- When X refuses the root post of a CLI answer, the fetch reads it again within its remaining attempts. A refused bot answer or a final refusal ends the Item `unreadable`. A refused refresh keeps the saved thread. An unreachable or limiting X makes the job wait and retry, and ends the Item `unreadable` once its attempts run out.
- A Link-only X Item offers Try again with `x-unconfirmed` from either reader or `cli-failed` from the grok CLI. The `cli-failed` causes are a CLI error, no usable answer, an oversized answer, an internal error, or a final `found: false` that X cannot confirm.
- A Paste with `content` keeps all supplied replies and is not checked against X, and its author thread and quote chain join the post text the same way.
- Both readers rank replies by likes, then by their own reply count (zero when absent), then by older id. They keep the smallest set that accounts for 80% of the likes, with a minimum of 20 and a maximum of 40. They also keep the selected replies' ancestors and the author thread (`docs/architecture/fetchers.md`, X, Replies kept). On a bot read, the Item also keeps replies eligible for ranking that the stored Digest names as Kept comments, along with their fetched ancestors. The bot's Digest takes precedence over a Digest the caller sent with the link. A bot read can therefore keep more replies than a CLI read of the same link. A refresh can keep more than 40 to hold the number of replies it stored, and the cap can leave the first read under 80% of the likes. When fewer than 20 replies qualify for ranking, both readers keep all of them.
- When either reader omits a parent, the Reader groups its saved replies under one Context stub and keeps their descendants beneath them. A thread that holds fewer replies than the stored one never replaces it. A thread with fewer replies than the post reports ends with a "Further replies were not saved" row.
- The Cloudflare build has no CLI and does not offer `grok-cli`, so there X needs the webhook.
- A Paste can also carry the thread: `POST /api/items` with `{url, content}` for an X link takes one JSON text of the post and its replies (`XThreadSchema`, `src/core/x-wire.ts`), stores it like a Reddit thread and keeps no archive note.

### Reddit post or comment

- A pasted Reddit link becomes a Link-only Item with its title, author and subreddit from Reddit's oEmbed endpoint.
- On Save, the Extension makes one signed-in request from the owner's tab, `<thread>/.json?limit=500&raw_json=1`, and posts that JSON. Threadsift reads it with the same parser as the `.json` paste, so one parser owns Reddit JSON.
- After the thread's `.json`, the Extension fetches the replies behind each `more` stub by their own permalink and follows the stubs those answers hold. A stub with no children ("continue this thread") is fetched by its parent's id. The fill stays within Reddit's request window and stops at the first HTTP 429 with no retry, and a reply that still fails becomes a Context stub that says it was not saved (`docs/architecture/fetchers.md`, Reddit).
- When the `.json` request fails, the Extension falls back to the Reddit extractor of Defuddle (MIT, the extractor behind Obsidian Web Clipper) on the rendered page.
- A Link-only Reddit Item, such as one shared from a phone or imported from `saved_posts.csv`, is filled when the owner opens that thread in a browser with the Extension, once the owner has turned on "Fill saved Reddit Items" on the Extension's settings page, which asks the browser for reddit.com. The Extension asks Threadsift whether the link is a Link-only Reddit Item and, if so, saves it the same way with `fill`, which never overwrites a saved thread.
- While such an Item is not processing, the Reader says its thread is not saved yet and how to fill it (`docs/architecture/extension-and-threadsift-bot.md`).
- The Extension's Connect Reddit button connects the owner's Reddit account, so a Reddit link needs no pasted cookie.
- Without the Extension, the owner can send the text of the post's `.json` page from their own browser as `content` of `POST /api/items`. The paste box has no field for it.

### Archive fill (self-hosted builds)


- A Reddit link that arrives without Extension content (Paste, Import, Share) is filled from Arctic Shift when no Reddit account is connected or the account request fails. It is on by default, and a setting turns it off.
- When Arctic Shift returns replies at the top of the tree because their parent is missing, the Reader groups them under one Context stub per missing parent.
- Comments that Arctic marks as deleted later are dropped. The oEmbed title wins when Arctic's title differs, and the Item names the archive and its date as its source.
- A 429 whose reset is at most 10 s away is retried once, after `X-RateLimit-Reset`. A longer reset, a second 429, a timeout or an outage leaves the Item Link-only without a retry.
- The fill runs once, when the link is pasted and the Item holds no thread. A later Paste of the same link does not replace a saved thread. Extension content replaces an archive fill on the next Save.

### The owner's Reddit account (self-hosted builds)


- An optional setting connects the owner's own Reddit account. When connected, it is the first server source for a Reddit link without Extension content, before Arctic Shift. It fetches the thread's `.json` and the replies behind its `more` stubs the same way the Extension does, so a thread is complete and current. The requests carry the account's `reddit_session` cookie. On Cloudflare the Worker sends them over a socket (`docs/architecture/decisions-and-evidence.md`, Reddit).
- The setting shows when the session stops working and asks the owner to connect again. The rule that expires the session is in `docs/architecture/fetchers.md`, Reddit.
- Every Reddit link without Extension content uses the account: the paste box, Share, Import, a batch call, an agent token's add and the MCP `add` tool alike. An Import of many links is read one thread at a time, oldest first, in the order the links were saved, and each waiting link shows the wait reason `reddit-limit` in the library.
- The account is the first step of the fetch, before any request. A job that must wait sends nothing to Reddit, and a connected account does not depend on the archive fill setting.
- A 429, Reddit's `x-ratelimit-remaining` reaching 0 or a fill that needs more requests than the window has left makes the job wait, and after three limited attempts the fetch uses the archive fill.
- Design: `docs/architecture/fetchers.md`, Reddit. Queue: `docs/architecture/jobs-leases-and-the-schedule.md`.

### Share links


- `redd.it/<id>` becomes `/r/all/comments/<id>/` without a request.
- A `reddit.com/r/<community>/s/<code>` link needs one redirect, which Reddit answers without a login. The server follows that one redirect, with no `.json` and no page fetch, and the Item is the post or comment it leads to, with the share link kept as an alias.
- A redirect that does not end on a post or comment, such as one for a removed link, leaves a Link-only Item under the share link, and the Extension saves the thread at its canonical URL.

### Fetcher plug-ins (container only)


- A self-hoster adds their own fetcher, at their own risk, as an ES module named in `THREADSIFT_FETCHERS`, which the container loads at start. The Cloudflare build loads none.
- A Paste of a link the plug-in claims is read by the plug-in before the built-in route, and a page the Extension sent wins over it.
- A plug-in returns page text only: no comments and no videos. It is never asked about an X or GitHub link, a Reddit link that is not a post or comment, or a Reddit post or comment whose thread is saved.
- A plug-in that fails, answers an invalid page or answers a page over 1,000,000 bytes ends the fetch `unreadable`, and one that does not answer within the fetch's 2 minutes ends it `timeout`.
- A plug-in runs inside the app with the Instance's environment and files and its own network access, with no sandbox. `docs/architecture/fetchers.md`, Plug-ins, holds the contract, the variable's format and the limits.

### GitHub repo

- The fetch uses the GitHub REST API, anonymous or with the owner's optional token. It gives the description, topics, stars, primary language, last push, license and README. The list row shows the stars, and the Reader shows the rest in a block above the README.
- The README is kept only when its file name ends in `.md` or `.markdown`; any other format gives no text. A deep link such as an issue address reads its repository. A repository with no README is `ready` with its metadata and no text.
- A repository answer that is not 2xx (not found, unavailable for legal reasons, private) is no failure. The fetch writes nothing, the Item is `ready` with what it already held (a Link-only Item when it is new), and pasting the link again fetches it again.
- **Token.** Settings holds the token, sealed on the Instance, with a link that opens GitHub's new fine-grained token page already filled in (a 366-day expiry and no permission, because public repositories need none), a Verify button and a Remove button. The token goes only to `api.github.com`. A token GitHub rejects with 401, or that the Instance cannot open, ends the fetch with a note that tells the owner to replace or remove it in Settings; the Item keeps what it saved before.
- **Rate limit.** When GitHub answers that a limit is reached, the Item shows that it is waiting and when it retries. Until the retry time the Instance sends no GitHub request for any GitHub link. A limited fetch is tried 3 times. After the third the Item fails with `rate-limited` and keeps its saved content.

### Article, Other and the one hop

- **Article:** readable text extraction (Defuddle, Readability-style), or the page the Extension sent. A page is an Article when it is HTML and reads as 100 words or more; any other page is Other. The page reader takes HTML up to 5 MiB on the container and 900 KiB on Cloudflare, and a longer page is Other with no post text. The Reader shows a long post text whole (`docs/architecture/files.md` holds where it is stored).
- **Other (YouTube and so on):** a Link-only Item with its title.
- **One hop:** when a Reddit post links to an article or a GitHub repository, the Digest also reads that page's text, so the Summary says what the post was about. The link is the post's target, otherwise the first link in the post text. The page is fetched when the Digest runs, used for that Digest only and not saved, so the Reader shows no linked text. A page that cannot be read leaves the Digest to the post and its comments.

### Media

- An Article's images are downloaded and stored with the Item. It keeps the first 20, each up to 2 MiB, and only JPEG, PNG, GIF, WebP and AVIF whose bytes match their declared type.
- An SVG, a failed or larger image, one past the 20th and an image whose host is `reddit.com` or a subdomain of it, `redd.it` itself, `x.com` or `twitter.com` (a leading `www.` is ignored) stay links to their source. An image on `i.redd.it` or `preview.redd.it` is downloaded.
- A Reddit page the Extension sent stores its pictures the same way. An X post stores the photos of the post, its author thread and its quoted posts the same way.
- Videos are kept as links in the text, the first 20 of them are also recorded as video entries, and a YouTube or Vimeo embed becomes a link to its watch page.
- The Reader draws a stored picture of the open Item; every other image is a link. The List row and the Grid card show the first stored picture while Card images is On.

### Duplicates

- Each Item has one identity, its normalized URL, and pasting a known URL again refreshes that Item.
- A link loses its fragment, credentials, `www.` and tracking parameters (`utm_*`, `fbclid`, `gclid` and others), and keeps its scheme and the case of its path, so `http` and `https` make two Items.
- Three Sources have their own rule. An X post is its status id, so x.com and twitter.com, any handle and a media suffix give one Item, while a reply or a quote is another Item. A GitHub repository-root link ignores case and a `.git` suffix, and a deep link is its own Item. A Reddit post or comment id is lower-cased, and a comment is not its post.
- A short link (`t.co`, `bit.ly`, `buff.ly`, `tinyurl.com`, `ow.ly`, `lnkd.in`, `dlvr.it`, `is.gd`) and a Reddit share link are no identity. The Paste follows a short link's redirects (at most 20) or a Reddit share link's one redirect, the Item is the page it leads to, and the short link is kept as an alias. Pasting it again or pressing Try again refreshes that Item at its saved address even if the short link now points elsewhere or has died.
- A short link that cannot be resolved is saved under the short link with the failure as its fetch result. A timeout or network error on a new Item ends `failed`, and any other failure (an HTTP error, a redirect that leads nowhere, more than 20 redirects) leaves a `ready` Link-only Item. The next Paste resolves it again.

## Comment filter

1. The script drops deleted or removed comments, comments by AutoModerator, empty replies and replies that are only "+1", "this", "same", "thanks", "thank you", "lol" or "lmao" (`src/core/comment-filter.ts`).
2. The agent keeps a remaining comment only when it adds a fact, a fix, a working link or command, first-hand experience, or a real counterargument. It drops jokes, agreement and repeats.
3. When a kept reply sits under a dropped parent, the parent stays as a one-line Context stub so the tree still reads correctly.
4. X replies follow the same rules.

- The agent makes step 2 in the same call that writes the Digest, over the eligible comments that fit the Digest's input budget (`docs/architecture/ai-tasks-and-providers.md`, Measured Digest input budget). A comment that does not fit is not Kept, and as a parent it shows as the same stub as a comment the agent dropped. The app drops any id the agent returns that it was not shown. A caller-sent Digest names its own Kept comments, and the agent makes no choice for it.
- Until a Digest covers the thread, the Reader shows every comment that passes step 1, as the thread, under a line that says the comments are not filtered by a Digest yet and why. The reasons are: a Digest is being made, the last Digest run failed, no Provider is saved (a Grok Bot chosen as the Provider counts as saved), a Provider is saved and the Item has no Digest yet, or the stored Digest was made from earlier text and does not cover the thread.
- Once a Digest covers the thread, the Kept comments, and any comment that holds an attached Highlight, show and the line goes.
- A thread whose Digest kept none says that none of the comments added anything.
- A thread whose stored comments all fail step 1 and that no Digest covers shows the comments heading, one line that says its comments were removed, written by bots or empty, and no thread.
- A thread with no stored comment shows no comment section.
- The list row counts the comments the Reader shows ("Showing N of M" before a Digest covers the thread, "Kept N of M" after), and a Highlight can be kept on any comment the Reader shows.
- Search and the Item notes of the Export still hold the Kept comments only, while the backup records of the Export hold every stored comment.
- An X thread follows the rule the same way.

## Agent output per Item

The agent returns one JSON record, the Digest, stored apart from the fetched content so it can be regenerated without fetching the Item's own link again (a Reddit post's linked page is read again for the Digest):

- a clean title
- one Topic from a Topic list that the agent keeps and grows itself
- up to 3 Tags; before creating a Tag, the agent checks the existing ones, so near-duplicates do not appear
- a 2-line Summary covering the post and what the Kept comments concluded
- Key points
- the ids of the Kept comments

Rules for the Digest:

- **Identity of Topics and Tags.** It uses `catalogKey` in `src/core/catalog-key.ts`. Case, width, composition and spacing do not make a new Topic or Tag: `İstanbul`, `Istanbul` and `istanbul` are one, and so are `Straße` and `STRASSE`, while `café` and `cafe`, `ş` and `s`, `ö` and `o`, and the dotless `ı` and `i` stay apart. The first spelling stays visible. This normalized key is the app's only duplicate check. Semantic near-duplicates such as "ML" and "Machine learning" are the model's job from the supplied lists and, for the pairs the plain checks find, the Proposals' job.
- **The list.** It uses the stored Digest's clean title and Topic and keeps the fetched title separately. Summary, Key points and Tags wait for the Reader. The last stored Digest stays visible during refresh or regeneration.
- **A failed run.** It shows "No Digest" only when there is no stored Digest. A kept Digest shows "Digest not updated". Both offer Try again, in the list row and in the Reader beside the note, and a failed Item's failure note in the Reader carries it too.
- Try again queues a Digest over stored text without a new fetch, and does nothing while a Digest is already open or the Item is failed. The owner session and agent tokens may call it.
- An Item with no Digest source (no post text, no eligible comments and, for a Reddit post, no link to a page for the Digest to read) has nothing to queue a Digest over, so its Try again pastes the link again, because only a new fetch can bring text back. A failed Item keeps the paste retry action.
- **Item state.** A failed fetch keeps the Item `failed` while a remaining Digest closes under it. Otherwise an Item shows `processing` while either job is open and `ready` when none is, because only the failure marker and its reason are stored and the open jobs decide the rest.
- **When a Digest job opens.** A fetch that replaces the Item's content opens its Digest when the Item has a Digest source (post text, an eligible comment or, for a Reddit post with no caller-sent Digest pending, a link to a page for the Digest to read) and a Provider is saved or a caller-sent Digest is pending.
- Items with no Digest source settle without a Digest job, and a caller-sent Digest they hold is dropped, because there is no text for it to publish over.
- When a refresh replaces the content without opening a Digest job, because no Provider is saved or the new content has no Digest source, a retained older Digest gets the failure marker and offers Try again.
- **Order of work.** A Digest waits for an open fetch before calling the Provider and publishes only over the content it read. A stale result is discarded and the job runs again on fresh inputs (`docs/architecture/jobs-leases-and-the-schedule.md`). Each job run makes at most one model call.
- **Errors.** Wrong keys, missing models, refused addresses, missing configuration or sealing secrets, and Provider HTTP 400 or 422 answers give up immediately. Network failures, timeouts, a busy Provider, and a successful HTTP answer whose output fails the Digest schema retry with the job runner's delays while the inputs are current. A refusal on stale inputs follows the stale result rule above. A failed Digest leaves fetched content readable.
- **A caller-sent Digest.** `POST /api/items` accepts one from the owner session or an agent token. Invalid Digests return 400 before storage. The last Paste sets or clears the pending Digest. A fetch with no text drops it and keeps any stored Digest. A fetch with text lets it publish by normalized key, without a catalog guard or a Provider call. Its AI task starts before publication with executor `caller`, with no Provider or model, and a failed publication leaves a failed task record. Try again always uses the configured Provider.

## The library page and the Reader

- **Paste card.** A Paste shows a card under the paste box that says what is happening: reading the link, added, already saved and refreshed, or a failure note with Try again. The Added and refreshed cards have Open and Dismiss. The Added, refreshed and failure cards close themselves after 6 seconds, held while the pointer or focus is inside. Try again on a row uses the same card: for an Item with no stored text it pastes the link again, and for one with a failed Digest it queues a Digest over the stored text.
- **Search and filters.** The list head says how many Items match. When none do, one button, Clear search and filters, resets both; the filter pane's own Clear filters link, which keeps the search, is hidden while no Item matches. The API behind the counts is under Interfaces.
- **Read state.** An Item is unread until the owner marks it read, from the Reader bar, the dot on its row or the `m` key. The agent, a refresh and a Digest never change it. In the List Layout at 760px wide and over, the first load opens the first unread Item once and leaves it unread; an Item named in the address wins, and under 760px nothing opens.
- **What the Reader shows,** top to bottom:
  - the header: Source, place, author, posted and saved times, title, and for a Reddit link post the address it points at as a link that opens in a new tab, shortened by the width of the column and never by cutting the address, with no "no post text" line beside it. An X Item with an author shows the author's handle and no place, so the handle appears once;
  - the Topic, Tags, Summary and Key points;
  - for a GitHub repository, its block of description, stars, language, license, last push and topics;
  - the post text (the README for a repository);
  - the comments (the Kept ones, and any that holds an attached Highlight, once a Digest covers the thread, otherwise every comment that passes step 1);
  - the Related Items, with no heading when there are none, each with its Source, title and reason and opening that Item;
  - the Highlights list;
  - the Note box.
- **Markdown** shows without raw HTML, and only `http`, `https`, `mailto` and in-page links work.
- **A failed later read.** When a later read of the Item fails, the Reader keeps the body it has and shows the failure. It offers Try again for a failed Item or one with a retry action. An X refresh that ends `unreadable` keeps the saved body and shows the fetch note without a button beside it.
- **The bar** holds the Comments button, Mark read or unread, Open on the Item's Source and Delete, and it drops the key hint and then the button labels until it fits.
- **Comments.** Replies nest under their parent, drawn in the Comment style the owner chose, and the Item author's comments carry an OP badge.
- A comment taller than 8 lines folds to its first 6 lines, and keyboard focus that lands inside a fold opens it.
- A Context stub marks a dropped parent or a parent missing from an X thread or a Reddit archive fill, and a stub that says "Further replies were not saved." marks replies behind a `more` stub.
- The Comments button jumps to the section and shortens to "N of M" and then to the count as the bar narrows.
- A row reads "Kept N of M" for an Item whose Digest covers the thread, "Showing N of M" before that, and "Saved comment" for a saved Reddit comment.
- **Highlights.** The owner selects one passage inside the post text or inside one comment the Reader shows, and a popover offers Keep. A selection across two bodies, or one that touches a control or a Context stub, offers nothing.
- A kept passage is marked in place, in List, Grid Page, Grid Sheet and on a phone. Pressing a mark offers Remove, and Escape closes the popover without closing the Reader.
- The Highlights list at the end of the Reader holds every Highlight of the Item, and choosing one scrolls to its mark and opens the fold around it. A Highlight whose passage is gone shows its quote with the note "Passage no longer found because the item’s text changed."
- **Note.** The Note box follows the Highlights list (Highlights, Notes and the Highlights page).
- **Reading place.** Each browser tab remembers where the owner stopped in each Item and returns there on reopen, as long as the text at that place is still in the Item.
- **Delete.** Delete asks "Delete this item?" with Cancel and Delete item. While the request runs both buttons and Escape do nothing, and after 20 seconds without an answer the dialog reports the failure and offers both again.

## Highlights, Notes and the Highlights page

- In the Reader, the owner selects text in the post text or a comment the Reader shows to keep it as a Highlight, and writes one free-text Note per Item. Highlights stay marked in the Reader.
- When a refresh changes the text so a Highlight no longer matches, or matches two places equally well, the Highlight is kept and marked as no longer found in the Item.
- Only the owner's session keeps or removes a Highlight and writes a Note. An agent token reads both with the Item and never changes them. A refresh, a new Digest or an agent never rewrites a Highlight's quote or a Note.
- A Note is plain text of up to 10,000 code points, saved with the Save button or Ctrl or Cmd with Enter.
- When the Note changed elsewhere since the owner loaded it, the save is refused and the Reader shows the newer Note beside the owner's text, with a choice to keep the owner's text or take the newer one. Text the owner typed and did not save stays in that browser for the Item.
- A second page lists every Highlight and every Item Note, newest first, each with its Item's Source, title and date and a link back to that place in the Reader. Search and the Source, Topic and Tag filters work there too.
- The page opens from the Highlights link in the settings panel, beside Instance settings, and at `/highlights`. It shows 50 entries at a time with Load more.
- A Highlight is dated when it was kept and a Note when it was last saved. A Note the owner cleared has no entry, and an entry whose passage is no longer found says so.
- Search there matches only the entry's own quote or Note text, not the Item's title, Summary or Tags.

## Export, backup and restore

- The owner downloads the library as a zip with one Markdown file per Item: front matter with Source, URL, author, dates, Topic, Tags, Read state and a title alias when present, then the Summary, Key points, Highlights, Note, post text and Kept comments (not the comments the Reader shows before a Digest covers the thread), with the Item's stored images beside it.
- One export exists at a time, and a ready export is kept 24 hours, then the sweep removes it.
- The export zip also holds every library record (everything except secrets, login data, work in flight, the owner's choice of Provider and of X reader, and the search tables, which are derived from the records).
- A new Instance can restore from the zip after its setup code is entered, so the same zip backs up both install targets and moves a library between them (`docs/architecture/export-backup-and-restore.md`). The restore brings back the records, the stored images, the search rebuild and the Highlight anchors, and it has cancel, resume and a setup page step.

## The library wiki

The agent builds the synthesis once, when an Item arrives, and keeps it current, instead of searching raw content at question time (`docs/architecture/decisions-and-evidence.md`, The library wiki). Each Item's Digest is its summary page; the four parts below add the rest. `docs/wiki.md` and `docs/proposals.md` own the mechanics.

### Topic pages

- Each Topic has a page with an overview of up to 5 lines that the agent writes, and the list of its Items with their Summary lines.
- While a Provider is saved, each new Digest opens one small agent call that revises the overview of that Item's Topic from the overview and the new Digest, or leaves it unchanged. With no Provider saved no overview run opens. The overview names the Items it was built from, so it never stands in for them.
- The page is reached from the Topic in the Reader and in the filters pane. Its address holds the Topic's catalog key, so `İstanbul` and `istanbul` are one page.
- The address of a Topic that an accepted merge removed shows the Topic it was merged into, and Try again acts on the survivor.
- A failed overview shows on the page with Try again and the list of Items still shows. With no Provider saved and no stored overview, the page shows a note and the Items.
- Deleting an Item removes it from the list at once, and the overview runs drop it from the overview.
- One run makes one agent call over as many uncovered Items as fit its input, and starts the next run itself after each success until every Item is covered (`docs/architecture/ai-tasks-and-providers.md`, Continuation). An Item whose stored Digest cannot be read stays uncovered, and the run ends without starting another.
- Below the overview the page lists the pairs of its Items whose disagreement the owner accepted, under "Known disagreements", each with the agent's reason and a link to each Item, newest first, at most 20, and only while both Items are still under this Topic and carry the Digests the pair was accepted on.

### Related Items

- The Reader shows up to 5 Related Items, each with a one-line reason. The app finds candidates with the full-text search, and the agent picks the real ones. Related Items are links between Items, not prose inside a page.
- When an Item's Digest lands and a Provider is saved, one agent call picks from the other Items whose Digest title, Summary and Tags best match this Item's clean title and Tags (`docs/wiki.md`, Related Items). The post text, comments, Highlights and Notes of an Item never match and never go to the Provider.
- The agent answers with 0 to 5 picks, each an Item and a reason of 1 to 160 characters on one line, and the new set replaces the old one as a whole.
- A pick belongs to the Item that made it: the other Item's Reader does not list it, and an Item whose Digest landed first lists nothing about a later Item until its own Digest is made again. Older Items get no pick, because none is backfilled. Deleting either Item removes the pair.
- A failed pick keeps the earlier set, which the Reader still lists, changes nothing in the Item and shows no failure note. A later Digest of the Item runs the pick again.

### Index and Log

- The Index lists every Topic with its Item count and its overview line. It is reached from a link in the settings panel beside Highlights and lives at `/topics`.
- A row appears once for each Topic, by the name it was first spelled, ascending by its catalog key, 50 to a page with Load more; a row opens the Topic page. A Topic whose Items were all deleted stays in the list with 0. The overview line is the first line of the stored overview; a Topic with no overview has no line.
- The Log lists committed library changes and files the Vault mirror skipped, newest first, and lives at `/log`, reached from a link in the settings panel beside the Index. It is 50 lines to a page with Load more.
- It records the actions listed under Log entry in `GLOSSARY.md`. A result that is discarded, stale or rolled back adds nothing (`docs/wiki.md`, The Log).
- A line reads `[YYYY-MM-DD HH:MM] ingest | <title> | topic: X | tags: a, b`, and a `merge` line gives the number of Items that carried the merged-away Tag or Topic. The line starts with the browser's local calendar date and the time of day, as text.
- A line keeps the title, Topic and Tag names as they were when it was written; the title opens the Item and the Topic name opens its Topic page. A first Digest in a new Topic shows `ingest` above `topic`.
- A `merge` or `merge-topic` line names no Item and no Topic page, so deleting Items or the merged-away Topic keeps it.
- A failed Digest, overview or pick, the Verify task and an Item's deletion are not entries. Deleting an Item removes its `ingest`, `digest` and `related` entries and keeps the `topic` and `overview` ones.
- The Log starts empty with the Instance, and an empty Log says the date it began.
- The Index and the Log need no agent call.

### Proposals

All five kinds are built, each with its weekly check, Reject and Accept. `docs/proposals.md` owns how each kind works, with its limits, Accept, Reject and Pins.

- The page lists changes the agent suggests and never makes on its own: merge two Tags, merge two Topics, remove a Highlight no longer found, cover the Items a Topic's overview leaves out, and settle two Items of one Topic that disagree.
- Plain checks find the candidates. The agent judges only the candidates those checks found.
- The owner accepts or rejects each one, and the app applies the accepted ones. An accepted Tag merge, Topic merge or disagreement is kept as a Pin, so the next regeneration cannot undo it. A Lost Highlight and an Overview gap leave no Pin.
- Once a week, while a Provider is saved and at least one Item has a Digest, the tick opens three runs over the whole library, one for Tags, one for Topics and one for Items. Each run is claimed on its own, so a failure of one does not skip the others, and the page shows nothing about a failed run. A run that has no input closes without a model call.
- Reject is final for the pair or row it names. A pair or row that already has a Proposal in any state is never sent again.

**Tag and Topic merges.**

- Plain rules find the candidates: the same key once every character that is not a letter or a number is removed and one final `s` is dropped when at least 3 letters or numbers stay (`machine-learning`, `machine learning`, `LLM` and `LLMs`), and an initialism (`machine learning` and `ml`). They find no semantic duplicate beyond these rules. The agent judges the pairs, and every pair it does not return is stored as declined. A Topic run sends no Item text.
- Accept merges the first into the second with no confirmation and cannot be undone in this release. It moves every Item to the survivor, rewrites the merged-away name out of the stored Digests, writes a `merge` or `merge-topic` Log entry, and keeps a Pin so no later Digest brings the merged-away name back.
- A Topic merge also deletes the merged-away Topic with its page, moves the Log lines that named it to the survivor, opens its address on the survivor, and tries once to open an overview run for the survivor. With no Provider saved nothing opens. When the survivor has an overview, its page lists the moved Items as "Not in overview yet".
- The row shows both Item counts, so the owner sees the size before pressing Accept.

**Lost Highlights.**

- A plain query with no model adds rows for Highlights that are not attached (`gone` or `ambiguous`, the states the Highlights page calls "not found") and deletes the open rows whose Highlight is found again. It sends no quote to a Provider.
- Accept removes the Highlight and its search part and cannot be undone. Reject keeps the Highlight as it is. The check writes only Proposal rows, never a Highlight's quote, selector or status.

**Overview gaps.**

- A plain query with no model adds rows for Topics that have Items outside their overview ("Not in the overview" is the predicate the Topic page uses for "Not in overview yet"), and deletes the open rows whose Topic has no such Item left or has a run open.
- Accept starts the same overview run as Try again on the Topic page, which continues until every readable Item is covered. A failed run or a removed Provider stops the chain. Accept keeps no Pin, because an Item that is in `built_from` stays there across later revisions.

**Disagreements.**

- A plain check picks the Topics worth a call: a Topic with at least 2 Items with a Digest whose newest Items, or their Digests, changed since the agent last read it. The call sends each Topic's name and the Digest title and Summary of its Items, and no post text, comment, Highlight, Note, Key points or overview.
- The agent returns the pairs whose Summaries cannot both be true, each with a short reason, and a doubtful pair is not returned.
- A row is listed only while both Items still have the Digest the pair was judged on and sit under one Topic. A new Digest of either Item hides the row, and the next weekly stage deletes it so that the pair can be judged again.
- Accept keeps the pair as a Pin with no model call and no confirmation, and cannot be undone in this release. The Topic page lists the pair under "Known disagreements", outside the overview, so a regenerated overview cannot drop it. It changes neither Item, no Summary and no overview.
- The Pin binds the pair to the two Digest versions it was judged on, so a new Digest of either Item, even one with the same Summary text, ends it. The entry leaves the Topic page, the Pin stays unused until a later Accept replaces it or an Item delete removes it, and the weekly check may propose the pair again. The weekly check sends a pair with a current Pin as decided.

The owner's Highlights and Notes are never regenerated or rewritten by the agent. Overview revisions are accepted only while the Topic's inputs are still the ones the run read, with a second run refused and queued again, and Grok Bot starts one overview task per Topic at a time.

## AI providers

- The owner picks one Provider in the AI settings, and the screen shows only the fields that Provider needs.
- "Verify" runs one small real Digest, so a model that cannot return the Digest's JSON fails at setup, not on the 200th Item. It uses the saved settings and shows a Digest or a refusal with a recovery action. It adds no Item, Topic or Tag.
- The Settings page offers OpenAI-compatible URL, OpenRouter, Anthropic, OpenAI and xAI, Workers AI on Cloudflare, and on the container Claude Code on this server and Codex on this server (each takes a model that may be left empty and no key). It also offers Grok Bot on both targets. Grok Bot takes no field: Save answers 400 until the Grok Bot section holds an address and a key this Instance can open, and Verify sends the bot one small Digest task and waits for its answer before it answers `timeout` (`docs/architecture/http-interfaces.md`, Settings routes).
- The Grok CLI is not offered as a Provider, though the container uses it to fetch X posts (`docs/architecture/fetchers.md`, X), because it gives no proof of its tools before a model request (`docs/architecture/ai-tasks-and-providers.md`, CLI executor, Grok CLI).
- Anthropic, OpenAI and xAI each take a model and an API key; their URLs are fixed.
- Save keeps the API key sealed on the Instance; the screen only reports whether a key is set and whether this Instance can still open it. When it cannot, because `THREADSIFT_SECRET_KEY` changed or was lost, the screen says so and offers both ways back: restore the original key, or enter the API key again and save to replace the unreadable one.
- Saving a Provider opens Digest jobs for older Items with post text, no stored Digest, no failure marker and no open Digest job. Saving again does not reopen failed Digests; Try again owns that retry. This spends one model call per eligible Item, with 4 jobs at a time in the container and up to 100 per minute on Cloudflare.

| Provider | Self-hosted container | Cloudflare deploy | Hosted product (later) |
|---|---|---|---|
| OpenRouter, by key or the Connect button | yes | yes | yes |
| Anthropic, OpenAI or xAI API key | yes | yes | yes |
| Any OpenAI-compatible URL (Ollama and others) | yes | yes, at a public HTTPS address | no |
| Workers AI | no | yes | maybe |
| Claude Code or Codex signed in on this server | yes, when the app finds the CLI | no | no |
| Grok Bot (the owner's plan runs every AI task: Digests, Topic overviews, Related Items, Proposals) | yes | yes | yes |
| Sign in with ChatGPT | later | later | only after OpenAI approves it |

- **CLIs:** the app never reads or stores a CLI's login. The owner signs in with the CLI's own command, or starts the container with a token from `claude setup-token`, which the app passes unchanged to the CLI. Codex has no token variable, so the owner runs `codex login --device-auth` in the container, and the login stays in the `/data/codex` folder of the volume. The AI settings show the sign-in command when the CLI is signed out, and Save and Verify stay off until it is signed in.
- The CLI runs with its tools turned off in an empty folder and a minimal environment, because every Digest call reads other people's posts (for Codex the app removes the tools from a copy of the model catalog, since Codex has no switch for that). `src/targets/node/claude-code.ts` and `src/targets/node/codex-process.ts` hold the flags, and `docs/architecture/ai-tasks-and-providers.md`, CLI executor, holds the limits and their reasons. At most 2 CLI tasks run at once on an Instance, Verify and Digests together, across both CLIs, because a plan is one person's quota.
- **OpenRouter Connect:** the Connect button sends the owner to OpenRouter to approve a key (OpenRouter's PKCE flow) and saves the returned key sealed, like a typed key. It needs the Instance's public address (`THREADSIFT_PUBLIC_ORIGIN`: an `https` origin, or `http` on localhost); without it the button gives way to a note. A Save the owner makes while on OpenRouter's page wins, and the Connect result is dropped. Connect saves the key, then checks once a second for up to 45 s whether it works, because OpenRouter turns a new key on some seconds after it makes it; the last check may take its own 8 s timeout. When the key is active, Connect opens Digests for older Items. When it is still not active, Connect says so and opens none until the owner saves again. An attempt expires after 10 minutes.
- **Plans:** the hosted product never offers a Claude plan login (`docs/architecture/decisions-and-evidence.md`, AI providers). The Import screen suggests an API key when a plan Provider is picked.
- Claude Code and Codex each have optional Model and Effort fields. A saved effort applies to every AI task and Verify. A saved model with blank Effort uses that model's CLI default effort.
- **Default model:** AI settings name the recommended model and effort when the installed CLI supports the pair. With a recommendation, both blank fields use that pair and Effort alone uses the recommended model. Instances already saved with blank fields follow these rules on update without another Save. Without a recommendation, both blank fields use the CLI defaults. Effort alone then uses the first visible bundled model by priority on Codex, or lets Claude Code choose the model. To keep Claude Code's own defaults, enter `default` as Model and leave Effort blank. To use a Codex model's CLI default effort, enter its model name and leave Effort blank. The owner's picks and the Digest comparison are in [Decisions and evidence](architecture/decisions-and-evidence.md#ai-providers).

## Grok Bot

```
A. The owner drops a link in a Grok Bot chat
   owner -> Grok Bot -> POST /api/items (MCP or token) -> Threadsift

B. Scheduled X bookmark sync
   Grok Bot (every 3 hours) -> reads the X bookmark list from the top -> POST the post ids to Threadsift in batches
   Threadsift -> asks the bot for each new thread (flow C)

C. Intake webhook
   owner pastes an X link into Threadsift
   Threadsift -> POST the link to the routine's webhook URL and key -> Grok Bot wakes
   Grok Bot -> fetches post, thread, replies (X connector) and writes the Digest
   Grok Bot -> POST /api/ai-tasks/{id}/intake with the content, the Digest and the task's credential -> Threadsift
   (POST /api/items takes no task id, so a callback is never an ordinary save)
```

- The first release works with Grok Bot three ways: saving a link dropped in a Grok Bot chat, a scheduled X bookmark sync routine, and an intake webhook through which Threadsift hands X links to the owner's bot.
- **Setup:** the owner connects Threadsift to Grok Bot once. On the bot's side, they give the bot Threadsift's URL and a token made in Agent tokens (only the bot keeps that token). For C, they paste the webhook routine's URL and key into the Grok Bot section of Settings, which has a Test button that sends a harmless ping.
- The section holds the address and the key and no token. The key stays on the server, sealed, and no screen or route shows it again. Save and Remove contact no one. Test sends one ping with no library text, wakes the routine and costs the bot one run. A new address needs a new key, so the saved key never goes to an address the owner just typed. The address must be a public `https` address, and only the owner's views show it.
- **The Threadsift bot:** a public Grok Bot template with one skill that saves links dropped in chat, searches the library, runs the X bookmark sync and answers Threadsift's webhook. Its setup guide (`bot/setup.md`) walks the user through adding their Threadsift URL and token, because a template cannot carry a custom MCP server. The bot's Digest reuses the library's Topic names, which it reads with the script's `topics` command. The script reads no Tags, though the first page of `GET /api/items` returns their counts, so a Digest the bot writes picks its Tags without them, unlike a Digest the Provider writes, which gets the catalog.
- **AI tasks:** when Grok Bot is the Provider, Threadsift sends it every AI task (a Digest, a Topic overview, a Related Items pick, the weekly Proposals) through the same webhook, and the bot posts the result back. Grok Bot is chosen as the Provider only when its settings can send. Switching to another Provider at once fails every open bot task as abandoned and makes the jobs that wait on it due, so a late answer is refused and never applied. Without Grok Bot, every task runs on the Provider the owner picked (`docs/architecture/ai-tasks-and-providers.md`).
- A bot error is logged with its task and job ids. The log holds no error text from the bot.
- **Speed:** an X link through the webhook may take longer than a direct fetch, because the bot has to wake and run. The Item shows "waiting for Grok Bot" until the bot answers, for at most one hour a send and three sends.

## Obsidian vault mirror

- The owner opens Obsidian from Settings, enters a GitHub repository, an existing branch and a fine-grained token, and uses Verify to check that the branch is reachable. Verify writes no file and does not test write permission. Save seals the token under the Instance's secret key and never returns it to a screen or route. Agent tokens cannot use these settings routes.
- Saving the settings queues every Item and Topic page, the Index and the Log. Library changes queue the notes they affect in the same write batch. The writer waits for an Item's open jobs before it reads that Item.
- Each Item note keeps an Item-id path with the current title as an alias. Its front matter holds Source, URL, author, dates, Topic, Tags and Read state. The body holds wikilinks to the Topic page and Related Items, plus the Summary, Key points, Highlights, Note, post text and Kept comments. Stored images sit beside the note. A refresh adds new images and removes images the Item no longer holds.
- A Topic page note keeps a Topic-id path through a rename and holds the overview, Known disagreements and wikilinks to its Items. The Index links to every Topic page and shows its Item count and overview line. The Log links to notes by UTC month, newest month first. Each month lists its entries newest first.
- A Topic merge removes the old Topic page note and rewrites the affected Item notes and their wikilinks to the surviving Topic. A Tag merge rewrites the affected Item notes. Accepting a lost Highlight, an overview gap or a disagreement updates the notes when the change is stored.
- A file above GitHub's 100 MiB limit is omitted and recorded in the Log. See the writer's separate request and memory budget in `docs/architecture/vault-mirror.md`.
- A single leased writer drains the queue through GitHub GraphQL commits bounded by note count and file bytes. Each commit compares the expected branch tip; a moved branch is read again and the commit rebuilt. An Item can span commits: assets arrive before its note, and deletion removes the note before its assets. File progress survives retries, and a rate limit waits until GitHub's retry time. A newer queued change survives an older write.
- If the Vault mirror holds a write lease, Restore keeps the uploaded zip and asks the owner to try again with the same file. A running Restore pauses the writer and queues the final library when it finishes or is cancelled. The Export leaves the settings, queue and written-file list out.
- The mirror is one-way: the owner reads in Obsidian and edits Highlights and Notes in Threadsift. Vault repositories on other Git hosts are not in the first release.
- Not built: container folder mode.

## Access

- **Owner password.** Signed in, the owner changes the password in Settings with the current one. Every other session ends, the owner's own session gets a new id, and agent tokens keep working.
- **A lost password.** An owner who lost the password sets `PASSWORD_RESET_CODE` on the server (a container environment variable read at start, or a Worker secret), opens "Lost your password?" on the sign-in screen and enters the code with a new password. The code is an operator credential of at least 32 characters, works once, ends every session, keeps the agent tokens and signs nobody in. With no code on the server nobody can reset anything. `docs/architecture/access-owner-login-agent-tokens-mcp.md` holds the rules, and `GET /api/openapi.json` lists the status codes.
- **Agent access.** Besides the HTTP API, the app serves an MCP endpoint whose tools search Items, read one Item with its Digest, Highlights and Note, and add a link. Each tool runs the same code as the matching HTTP call.
### Token scopes

Each agent token carries scopes that limit what it calls:
  - `read`: search and read Items, Topic pages, the Index, the Log, the Proposals, the Highlights page and stored images;
  - `add`: a Paste and a batch of links;
  - `digest`: queue a Digest or a Topic page overview again, and send a Digest with a Paste;
  - `delete`: delete an Item;
  - `reddit`: connect and disconnect the Reddit account through `/api/reddit-account` (reading it there needs `read`).
- The owner picks the scopes when creating the token, and a new token starts with `read` and `add`. A token created before scopes existed keeps the first four and never gets `reddit`. A scope name that a token holds and this release does not know is ignored. A call outside the token's scopes answers 403.
### Token budget

Each agent token has a daily budget of new Items. Only a new Item counts, because each one costs the Provider one Digest call; a link the library already holds, a refused host, a read and a search do not.
  - The day is a fixed UTC day, and a spent token gets 429 with `code: budget-spent` and a `Retry-After` of the seconds until 00:00 UTC on `POST /api/items` and `POST /api/items/batch`. The MCP tool `add` returns an error result with `code: budget-spent` and `retryAfter`.
  - A new token starts at 200 Items a day. The owner can set another whole number above 0, or no budget, when making the token and afterwards in Settings. A token with no budget set is unlimited.
  - A batch that would cross the budget is refused whole and saves nothing, and a single add over the budget is refused too. The count is checked once before the first save, so the batch is not refused again when a held link is deleted or midnight passes. Two requests at once can pass the limit by one request's links.
  - `docs/architecture/access-owner-login-agent-tokens-mcp.md` holds what counts, what frees a place and what a refresh does.
  - The owner's session has no budget. Settings shows each token's use and marks a spent one.

## Interfaces

`GET /api/openapi.json` describes the REST routes with their bodies and status codes. `docs/architecture/http-interfaces.md` holds the rules around them, and its MCP and Web Share Target sections cover `/mcp` and `/share`, which the document leaves out.

- The paste box, the Extension and agents use the same HTTP API.
- Every call needs the owner's session or an agent token, except the session check, the first-run setup, the sign-in, the password reset and the three Grok Bot task routes, which take the task's own callback credential.
- The owner's session alone calls `/api/settings`, `/api/tokens`, `/api/password`, the sign-out, a Read state change, a Highlight and a Note.
- The MCP endpoint `/mcp` offers `search`, `read` and `add` to an agent token, and cannot write a Highlight, a Note or a Read state.
- The Web Share Target is a form `POST /share` that needs the owner's session, `Sec-Fetch-Site: same-origin` and an `Origin` that names the Instance.
- The Export and Restore routes answer 403 to an agent token, because a leaked token must not copy the library in one request.

## Install and deployment

| | Container (Podman or Docker) | Cloudflare (Worker) |
|---|---|---|
| Storage | SQLite and a folder for images | D1 and R2 |
| AI Providers | every row of AI providers marked for the container | API keys, OpenRouter, an OpenAI-compatible URL at a public HTTPS address, Workers AI, Grok Bot |
| X fetching | Grok Bot webhook, or the grok CLI installed by the owner and checked at run time, as the owner chooses in Settings (`auto`: the webhook first when both are set), with every post checked against X's oEmbed answer | Grok Bot webhook; without it, X links are Link-only Items |
| Reddit | Extension, `.json` paste, archive fill, the owner's Reddit account, Link-only Items, own adapter if added | Extension, `.json` paste, archive fill, the owner's Reddit account, Link-only Items |
| Vault mirror | Item notes and the library wiki in a GitHub repository. Local folder Not built | Item notes and the library wiki in a GitHub repository |
| Deploy button | none needed | Not built |
| Cost to the self-hoster | their own server | Cloudflare's $5 a month Workers Paid plan; the reason is in `docs/architecture/cloudflare-deploy-button.md` |

- A self-hoster can deploy a Cloudflare Instance with `pnpm run deploy` and keep its library when running the command again. The deploy button itself is not built.
- A standalone repository copied from the `release` branch checks for updates weekly or on demand. It keeps one pull request for the upstream changes, preserves the copy's resource ids and lists new bindings. A failed update opens an issue in the copy. Later runs with the same failure comment on that issue.
- One codebase serves both: the database, the file store, the job queue and the AI caller each have one adapter per target.
- The container image is pushed as `ghcr.io/kyanitehq/threadsift:main` on each push to `main`. The release workflow publishes a version tag for both architectures with provenance and moves `release` after the runtime checks pass (`docs/architecture/ci-releases-and-rollback.md`, Releases).
- The owner's own Instance runs in the container on the owner's home server, at a public HTTPS address with the owner login, so Grok Bot can reach it.
- **README.** It shows a Paste turning into a Digest and screenshots of the Reader, the Highlights page and a Topic page in three Styles. The media comes from an Instance with a library of public links. The README lists the container and Cloudflare install routes side by side.

## Hosted product (after the first release)

- AI comes from API keys, OpenRouter's Connect, Workers AI or the user's Grok Bot. There is no Claude plan login. Sign in with ChatGPT and an xAI plan login come only after the vendor says they are allowed.
- Reddit Items are Link-only, plus what the user's Extension sends, with no archive fill and no account option, until Reddit gives written consent for a paid service.
- Storing X content in a paid service needs a read of X's developer terms first.
- The price is not decided (`docs/architecture/decisions-and-evidence.md`, The hosted product).

## Later (not in the first release)

- The hosted product (above).
- A desktop app and mobile apps.
- A listing in Grok Bot's plugin catalog, once the way a third party gets listed is known. It needs OAuth on the MCP endpoint.
- Imports from browser bookmark files and from other apps (Raindrop, Pocket, Karakeep).
- Two-way Obsidian sync.
- Digest or resurfacing: the day's new saves, and one old save worth rereading.
