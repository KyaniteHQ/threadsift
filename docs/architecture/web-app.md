# Web app

The web app is a React 19 single-page app built by Vite. One static build serves both install targets: Workers static assets on Cloudflare and Hono's `serveStatic` on the container. The app has no server rendering, because one owner behind a login gains nothing from it.

Two rules shape the code:

- Behaviour that needs the DOM (Reader bar fitting, folding by measured height, the reading place, the keys) lives in plain TypeScript modules that take an element.
- The design tokens, the component styles and the settings table are the one source of values and settings. The settings module builds the defaults, the stored-settings reader and the root attributes from the table's rows. The [spec](../spec.md) owns what each setting does.

## Contents

- [Delivery](#delivery)
- [Settings and fonts](#settings-and-fonts)
- [Screen chunks](#screen-chunks)
- [Read and write deadlines](#read-and-write-deadlines)
- [Library list](#library-list)
- [Reader](#reader)
- [Live regions](#live-regions)
- [Settings page](#settings-page)
- [The Import screen](#the-import-screen)
- [Installable app and share arrivals](#installable-app-and-share-arrivals)

## Delivery

### Static files

Both targets answer `index.html` for a path whose last segment has no `.`, and `404` for any other path that matches no file. A request for `/favicon.ico` or a missing `/assets/x.js` therefore never gets HTML.

Workers' `single-page-application` mode cannot do this, because it answers every unmatched path with `index.html` and `200` (Workers docs, Static Assets, Single Page Application, Configuration). So the Worker leaves `not_found_handling` unset, binds `ASSETS`, and serves `/` itself for a `GET` or `HEAD` of a path without an extension.

- `run_worker_first` lists `/api/*`, `/share` and `/mcp`, so the Worker answers those before any static asset. The setting only decides when the Worker runs. `isServerPath` also sends `/api`, `/api/*`, `/share` and `/mcp` to the Hono app, because `serveDocument` answers a `POST` with 404.
- The container mounts the Hono app before the static files, so `/share` and `/mcp` reach it without a rule. It serves the page with `isDocumentPath` on the pathname of `new URL(context.req.url)`. Hono's `context.req.path` decodes `%2E` to `.`, which would turn the page of a dotted Topic such as `/topics/node.js` into a 404.
- `currentPath` and `pathOf` drop one trailing slash from every page and Item address before anything reads it, so `/log/` opens the Log and `/items/42/` opens Item 42.

### Caching and headers

| Files | `Cache-Control` |
|---|---|
| Hashed `/assets/*` | `public, max-age=31536000, immutable` |
| `index.html` | `no-cache` |

The container sets them in `webRoutes` and compresses with Hono's `compress` middleware. On Workers the platform compresses, and the build writes `_headers` from the same constants (Workers docs, Static Assets, Headers), so the two targets cannot drift. The container answers `/_headers` with the page and never serves that file. `/index.html` redirects to `/` with `307`.

`DOCUMENT_HEADERS` is the one source of the headers on the page. The container sets them on `index.html`, and the build writes them under `/` in `_headers`. That rule covers every page address on Workers, because the Worker answers a path such as `/items/5` with `ASSETS.fetch` of `/`, and the platform applies `_headers` to that response. A rule with a splat would put the policy on every asset too, because the rules of `_headers` add up.

- The Worker's `_headers` adds only `X-Robots-Tag` under `/*` ([HTTP interfaces](http-interfaces.md), Search engines) and holds its other rules under `/assets/*` and `/`, so the manifest and icons get no `nosniff` on the Worker, while the container sends it on every static file.
- `Cross-Origin-Opener-Policy` is `same-origin-allow-popups`, because the app opens no window from script and OpenRouter Connect navigates the page.
- The `file` cache rule keeps a stricter policy for `/api/files/*`, and the document's headers never replace it. The container mounts the API before the static files, and `_headers` never touches a Worker response.
- The app sends no `Strict-Transport-Security`, because it cannot know how an Instance is reached. Whoever terminates TLS sets that header.
- `Referrer-Policy` is `same-origin`. It sends no `Referer` to another site, such as OpenRouter after the connect flow, and still sends `Origin` on a form posted to this origin, which `no-referrer` would turn into `Origin: null`.

`DOCUMENT_POLICY` holds each Content-Security-Policy directive. The reasons the code cannot show:

- `script-src` needs no `'unsafe-eval'`, because the Zod jitless module turns off the `new Function` probe that Zod 4 runs for its object parsers (Zod README, `jitless`). It stays the first import of the entry module, so it runs before any schema is built. Zod catches a blocked probe and falls back, so a later import shows only as `eval` violations in the browser console, which fail the smoke spec.
- `style-src` needs no `'unsafe-inline'`, because Vite writes the stylesheet to a file and React sets `style` through the CSSOM, which the directive does not govern.
- `font-src` carries `data:`, because Vite inlines one JetBrains Mono subset in the stylesheet.
- `img-src` needs only `'self'`. `Picture` renders an image that is not a stored file as a link (`isImageRouteOf`), and card images come from `fileRouteOf`.

## Settings and fonts

### Storage and the root

All twelve settings are one JSON object in `localStorage` under `STORAGE_KEY`. `readStored` checks each key on its own, so one bad value falls back alone.

`html` carries the same `data-theme`, `data-style` and `data-layout` as the app root (the rows marked `onPage`), so the page canvas resolves the same `--bg` in every Layout and Theme. A blocking classic script (no `defer`, `async` or `type=module`) sets those attributes from the stored object before the first paint, so a stored Dark never draws a Light frame. The build emits it as the hashed file `/assets/theme-script-<hash>.js`, linked from `index.html`. The Content-Security-Policy then needs no inline-script hash and no `'unsafe-inline'` for scripts. The cost is one request before the first paint, which the immutable cache answers on every later load.

The browser frame colours are copies of the Library Style's page colour, because a meta tag and the manifest cannot read a custom property. `index.html`'s two `theme-color` tags hold the Light and Dark `--bg` as hex (`#f4f8f7`, `#0e1111`), and the manifest's `theme_color` and `background_color` hold the Light one. A change to the Library neutrals (`--nh`, `--nc`) or to the Light or Dark `--bg` updates these four values in the same change.

### Settings panel

The panel is a `<dialog>` inside the app root and never a portal to `body`. The `data-*` rules of the root reach it that way, and its own `data-font` keeps it in the default type pair.

- Groups. Each single-choice group is a `radiogroup` of native radio inputs, each inside a `<label>` drawn as the segment or the swatch. The browser then gives each group one Tab stop and arrow-key choice, and the label shows the focus ring through `:has(:focus-visible)`.
- Form. From 760px the panel is a non-modal popover (`show()`). Under 760px it is a modal sheet (`showModal()`), because the browser then makes the rest of the page inert and puts the panel in the top layer above `::backdrop`.
- Open state. The panel keeps its open state, its focused control (`data-focus-key`) and the body's scroll position when the Reader place changes (the width crossing 760px, or Open items changed from the panel), so it stays open and shows again in the other form. `ReaderPane` holds that state (`useHeldPanelState`) above the subtree it swaps, because the Sheet's dialog closes before the panel's own cleanup runs and a closed dialog reads a scroll position of 0. The Reader's title does not take focus while the panel holds it (`panelHoldsFocus`).

### Fonts

The design tokens import no font host. Every face comes from a Fontsource package in the build, so a self-hosted Instance makes no third-party request, and the faces use `font-display: swap`.

- The entry module imports the faces of the default Font (Schibsted Grotesk and Commit Mono, also the settings panel's type pair), the IBM Plex pair, and Schibsted Grotesk as the wordmark's face, which no Font or Style changes. Every other family is a dynamic import from the style-faces table, and `useSettings` starts the selected faces in an effect after the first render. A face that fails to load leaves the fallback face in place and does not reload the page.
- `pnpm run check:faces`, run by the `design:check` task, fails the gate when a font stack starts with a family that the faces of its Style or Font do not provide, or when a row loads a face that no stack names. It also fails when the wordmark's stack (`--f-brand`) is declared anywhere but once in a top-level `:root` rule, so a Font or Style could change it, or starts with a family that the entry module does not load. Each mistake would show the fallback font with no error. The check covers no weights or italics.
- The wordmark keeps its width when its face arrives. Until Schibsted Grotesk loads, it draws in `Schibsted Grotesk Fallback`, a local Arial Bold or one of its metric twins, Liberation Sans Bold and Arimo Bold, with `size-adjust` and the ascent, descent and line-gap overrides set from Schibsted Grotesk at weight 600. The wordmark sets `text-rendering: geometricPrecision`, because Chromium on Linux otherwise hints the fallback to whole pixels and the widths differ by up to 3px at 24px. In Chromium 156 on Linux, with Liberation Sans Bold and the Schibsted Grotesk files blocked, the masthead wordmark measures 115.75px at 24px and 144.69px at 30px, the same as with the face loaded. A device with none of these fonts, such as an Android phone, draws `system-ui` first, and the wordmark changes width when the face arrives.
- The page preloads the Latin file of Schibsted Grotesk, the only file the wordmark needs. Vite rewrites a `<link href>` in the page source to the hashed asset address when the link names the file by a relative path into `node_modules` (Vite docs, Features, HTML); a bare package name stays as written. The Vite dev server does not rewrite it, so in development the preload fetches the page instead and the browser reports an unused preload.
- Fontsource's variable packages name their family with a `Variable` suffix (Fontsource docs, Variable fonts). Each font token names `'<Family> Variable'` first and the plain family as the fallback, and a family that has only static packages registers the plain name.
- Imports keep all package subsets, so saved text can use the supported scripts.

## Screen chunks

The Settings, Obsidian, Import, Proposals and Log screens load through React `lazy` from one `LOADERS` table. A new lazy screen goes into `LOADERS`, which also lets the entry module start its chunk when the address names it, so a reload does not wait for the session answer first.

- One `ModuleBoundary` handles only failed module loads. It shows `Unreachable` with Try again, which reloads the page.
- Set the route and the session view only inside a transition (`useFlow` with `inTransition`). The current screen then stays until the next screen's chunk arrives, and an update outside a transition would hide it behind the fallback ([React, Suspense](https://react.dev/reference/react/Suspense)).
- The Vite config has two `codeSplitting` groups. `zod` holds Zod and its jitless module, so jitless is set before any schema is built. `shared` holds each module that two chunks share, because Rolldown's automatic splitting makes one common chunk per set of importers ([Rolldown, Automatic code splitting](https://rolldown.rs/in-depth/automatic-code-splitting)) and the entry loads all of them before first paint.
- After a change to these groups, run `pnpm build` and count the `modulepreload` links in the built `index.html`. Each one is a file that the first paint waits for.

## Read and write deadlines

`call()` is the only place the web app uses `fetch`. It gives every `GET` an abort deadline, `READ_DEADLINE_MS`, so a read that the Instance never answers ends in the screen's failed state with Retry or Try again and not in a loading state with no end.

A write needs a deadline of its own. Headless Chromium 156 kept a `POST` to a server that never answers pending for 420 s, when the measurement stopped. `post()`, `put()`, `patch()` and `del()` therefore take the deadline as a required argument, so the type checker refuses a write that names none. The argument is a value from the write-deadlines module, or `NO_DEADLINE`. Each value is the bound of what the route handler waits for plus a margin (`MARGIN_MS`, equal to `READ_DEADLINE_MS`), and the wait constants come from contract modules the server also reads, so a change there moves the deadline with it. [Jobs, leases and the schedule](jobs-leases-and-the-schedule.md) owns the server's deadlines. A write that only touches the database gets the margin alone (`DATABASE_WRITE_DEADLINE_MS`, 20 s), a Paste gets `PASTE_DEADLINE_MS`, and the Import batch gets `IMPORT_BATCH_DEADLINE_MS`.

The Import batch carries up to `IMPORT_BATCH_LINKS` links, which fit its deadline at the time of one short link (2 fetches, each at most `HOP_DEADLINE_MS`). `IMPORT_BATCH_PATIENCE_MS` is the longest legitimate wait of a batch (about 15 minutes), so no request deadline can sit above it. These values are arithmetic from their sources, not runs of 7 slow short links, and a short link with more hops, or a link that waits on the full `FETCH_DEADLINE_MS`, can still pass the deadline. The recovery below covers it. The route takes up to `BATCH_LINKS_MAX` (100) links, a limit chosen for the Worker's query and subrequest counts ([Data model outline](data-model-outline.md), Limit of 100 links), and a routine may send that many.

Only the Restore part uploads and the Restore start call use `NO_DEADLINE`, because a part's time depends on the owner's link.

### A deadline that runs out is not a failure

The work may still be running or may have landed. The screen reads the state from the server again and settles on the state of the operation that timed out.

- Accept is a database write. When its deadline runs out, the screen reads the Proposal (`GET /api/proposals/{id}`) up to `UNDECIDED_CHECKS` times, `POLL_MS` (3 s) apart, while the row stays pressed. A state of `accepting` shows the row as applying. A Proposal still `open` after the last read shows the failed state with Try again. A Proposal that is gone, `rejected` or `declined` after Accept, or a `not-current` answer, shows the already-decided note. Reject uses the same check, and the Proposals page polls applying rows silently until none is applying.
- Import batch. Before each batch the run reads `GET /api/imports/{name}` for `cursor` and `updatedAt`. After its first batch it expects the cursor it wrote last. Another cursor means a second tab or routine moved it, so the run ends as `stopped` at the saved position and Continue resumes from there. The request carries the cursor it read as `import.previous`, so `saveImport` moves the saved cursor only from that value, and a batch still running when the run ends cannot move the cursor back over a later one.
- Landing check. When the request reaches its deadline, `batchLanding` reads the state again, `POLL_MS` after each read ends, until the batch counts as saved: the cursor reaches the batch's end and `updatedAt` is newer than the value read before this attempt, so a cursor that an earlier run left does not count. The wait ends when:
  - the owner presses Stop (an `AbortSignal` ends the pause and the read together, and one last read still counts a batch that landed),
  - `CURSOR_READ_FAILURES_MAX` (3) reads in a row fail, which ends the run as `network`,
  - `IMPORT_BATCH_PATIENCE_MS` passes, which ends it as `unconfirmed`, the failed state that says the batch did not land, with Continue. The loop checks this bound once per iteration, so the run can end up to about 43 s later (`READ_DEADLINE_MS` plus `POLL_MS` plus `READ_DEADLINE_MS`).
- Counts. A batch that landed after its deadline adds nothing to the counts, because only the answer carries them. The run keeps the number of those links in `Progress.uncounted`, and the screen shows `uncountedLabel` under the counts note.

### What a failed state after a write means

The Instance may have stored the change, may not have, or may have stopped half way. On the container the handler keeps running after the browser ends the request. On Cloudflare the request's work may be canceled when the client disconnects ([Workers limits, Duration](https://developers.cloudflare.com/workers/platform/limits/)), and the Worker passes nothing to `ctx.waitUntil()`, so a handler still running at the deadline can stop before its last write.

Two kinds of request read the request's signal and stop on a disconnect instead. The Settings verify and test routes (AI Verify, Grok Bot Test, and the GitHub, Vault mirror and Reddit account Verify) pass the signal to their upstream request. An MCP request's transport closes on a disconnect. Its `add` tool passes no signal to the save, so on the container the save runs to its end, and on Cloudflare the save can be canceled as above. On Cloudflare, `request.signal` aborts on a client disconnect only for a compatibility date of 2026-11-17 or later or with the `enable_request_signal` flag ([Workers, Request](https://developers.cloudflare.com/workers/runtime-apis/request/)). The Worker's configuration sets the compatibility date 2026-11-19, so it needs no flag. The abort on a deployed Worker is not verified ([Open items and unverified claims](open-items-and-unverified-claims.md), Deploy and update on Cloudflare).

A read-state write and a token budget save send an absolute value, so one that timed out can still land after a later one and leave the stored value different from the screen until the next read. That needs an Instance that holds one request for more than 20 s and answers the next one first. Every other caller treats any rejection as its screen's failed state with the action offered again. [Changing code](../agents/changing-code.md) says how a repeated write accepts the answer of its first try.

## Library list

### Pages and the cursor

`GET /api/items` answers at most `PAGE_SIZE` (50) Items and `next`, the cursor of the page after, so a page is bounded whatever the library holds. A single read of a large library could cross D1's 50 MB result cap (about 100,000 Items at the 503 bytes one Item answered in a measured library of 3,000 Items; a guess, because the cap counts D1's rows, which the JSON only approximates).

The cursor is `<saved date>.<Item id>`, and it names a position and not a record.

- The id breaks a tie between Items saved in the same millisecond, so a page edge inside such a run neither repeats nor skips an Item.
- The Item id is never reused and `saved_at` is written once at insert. A delete, a refresh, a Digest or a Read state change between two reads therefore moves no later page, an Item saved after the first read is newer than every cursor, and a cursor survives the deletion of the Item it names. A Restore keeps every id and `saved_at`, so an old cursor names the same position afterwards.
- A cursor the server did not give is accepted when its two numbers are safe integers. Any other cursor is a 400.
- The counts (`countQueries`) run in the batch of a read with no cursor only, because each scans the whole `items` table. They cover the whole library, so the filter pane and the header stay true while the rows come in pages.

### Pages in the browser

`ListState` keeps the pages the browser has read, and `items` is always the newest-first start of the library for the filters in `query`. A late answer from an older generation of reads is dropped, so a write that asks for a reload never meets stale rows. Each generation holds one abort signal from the screen's ticket (`useTicket`). A new generation aborts it, which drops the late answer and cancels that generation's requests, so each key of a search cancels the read of the text before it. The signal is a required argument of every list read, so the type checker refuses a read that names none. The Highlights, Proposals, Index and Log pages and the Topic page follow the same rule for their first read, Load more and reload, and leaving a page aborts its open reads. The abort ends the browser's side, and an answer that still arrives is dropped. Whether the handler still runs depends on the install target, as [What a failed state after a write means](#what-a-failed-state-after-a-write-means) says ([measurement](decisions-and-evidence.md#aborted-list-reads)). A reload reads the first page and then the pages after it until it passes the last row the list had loaded, and replaces the rows by Item id, so the owner keeps their place. A new Item is placed by its saved date and id, and not at all when it belongs to a page not yet read. An Item absent from the loaded list is read through `GET /api/items/:id/status` and kept apart, so opening it needs no intervening pages.

A Paste of a link the library already holds opens its Item at `/items/<id>`, as does a known-link share that arrives at `/?refreshed=<id>`. A new-link share at `/?saved=<id>` keeps the library and its paste card.

### Item polling

The library reads `GET /api/items/:id/status` for each `processing` Item (`useItemPolling`): the first 10 reads of an Item once a second, then every 5 seconds. The app has no websocket, so both targets serve it the same way.

- Reads of one Item never overlap, and the read count belongs to the Item, so a new `processing` Item does not start the others' reads over.
- An Item whose `wait` names a `retryAt` is read next at `retryAt`, at most 60 seconds ahead (the sweep period, a chosen bound).
- A 404 means the Item was deleted elsewhere, so the library drops it and never reads that id again. A hidden tab makes no reads.

### Writes from the list

- A failed list read, including a reload after a write, shows the load error with Try again (`useListRead`), so the owner never reads stale rows silently.
- Read state writes go one after another for each Item. A press computes its wanted state from the last wanted state still in flight, so two presses of `m` before the first answer send `read` and then `unread`, and the older answer cannot be the last one applied. `PUT /api/items/:id/read-state` changes no other column, and a Paste refresh and the Digest job never write it.
- Attention never steals focus: an attention that asks for focus waits for its row only while the rows on screen were read for other filters than the ones in use, and once the rows match the filters and none is the row, it is dropped, so a row that appears later never takes focus from the owner (`useOpenItem`).

### Cold load

Rows and the Reader appear when their data arrives, and the page accepts reflow when a font face arrives so the saved text does not wait for fonts. Every visit starts with the list-loading layout, and an empty library switches to the empty layout after the read, because no previous list state is stored. The Reader head stays inert, out of flow and at opacity 0 while Item data or its Markdown chunk is pending, and `useFocusMoved` keeps a late Reader response from taking focus after the owner chooses another control.

## Reader

### Places

`data-reader` on the app root is `pane`, `page` or `sheet`. Under 760 px it is always `page`, and in List the Reader then covers the screen, the list column is `inert`, focus moves to the Reader's title, and the back control returns focus to the row.

- Sheet is a modal `<dialog>` that holds the Reader's slot and the Previous and Next buttons, because only a descendant of the dialog sits in the top layer above its `::backdrop`.
- Closing goes through the address like every other close, so Escape, the back gesture (`cancel`) and Close all end in `/`. Opening an Item pushes a history entry that records the path it came from, and j, k, Previous and Next from an open Item replace the entry. A close goes back one entry when that path was the library, and replaces the address with `/` for an Item reached directly, so browser Back never reopens a closed Item. Two fast closes go back one entry, because `history.state` keeps the old `from` until the first Back lands. `leave` holds the conditions.
- Layout change. A change of Layout from the panel clears the open Item in the same event (`onLayoutChange`), because List opens its first unread Item on its own and, in Grid, that Item would cover the panel that just changed the Layout.
- Paste card in Grid. From 760 px the card floats under the header, as [the design system](../../DESIGN.md) (Elevation & Depth) says. A card in the page flow would move every card down and back up on each Paste.

### Motion

A covering Reader (Grid Sheet, Grid Page and every layout under 760 px) grows from its card and runs back into it through React's `<ViewTransition>` ([React, ViewTransition](https://react.dev/reference/react/ViewTransition)). React starts the view transition itself when a transition commits, so the route writes stay inside `startTransition`.

- React animates a shared element only between a named boundary that unmounts and one with the same name that mounts in the same commit, and refuses two mounted boundaries with one name. `SharedItem` therefore names the boundary per Item, wraps each listed row except the open one, and wraps the Reader slot. An open removes the row's boundary as the slot's mounts, and a close does the reverse, so the row's content mounts again on each.
- The open and close writes carry the transition type `READER_MOVE` (`addTransitionType`). The page's own cross-fade runs only under that type, because a step with j, k, Previous or Next also moves a boundary, from the row it reaches to the one it leaves, and React then starts a view transition with nothing to animate.
- React skips view transitions that start inside a `popstate` event ([React, ViewTransition](https://react.dev/reference/react/ViewTransition), Building View Transition enabled routers). The route sets the path from `popstate` in a later task, so a browser Back that closes the Reader runs it back into its card too.
- Under reduced motion, and in the List pane, nothing is wrapped, so no view transition starts.
- Two opens before the first commits leave one history entry: an open whose address is already an Item that the screen does not show yet replaces that entry.
- `devenv tasks run --show-output motion:worker` counts, in each covering place, the opens that grow, the closes by Escape and by browser Back that run back, and the view transitions under reduced motion.

### Loading and staleness

When `useItemDetail` fails to read `GET /api/items/:id` again and the Reader still holds an answer for the same Item, it keeps the body and marks it `stale`. The Reader then shows `READER_STALE` and Try again above the Summary, so the header (from the list) and a body from an earlier read are never shown as one current Item.

### Reading place

The Reader restores its reading place once, after its text and `document.fonts.ready` settle. `READ_DEADLINE_MS` bounds the wait, so a font that never answers cannot prevent restoration, and the text renders while the restore waits. The Reader scrolls its slot to the top when the Item opens. From then on it records whether the owner scrolled. Input a person makes (`wheel`, `touchmove`, a scroll key pressed while focus is inside the slot, or a press on the slot's own scrollbar) arms the record. The record counts the owner's scroll when the slot's `scrollTop` differs from its value at the previous `scroll` event of the slot, in a `scroll` event or when the restore or the close reads it before that event arrives. The comparison uses the last `scroll` event and not the moment of the input, because a `wheel` or `touchmove` listener is passive and the compositor can scroll the slot before the listener runs. Space on a button or a key in a text field arms the record but scrolls nothing, so `scrollTop` stays at its last value and nothing counts. A scroll the browser made to a focused control before the record was armed counts neither, because it moved the last value without an input. Home after such a scroll counts, also when it jumps to 0. The record stays armed, so a later scroll the browser makes alone, such as one to a focused control after a key that scrolled nothing, counts. The `scroll` event that the browser queues for the Reader's own reset arrives before any input arms the record, so it never counts, and the restore stops listening before it scrolls. The restore runs unless, after an input armed the record, the slot's `scrollTop` moved from its value at the previous `scroll` event, so a reader who started to scroll keeps that position, even after scrolling back to the top. A reader who scrolled and closes the Reader or opens another Item during the wait has that place saved, and one who did not scroll keeps the saved place.

A reading place lives in `sessionStorage`, so each tab keeps its own. The tab keeps the last `PLACES_MAX` places it saved (a chosen bound), ordered by their last save, and drops the oldest first. The stored value is a list of pairs of Item id and place. The read also accepts an object keyed by Item id, the form an earlier build wrote, so a tab that is still open keeps its places across an update. Those converted places have no save order and sit ordered by Item id until the next save. It holds the block index, the fraction and the offset, and the first 80 characters of the block's text with white space collapsed. Restoring uses the block at that index only when its text still starts with the saved text. Otherwise it scrolls to the first block that does, and when none does the Reader stays at the top. A refresh, a new Digest or a different comment selection that adds or removes blocks therefore never lands the owner on unrelated text.

The place anchors on `.md > *`, so a Kept comment's blocks are anchors like the post's. A block with no visible part, or whose visible part is above the reading edge, is never chosen as the anchor, and a saved anchor whose point is clipped on return scrolls to its comment's fold box.

Once the Reader watches the slot, it saves the place `SAVE_DELAY_MS` after the last `scroll` event of the slot. It watches after the restore, or at once when the address points at a Highlight or the Note of the Item. It also saves on `pagehide`, when the Reader closes and when another Item opens. Every save measures the slot with `anchorAt` at the moment it runs. The save while reading and the save at the close therefore store the same place for the same scroll position. They differ when the slot or its layout changed between them, and the close then keeps the place the screen showed when it closed.

On the page Reader in Chromium, focus that reaches a control of the sticky Reader bar scrolls the slot up by half its height. The measured cases are `focus()` on the back control, Shift+Tab from the Reader's title, and the return of focus to the gear after Escape closes Look settings. The control sits inside the slot's `scroll-padding-top`: with that padding at 0, nothing moves. Playwright's `click` moves the slot the same way, because its first attempt scrolls the target into view before it presses. A mouse press, a touch tap and an Escape that closes the Reader move nothing ([measurement](decisions-and-evidence.md#reading-place-at-a-close)).

### Post text renderer

The renderer is `react-markdown` with `GFM_PLUGINS`, loaded as its own chunk (`PostText`) next to a shared chunk that holds the Markdown parser both the renderer and the text projection use. `postTextReady()` starts the import the first time a Reader renders and caches whether it loaded, so the sign-in screen and an empty library never download it.

- It builds React elements and drops raw HTML by default, so the app has no `dangerouslySetInnerHTML` and no sanitizer of its own.
- `urlTransform` keeps only `http`, `https`, `mailto` and `#` links, and `readerUrl` also lets the file-route paths of stored images through.
- An image shows as an `img` only for a stored file of the open Article (see Showing images in the [Data model outline](data-model-outline.md)), and as a link otherwise.

The Reader waits for the chunk with `use()` only when `drawsMarkdown` says the Item draws Markdown: post text, or a comment the comment tree shows. An Item with neither, such as a Link-only Item or a thread whose shown comments are all Context stubs, opens without it. The lazy renderer shares the same import promise. When the chunk does not load, the Reader that needs it shows its failed notice, and its Try again reloads the page, which is what Vite documents for a failed dynamic import ([Vite, Load Error Handling](https://vite.dev/guide/build#load-error-handling)). A retried `import()` is not enough: in headless Chromium (2026-11-09) a second `import()` of a chunk whose first request failed sent no new request, and after a deploy only new HTML names the new chunk. Not verified: Firefox, WebKit, browsers that ship the HTML Standard change that stopped caching HTTP error answers in the module map ([whatwg/html#6768](https://github.com/whatwg/html/issues/6768)), and a chunk that is missing after a deploy.

### Comments

- `standingOf` and `countOf` are the one definition of the count and its label. `viewOf` builds the section line from them, `commentCountOf` builds the row and the bar button, and the row's columns (`COMMENT_COUNT_COLUMNS`) hold the raw counts.
- Replies nest as lists inside their parent's list item (the WAI nested-list pattern), because the section is read top to bottom and holds links and buttons. The ARIA `tree` role is for a widget with arrow-key selection.
- A folded body stays in the accessibility tree so its preview is read. Keyboard focus (`:focus-visible`) landing in it opens the comment, so a link below the preview never takes focus while `aria-expanded` says false.
- The bar's Comments button has three forms (full, `N of M`, `N`) that `fitBar` switches with the other parts. On a phone the last two steps first narrow the gap between the actions (`.rd-bar.tight`), because six 44 px controls need it below 332 px. They then show only the number, without icon or side padding (`.rd-cm.digits`), because a Kept count can reach 2,000 (`KEPT_COMMENTS_MAX`) and `1,000` needs 35 px at the default size, which only the 44 px control without padding holds at 320 px.
- A press of the button while the Reader still loads waits for the heading to render and then jumps. A later press replaces that wait, and any focus move before the heading renders, or a load that ends without a Comments section, drops it.

## Live regions

A live region that is inserted together with its text is not reliably announced. A region that reports the result of a press or of a read the owner can try again therefore mounts empty first, and an empty alert takes no space (`[role="alert"]:empty`).

- Paste box. It mounts a polite `<output>` and an empty `role="alert"` element before any status arrives and writes every status into one of them. The card has no live role. While a Reader Sheet covers the paste box, its status goes through `FieldAnnouncer`, and `useFieldAnnouncementsIn` mounts that region inside the Sheet, because a modal dialog makes regions outside it inert. The Added, refreshed and failure cards close themselves 6 s after they show, held while the pointer or focus is inside.
- Counts. The count lines of the Library list and the Highlights page have no live role, because their search text changes on every key. `SettledAnnouncement` reads the settled count instead, after `ANNOUNCE_SETTLE_MS` (500 ms, a chosen bound), once the answer matches the current search and filters. While the Reader covers the list column, it follows the count silently, so closing the Reader does not replay it.
- Reader. Its announcer (`useAnnouncement`) stays separate, because marking an Item read changes the count, and a shared region would replace "Marked as read" with that count.
- Notes after a press or a failed read. The Proposals row (`Actions`), the Note box, the Topic overview, the Reader's failed and stale lines (`ReaderNotices`), the failure of a Keep or Remove of a Highlight, the failed Load more of the Library list and the Retry notice of every list screen (`RetryNotice`) keep their `role="alert"` element or `<output>` mounted and empty, and fill it when the text arrives. `[role="alert"]:empty` and `output:empty` leave the layout, so an empty region adds no gap. In Grid, `RetryNotice` marks its region `notice-slot`, which spans every column of the card grid. `AlertRegion` and `StatusRegion` draw the note and the Retry button of the Reader's two lines, the Topic overview and the failure of a Keep or Remove of a Highlight, and hold the button inside the region, so a screen reader reads the button's name with the note.
- Regions that mount with their text. A region that is the first content of a screen or a pane mounts with it: the Reader's loading line, the loading label of a list, the sign-in and Setup notices, the OpenRouter notice and the Import summary. The first Reader of a page load can mount after its read failed, when the text renderer chunk is still loading, and then shows the failed line with its text.
- Forms. `FieldAnnouncer` mounts one polite region for the whole app. A required field the owner leaves empty is read there once after `ANNOUNCE_SETTLE_MS`, and the line is retracted when the field is filled or unmounts.

## Settings page

### Load

`useSettingsLoad` reads the data of every section together. `SettingsPage` shows a ghost placeholder under the bar until every read has answered or failed, then mounts every section once, each taking its first answer as a prop. A section's loaded height depends on the answer (the URL help shows only on the Worker, a Provider decides how many fields show, a missing sealing key adds a note, the token list grows with its rows, a failed read shows an alert), and a placeholder sized by a guess would still move the sections below it. A read past `READ_DEADLINE_MS` counts as failed for that visit, and its late answer is ignored.

`useHashTarget` scrolls the page to the section named by the hash once its sections have loaded, and again once the Restore block has its status. It moves focus to that section's heading unless focus is already on another control.

### Refusals

`useActionFlow` takes one fallback text per action, so a press that fails without a known reason names the button pressed. A Save or Connect button with nothing to act on, and a Verify or Test button that has no help line, keeps `aria-disabled` and still takes the press. `useAction` gets an `Unavailable` text, and a `refuse` event shows it in the section's result line without starting a request and without touching a request already running. A blocked submit button carries `formNoValidate`, so a required empty field does not hide the reason. `SettingsResult` keeps its `<output>` and `role="alert"` elements mounted and empty, and keys the text by press, so a repeated refusal is announced again.

While nothing is saved, the Verify and Test button of the AI, GitHub token, Grok Bot and Reddit account sections stays unavailable, and `SettingsActions` shows the reason as a help line tied to the button with `aria-describedby`, so it is read before any press. The Remove or Disconnect button of the GitHub token, Grok Bot, Reddit account and Obsidian sections does the same while nothing is saved, and the Obsidian page shows that reason in the help line instead of its status line. A row draws one help line for each different reason and ties each button to its own, so Verify and Remove can show two reasons together, and equal reasons show once. A button blocked for the reason a help line states, such as Save on the Obsidian page when the Instance has no sealing key, is tied to it too. A Verify, Test, Remove or Disconnect button with a help line takes no press. A Save button with a help line still submits the form, and the refusal also shows in the result line. For every other blocked reason, such as an unreadable saved value, the press stays refused with the reason in the result line.

### GitHub token section

The section's three steps carry one link that opens GitHub's new fine-grained token page already filled in, as [GitHub token](../guides/github-token.md) describes. The link omits `target_name`, which has a known bug ([community discussion 188111](https://github.com/orgs/community/discussions/188111)). The buttons are named Save token, Verify token and Remove token, because the AI section's Save and Verify share the page and every control needs its own name.

### Reddit account section

For the states `none`, `expired` and `unreadable`, the Extension button leads the section as the primary action, above the paste field, whose lead line says pasting is the other way. Disconnect is allowed for `missing`, because the route needs no key. The status line of `none` and `expired` follows the archive fill choice of the section above, which `RedditSections` passes down through `ArchiveFillContext`, and while that setting failed to load it names the archive fill only as a condition, Reddit archive fill On, and states no outcome. The relay module posts one message with a new id to its own window and waits 3 s for the Extension's content script to say it works, then up to 35 s for the new state. The protocol is in [Extension and Threadsift bot](extension-and-threadsift-bot.md), Connect Reddit.

### Backup section

`useBackup` polls running exports through the shared `usePolling`. One `<output className="bk-state">` stays mounted in every state and only changes its text. A running export shows no percentage, because the total is unknown while it runs.

`GET /api/export` returns only `gave-up` and `list-changed` as failures (`SHOWN_EXPORT_FAILURES`). The web app has no text for `cancelled` and `replaced`, because `exportStatus` answers `none` for both. Start export tolerates a 409 (another tab started one), Delete export tolerates a 404, and each reads the state again as its own step. A read that fails after a press that succeeded shows `EXPORT_TEXT.loadFailed` in the result line, so a successful press never shows the failure line of the button pressed.

### Restore block

`RestoreBlock` reads `GET /api/restore` itself, because the Export state and the Restore state are two reads. [Export, backup and restore](export-backup-and-restore.md) owns the server's behaviour.

- Upload. The block cuts the chosen file into parts of the size the server answers and sends them one after another, with one attempt each and no client deadline. After a reload, choosing the same file (the same size and, when this browser stored it, the same name and modified time) sends the missing parts only, and another file is refused with its own text.
- Refusals. A refusal of the zip arrives as the `failed` state with its code, so its text shows while the page polls and after a reload. A part or the start that the Instance refuses with `not-uploading` (another tab cancelled or started the Restore) shows that code's text.
- Buttons. Cancel shows while the upload waits, while the Restore runs and after it failed. Resume shows after a `gave-up` failure with every part stored. While a cancel runs, the page shows the removal line and no button, and a cancel that failed 3 times offers Cancel again.
- Picker. `offersPicker` shows the file picker only while the library is empty and the Restore is not running or cancelling, and not after a `gave-up` failure, because `POST /api/restore` refuses a second upload while that run holds the library.
- A finished Restore adds a line with the number of files the zip lacked when it is above 0. A stored picture that fails to load shows a link to the image's original web address when the Item holds one.

The texts come from the copy script ([Changing code](../agents/changing-code.md), Interface text).

## The Import screen

The browser reads the pasted text or the chosen `.csv` or `.txt` file, so the Instance receives only links.

- `parseImportList` keeps every character of a URL that stands alone in a line or field, so `https://en.wikipedia.org/wiki/SQLite_(database)` stays whole. Only a line with other words around its address drops trailing punctuation.
- `runImport` sends batches of at most `IMPORT_BATCH_LINKS` links that also fit the 64 KiB body limit of `POST /api/items/batch` (`nextBatch`). The cursor counts links done, so a failed call stops at the last saved cursor and Continue sends from there. A batch whose request reaches `IMPORT_BATCH_DEADLINE_MS` is read from the saved cursor again, as Read and write deadlines describes, and a recovered batch counts as saved only when its own write moved the cursor.
- A file read that finishes after newer input or a started run is dropped (`useImportInput`). The list input stays read-only during a run, and Stop aborts its wait (`useImportRun`).
- The Import name needs `crypto.subtle`, which browsers offer only in secure contexts. The `__Host-` session cookie already limits the signed-in app to HTTPS or `localhost`.
- The plan Provider notice reads `GET /api/settings/ai`, which can wait up to 15 s for the `claude auth status` probe. It sits below the run controls, where its late arrival moves nothing, and it never blocks the run.

## Installable app and share arrivals

- Installable app. The app has no service worker. Chromium 156's installability code has no service-worker requirement, web.dev's Install criteria list none, and a `POST` share target that the server handles needs none. A service worker would only add offline handling, which the app does not offer. The share route runs on both targets, so `/share` is in the Worker's `run_worker_first`. The icons are the brand's ([the design system](../../DESIGN.md), Brand Brief, Quarto). After a change to the icon source in the design system, `pnpm run build:icons` writes the favicon, the manifest's icons, the Apple touch icon and the Extension's icons again; it renders them in Chromium through Playwright, so the files stay in the repository and neither build draws them. Running it is a manual step after each edit of the icon source, and no check compares the committed icons with the source, because the generator needs Chromium, which the CI `check` job does not install.
- Share arrivals. `App` reads the address once and removes the query with `history.replaceState`, so a reload or Back never repeats it. The arrival (`?link=` with a notice, or `?saved=`) stays until the owner edits the box or a save succeeds, so a wrong password, a sign-out and a second sign-in keep the link and write nothing. A save that starts does not release it, because a save that ends in a sign-in screen unmounts the paste box and the link must come back after sign-in. The address only selects what to show and never saves, so a forged address writes nothing.
