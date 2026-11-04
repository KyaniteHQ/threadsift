# Library: v1 spec

Status: agreed in grill sessions with the owner on 2026-11-03 and 2026-11-04. The visual design is finished: a prototype and a design system built in Claude Design (see Design below). The tech stack is not chosen yet.

## Goal

One web app where the owner pastes a link to something they saved (a Reddit post or comment, an X post, a GitHub repo, an article). The app fetches it, keeps only the useful parts, lets an agent tag and summarize it, and shows everything on one page that can be searched and filtered.

## Decisions

| Topic | Decision | Date |
|---|---|---|
| Intake | Manual paste, one link at a time. No schedule and no bulk import in v1. | 2026-11-03 |
| App type | A web app, run first on a local machine, then on the owner's home server, reachable only on the owner's tailnet. | 2026-11-03 |
| Build or adopt | Own app. Karakeep, Linkwarden, Shiori and Raindrop were rejected as the base (`docs/research/prior-art.md`). | 2026-11-03 |
| Tags | Set only by agents. The UI has no tag editing. | 2026-11-03 |
| Comments | High-pass filter: keep a comment only when it adds something. No fixed count. | 2026-11-03 |
| Layout and reader | Both are app settings, saved per browser. "Layout: List or Grid": List is three panes (filters, item list, reader); Grid is a card grid. "Open items as: Page or Sheet" applies to Grid: Page grows the card into a full-page reader, Sheet opens a centred sheet over the dimmed grid. Under 760px wide, items always open full screen. | 2026-11-03 |
| Look settings | The look is not locked to one preset. The settings also hold Font (5 pairs), Text width (Narrow, Medium, Wide), Density (Compact, Comfortable, Roomy), Comment style (Indented lines, Cards, Rail), Accent (5 colours), Tag style (Chips, Text, Dots) and Card images (On, Off). Defaults: Plex, Medium, Compact, Indented lines, Cobalt, Dots, images on. "Reset look" resets only the Look settings, Style included; Layout, Open items as and Theme stay, and the panel says so in visible text. "Card images" hides the card picture only, never the reader's, and Off does not load the card pictures at all. | 2026-11-03 |
| Style | One more look setting, "Style": Library (default) plus 10 styles taken from refero.design (`docs/design/styles.md`). While a style is on, its fonts and accent replace the Font and Accent settings. | 2026-11-04 |
| Themes | Light, Dark, Sepia and Match system. Match system follows the device; with no setting stored, the app draws Light. | 2026-11-03 |
| Settings storage | All ten settings are stored together in the browser. Each Item's reading place is kept for the browser tab, so reopening an Item returns to where the owner stopped. | 2026-11-03 |
| Tech stack | Not part of this spec; chosen later. | 2026-11-03 |

## Design

The design is done; the app takes its look from these files, not from new design work.

- **Values:** `design/system/tokens.css` is the one source for every colour, size, spacing, radius, shadow, motion and breakpoint value. Each option of each Look setting is a `data-*` rule on the app's root, and the default option is the plain value.
- **Settings:** `design/system/settings.js` is the one settings table: each setting's id, label, root attribute, options, group and default. Every other list (the defaults, the Look settings that Reset look covers, the root attributes) is built from it.
- **Behaviour:** `design/prototype/` shows how each screen behaves: the reader bar drops the key hint, then the position, then button labels until nothing overflows; long comments and code blocks fold; the reading place is restored; the settings panel becomes a bottom sheet with a fixed header and footer under 760px wide.
- **Styles:** the 10 Style blocks exist only in `design/prototype/tokens.css`, because the design system was built before them. Moving them into `design/system/tokens.css` is part of building the app.
- **Breakpoints:** 480, 760, 1080 and 1440px, with 1, 2, 3, 3 and 4 grid columns from the narrowest band up.
- **Accessibility:** every text and background pair is at least 4.5:1 and every mark, border and icon at least 3:1, in every theme with every accent and Style; text is never under 12px; under 480px every target is at least 44px; the open row is marked by a bar as well as by colour; motion has a reduced-motion form.
- **Keyboard:** j and k move through Items, Enter opens, m marks read or unread, / focuses search, the left and right arrows step to the previous or next Item while one is open in Grid, and Escape closes the open Item.

## Ingest flow

```
paste box -> POST /api/items {url}
   -> classify URL (reddit post | reddit comment | x post | github repo | article | other)
   -> fetch (no LLM)
   -> deterministic clean
   -> agent call: comment filter + digest (JSON out)
   -> store; the item shows "processing" until done
```

Fetchers:

- **X post:** the grok CLI, headless: `x_thread_fetch` with the post id, and `x_keyword_search` with `conversation_id:<id> filter:replies` for the replies. No browser and no X login. Tested on 2026-11-03 with grok 1.0.70.
- **Reddit post or comment link:** the URL with `.json` appended, loaded in a browser on the server that is signed in to Reddit. On 2026-11-03 a request without a login got HTTP 403, and a signed-out browser got "blocked by network security", so Reddit needs the signed-in browser.
- **GitHub repo:** the GitHub API: description, topics, stars, last push, license and README.
- **Article:** readable text extraction (Readability-style).
- **Other (YouTube and so on):** stored as a link with its title only.
- **One hop:** when a post links to an article or repo, the fetcher also gets that page's text for the digest.
- **Media:** images are downloaded and stored locally; videos are kept as URLs.
- **Duplicates:** URLs are normalized, and pasting a known URL again refreshes that item.

## Comment filter

1. The script drops deleted or removed comments, bot accounts (AutoModerator and similar) and short replies with no content.
2. The agent keeps a remaining comment only when it adds a fact, a fix, a working link or command, first-hand experience, or a real counterargument. It drops jokes, agreement and repeats.
3. When a kept reply sits under a dropped parent, the parent stays as a one-line Context stub so the tree still reads correctly.
4. X replies follow the same rules.

## Agent output per item

The agent returns one JSON record, stored apart from the fetched content so it can be regenerated without fetching again:

- a clean title
- one topic from a topic list that the agent keeps and grows itself
- up to 3 tags; before creating a tag, the agent checks the existing ones, so near-duplicates do not appear
- a 2-line summary covering the post and what the kept comments concluded
- key points
- the ids of the kept comments

Agent CLI: one headless call per item with JSON output. During the build, a 20-item comparison of `claude -p` and grok picks the CLI by tag quality and run time.

## Storage and search

- Language, runtime, database and libraries are chosen later.
- Stored records: items (source, URL, author, dates, cleaned content), kept comments, media, digests (agent output), topics, tags.
- Full-text search over title, post text, kept comments, summary and tags.
- Read or unread is the only state a user changes.

## Interfaces

- The paste box and agents use the same HTTP API: `POST /api/items {url}` to add, `GET /api/items?q=&topic=&tag=&source=` to query, so an agent (Codex, Grok, Claude) can add or read items without the UI.

## Deployment

- The app runs on the owner's home server as a user service and is reachable only on the tailnet, behind the server's existing reverse proxy and certificate.
- Reddit fetches use a browser on the server that stays signed in to Reddit.
- The app uses a separate Reddit account, never the owner's main account. Reddit's User Agreement (effective July 1, 2026) prohibits scraping without Reddit's prior written consent and lets Reddit suspend an account "for any or no reason", so a ban falls on the separate account. If it is banned, the owner signs in a new one.
- X fetches use the grok CLI on the server, which needs no X login.

## Later (not v1)

- Access from outside the tailnet, behind Cloudflare Access.
- Bulk X bookmark import through one call to a Grok Bot intake webhook. The bot's X connector pages through all bookmarks and folders (X's cap of about 800 is likely, inferred by the bot, not tested) and posts the results back to `/api/items`.
- Reddit backlog import: the owner downloads Reddit's data export for the main account (`saved_posts.csv`, `saved_comments.csv`) and uploads it; the app fetches each listed post through the separate account and never signs in as the main account.
- Digest or resurfacing: the day's new saves, and one old save worth rereading.
