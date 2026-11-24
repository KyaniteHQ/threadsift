# Data model outline

The Drizzle schema lists every column, index and constraint. The rest is here: how each record is identified, what ends it, what survives a refresh or a Restore, and why a rule holds.

- [Conventions](#conventions)
- [Tables](#tables)
- [Highlights](#highlights)
- [Media](#media)
- [Showing images](#showing-images)
- [The Note](#the-note)
- [The Highlights page](#the-highlights-page)
- [The library wiki](#the-library-wiki)
- [Proposals](#proposals)
- [Item identity](#item-identity)
- [Short-link aliases](#short-link-aliases)
- [The import cursor](#the-import-cursor)
- [Catalog keys](#catalog-keys)
- [Deleting an Item](#deleting-an-item)

## Conventions

- A limit here with no source named is our choice.
- A table described as one row has a `CHECK` on `id = 1`.
- An `AUTOINCREMENT` id is never reused, so a stored id names one record for the life of the Instance. A Restore writes the high-water mark of each counter back.
- Every column that references `items(id)` declares `ON DELETE cascade`, because a reference with no action makes the delete of an Item fail with `FOREIGN KEY constraint failed`.
- A table module imports the table modules it references and the constants modules that hold its enums, and never the schema module that re-exports every table, so the table modules form no import cycle.
- Post text and comments are stored as Markdown. The Reader renders it without raw HTML.

## Tables

### Items and their content

| Table | What it holds |
|---|---|
| `items` | One row per Item. `normalized_url` is the one unique identity (Item identity). |
| `item_aliases` | One row per short link that made or reached an Item (Short-link aliases). |
| `github_repos` | One row per GitHub repository Item. `topics` are GitHub's, not Threadsift Topics or Tags. |
| `reddit_threads` | One row per Item and content generation that has a Reddit or X thread. |
| `reddit_comments` | One row per comment or `more` stub, in tree order. X replies use it too. |
| `x_verifications` | One row per X Item whose thread waits for the check against X. |
| `media` | One row per image or video of an Article, and per photo of an X post (Media). |
| `digests` | One stored Digest per Item. |
| `topics`, `tags`, `item_tags` | The agent's lists and the links. A `key` is unique and derived from the name (Catalog keys), and a name never changes after the row is created. `catalog_version` (one row) counts changes to the lists. |
| `topic_pages` | One row per Topic, keyed by the Topic's id. |
| `topic_checks` | The membership text each Topic had when the weekly disagreement run last stored it. |
| `related_items` | One row per pick. Both Item ids cascade on delete. |
| `log_entries`, `log_start` | One row per committed library change, and the one row that holds when the Log began. |
| `highlights`, `notes` | One row per Highlight, and one row per Item whose Note was ever saved (no row means revision 0, The Note). A Highlight stores no revision, because every publication anchors all of an Item's Highlights against the text it displays. |
| `search_parts` | The FTS5 source rows (Database and search). |
| `imports` | One row per batch-call cursor (The import cursor). |

- **`items`.**
  - `added_by_token` holds no foreign key and token ids are never reused, so it stays a plain number after the token is revoked. The Daily budget counts an agent token's Items by it and by `saved_at`.
  - `post_text` holds up to 1,000,000 bytes. A longer text is a file that `post_text_key` names, and a row never holds both.
  - `reason` is the failure marker and the only stored part of an Item's status. The Item view derives `processing` and `ready` from open jobs (One Item status rule in [Jobs, leases and the schedule](jobs-leases-and-the-schedule.md)).
  - `fetch_result` stays null until a fetch stores its result, and a fetch that gives up leaves it null. Every write of the fetch result sets `x_note`, which names why an X link was not read.
  - The unique index `items_id_source` on `(id, source)` looks redundant next to the primary key. SQLite accepts a composite foreign key only onto a unique index on exactly its parent columns, and `reddit_threads` and `reddit_comments` reference `(id, source)`. Without the index every thread insert fails with `foreign key mismatch`.
- **`reddit_threads`.**
  - The identity is `(item_id, generation)`. A new content generation, such as the Extension's Save, writes a new row. The older generation's row and comments stay only while the Item has a published Digest, because the Reader keeps showing the published comments. A Digest that publishes for the new generation deletes every other generation.
  - `archived_at` is the fill time of an Arctic Shift fill, and null for a thread that the Extension, a `.json` Paste, an X Paste or the connected Reddit account sent.
  - `linked_url` is the candidate link for the Digest's one hop, read for the Item's current generation (`candidateLink`). `post_link` is the address a Reddit link post points at, read from the newest generation. The candidate differs: it skips video and Reddit or X addresses and falls back to the first link of the post text.
  - The foreign key `(item_id, source)` to `items(id, source)` refuses a row that names another Source than its Item.
- **`reddit_comments`.** `eligible` is false for a deleted or removed body, `AutoModerator` and a bare agreement such as "this" or "thanks". A Digest publication sets `kept` on eligible rows only and deletes every older generation in the same batch.

### Settings and integrations

| Table | What it holds |
|---|---|
| `settings` | The Provider setting, one row. |
| `ai_settings_revision` | The count of changes to `settings`, kept by triggers. |
| `openrouter_connect_transactions` | The pending OpenRouter Connect attempts, removed with the session that started them. |
| `github_settings` | The owner's optional GitHub token. No row means anonymous reads. |
| `github_cooldown` | The time before which the Instance sends no GitHub request. |
| `grok_bot_settings` | The owner's Grok Bot, one row. No row means no Grok Bot is set up. |
| `x_settings` | The owner's choice of the reader of X links. No row means `auto`. |
| `reddit_settings` | The owner's Reddit settings. No row means the archive fill is on. |
| `reddit_account` | The owner's own Reddit account with its session cookie. |
| `vault_settings`, `mirror_notes`, `mirror_files` | The Vault target, the lease, the queued note subjects and the per-file checkpoints. See [Vault mirror](vault-mirror.md). |

- **Secrets.** `settings`, `github_settings`, `reddit_account`, `vault_settings` and `grok_bot_settings` hold their secret sealed under `THREADSIFT_SECRET_KEY`. `x_settings` and `reddit_settings` hold none. No route, log or Export returns `reddit_account`.
- **`settings`.** Only a Claude Code or Codex row can store an effort or use a choice other than `custom`. Grok Bot is not a value of this row. The flag `use_as_provider` on `grok_bot_settings` says Grok Bot is the Provider, and it blocks removing that row. `grok_bot_settings` holds no agent token, references no other table, and stays out of the Export (see [Export, backup and restore](export-backup-and-restore.md)).
- **`reddit_account`.** The Reddit account module writes the row except `busy_job`, `busy_attempt`, `busy_until` and `queue_head`, which the Reddit queue module writes (The Reddit turn in [Jobs, leases and the schedule](jobs-leases-and-the-schedule.md)).

### Login and access

| Table | What it holds |
|---|---|
| `owner` | The owner's password hash, one row. |
| `sessions` | One row per session, keyed by the session's digest. |
| `agent_tokens` | One row per agent token: digest, scopes and Daily budget. |
| `spent_reset_codes` | The digests of used reset codes. |
| `throttles` | At most one row each for `setup`, `login` and `reset`. |

An attempt counts itself in `throttles` before it is checked (`admit`), and a success deletes the row it counted (`settleAttempt`). It is login data, so a Restore starts with no lock. See [Access](access-owner-login-agent-tokens-mcp.md).

### Work and runs

| Table | What it holds |
|---|---|
| `jobs` | The job runner's rows. |
| `scheduled_runs` | The schedule claims, keyed by task name. |
| `guards` | The table that guarded batches insert into (Database and search, Guarded batches). |
| `file_cleaning` | The cursor of the file cleanup, one row. |
| `ai_tasks` | One row per AI task. |
| `exports` | The library Export. |
| `restores` | The library Restore. |

- **`jobs`.**
  - `address` is the link a fetch reads, which can differ from the Item's normalized URL.
  - A unique index allows one open job per Item and kind.
  - `item_id` is null only for an `export` or `restore` job, because neither has an owner Item (`jobs_owner_check`).
  - `page` holds the JSON of a page the Extension sent. A save sets it when it queues the fetch job, and it is cleared when the job ends, a newer save replaces it, or `closeItemJobs` closes the job, so no page text outlives its job. An Export carries no job rows, and a Restore starts with no open jobs.
- **`ai_tasks`.** `job_id` is a plain integer with no foreign key, because the Item's cascade already removes the task. A task that is `running` with `answered_at` set holds an answer that waits to be applied. A `failed` task with the refusal `provider-busy` and `answered_at` set is a bot error that no claim has charged yet.
- **`exports`.** The partial unique index `exports_one_live` allows one row that is `running` or `ready`. The zip's objects live under `exports/<id>/` in the file store (see [Files](files.md)). The backup list leaves this table out as work in flight.
- **`restores`.** The partial unique index `restores_one_open` allows one Restore in a standing of `OPEN_RUNS`: `uploading`, `running`, or `failed` with the failure `gave-up`. The last two hold the library (`HOLDING`). A cancelled Restore keeps its row with the state `cancelled` and holds no library data. A change to `HOLDING` or `OPEN_RUNS` needs a new migration (Database and search, Migrations).

### Proposals and Pins

| Table | What it holds |
|---|---|
| `proposals` | One row per Proposal of any kind, with what every kind shares. |
| `tag_merge_proposals`, `topic_merge_proposals` | The two Tags or the two Topics of a merge. |
| `highlight_lost_proposals` | The Highlight of a `highlight-lost` Proposal. |
| `overview_gap_proposals` | The Topic of an `overview-gap` Proposal. |
| `items_disagree_proposals` | The two Items of an `items-disagree` Proposal. |
| `pins` | The accepted corrections. |

[Proposals](../proposals.md) owns their behaviour. The storage rules are these:

- **One head, one subject row.** `proposals` holds `kind`, `reason`, `state`, `created_at` and the run columns of a merge. Each Proposal also has one row in the subject table of its kind, which names the Tag, Topic, Highlight or Item. A subject row carries a `kind` checked to its table, in a composite foreign key `(proposal_id, kind)` to `proposals(id, kind)`. A subject row of another kind, or a second subject row for one Proposal, fails in the database.
- **Application rules.** No constraint requires the subject row. The batch that adds a Proposal inserts both, and a Restore deletes a head left with no subject row and counts it as dropped. Reads, Accept, Reject and the state read join the subject table (`hasSubject`), so a head with no subject row is not listed and answers 404.
- **Constraints on `proposals`.** Only a merge kind holds `accepting` or `declined` (`proposals_state_check`). `cursor`, `moved`, `unit_revision` and `failed_runs` stay null unless the row is `accepting` (`proposals_accepting_check`). `unit_revision` rises by one for each committed merge unit and is the guard token of the units, because the cursor can go back to 0. An open row needs a reason (`proposals_open_reason`).
- **Subject rows.** Each reference from a subject table to a Tag, Topic, Highlight or Item is `NOT NULL` with `ON DELETE cascade`. A `CHECK` keeps the two ids of a pair apart, and a unique expression index over the lower and the higher id (`tag_merge_proposals_pair`, `topic_merge_proposals_pair`, `items_disagree_proposals_pair`) keeps one row for a pair whichever way it was proposed. A unique index on the subject keeps one `highlight-lost` row for a Highlight and one `overview-gap` row for a Topic, in any state. `from_digest` and `into_digest` of `items_disagree_proposals` are the `digests.task_id` of the Digest each Item had when the model read it. They have no foreign key, because a refresh replaces a Digest row.
- **Triggers.** Each subject table has an `AFTER DELETE` trigger, `<table>_gone`, that deletes the `proposals` row of the deleted subject row, so a Tag, Topic, Highlight or Item that goes takes its Proposal with it. The reference from a subject row to `proposals` has no `ON DELETE cascade`, so deleting a `proposals` row that still has a subject row fails. A cascade in the other direction would close a loop through the five triggers, and D1 refuses a statement whose trigger programs nest more than 10 levels (Trigger depth on D1 in [Decisions and evidence](decisions-and-evidence.md)). Code that removes a Proposal deletes its subject row (`removedOpen`).
- **`pins`.** For `items-disagree`, `from_key` holds the pair key `<lowItemId>:<highItemId>` and `from_name` holds the agent's reason as the owner accepted it. `into_tag_id` and `into_topic_id` reference `tags` or `topics` with no delete action, so a Tag or Topic that a Pin targets cannot be deleted. `from_item_id` and `into_item_id` cascade. A unique index on `kind` and `from_key` keeps one Pin for a name in each kind, so a Tag and a Topic can share a key.

## Highlights

**Identity.** A Highlight's id is generated and never reused. A post Highlight names its Item. A comment Highlight names the Item and Reddit's comment id (`t1_...`), never the generation-specific row of `reddit_comments`, so it survives a refresh, a re-paste and a new Digest. A Remove and the delete of the Item end it. The `status`, the revision and `start` are derived.

A Restore keeps the id, the target, the selector and `createdAt`, and then anchors each Item's Highlights against the restored text as a refresh does. A Highlight comes back found or no longer found as the text decides, except that a text above 256 KiB keeps the exported status ([Export, backup and restore](export-backup-and-restore.md), Restore). A merge of two copies of a library needs its own contract, as the Item merge does (Item identity).

**Authority.** Only the owner's session creates and removes Highlights. The create and delete routes are declared `access("owner")`, so an agent token gets 403, and an agent token reads Highlights in `GET /api/items/{id}`. Accept of a lost-Highlight Proposal is owner-only too. It uses `removalWrites`, the same writes as the DELETE route. Create stores the selector (`exact`, `prefix`, `suffix`, `hint`) and `status`; publication re-anchors a Highlight by changing only `status` and `start`, and the weekly check that proposes a removal writes only `proposals` rows.

**Projection.** A Highlight quotes the text the owner reads, not the Markdown. `projectText` parses the stored Markdown with `remark-parse` and `GFM_PLUGINS` and reads the text of the tree. The browser calls `projectTree` on the rendered DOM, and both read the cells through the same Projector. Two rules carry a reason:

- An image is its alt text. When the alt text is empty, a picture the app stored is the single character U+FFFC. A stored picture's address holds the fetch attempt, so a refresh of an unchanged Article stores the same picture under a new address, and a quote that runs across the picture must not hold that address. `pictureText` is the one rule that the server, the marking tree and the DOM adapter all call.
- Raw HTML in the Markdown is literal text, because the Reader uses `react-markdown` without `rehype-raw`, so `<b>x</b>` projects as those eight characters. Reader controls and generated text, such as fold buttons, are not in the projection.

A paragraph that holds 20,000 parse events (`PARAGRAPH_EVENT_CAP`) stops reading `*`, `_`, `~`, `[`, `![` and `]` as Markdown, in the Reader and in the projection alike. [Decisions and evidence](decisions-and-evidence.md), Parse time of a page, holds the cause, the measurements and the shapes that remain.

**Selector and matcher.** The selector follows the W3C Web Annotation [`TextQuoteSelector`](https://www.w3.org/TR/annotation-model/#text-quote-selector): `exact` and up to 32 code points of `prefix` and `suffix` (`CONTEXT_CODE_POINTS`), cut at the edges of the target. `hint` is the place of `exact` in the projection of the revision it was made on. Offsets are in code points, so a browser, `node:sqlite` and D1 agree on text with emoji.

Two rules differ from Hypothesis's client. The quote must match exactly, with no fuzzy search. `hint` is checked once, when a Highlight is created, and never ranks matches after that, because a position moves with every edit. `anchorIn` finds every occurrence of `exact` in the new projection:

- None means `gone`.
- One means `attached`, whatever its context.
- Several are scored by the whole code points of the stored prefix that end where the match starts plus the whole code points of the stored suffix that begin where it ends. The single best score attaches, and a tie for the best score means `ambiguous`, never the first one.

**Create.** `POST` takes the target, the revision the owner read and the selector. One guarded batch (`guardedWrite`) inserts the Highlight with `RETURNING` and adds its search part. Its guard holds only while the target still has that revision and no attached Highlight of the same passage exists, so two identical creates sent at once save one row, and the second create finds the saved row. The response names the row that `RETURNING` gave, never a row found by its anchor, which a publication can move.

**Publication.** Every path that changes the displayed text (`publishFetched`, `publishSupplied` and `digestStored`) gives `anchoredOutcome` its plain writes and the displayed text. The outcome computes the new places from a snapshot of the Item's Highlights and sets a precondition on the batch: the Item's ordered list of Highlight ids equals the snapshot and, for a thread save, a published Digest generation still exists or still does not. Ids are never reused, so an equal list means no Highlight was created or removed. An Item that does not exist yet has a snapshot with no Highlights, and its precondition is that no Item has the address. When the precondition fails, `rebuild` reads a fresh snapshot and recomputes the places against the same text. It never fetches again, never calls the Provider again, and costs no job attempt.

**Comments.** A comment of the displayed generation that holds an attached Highlight stays readable even when the Digest no longer keeps it (`commentReadable`). `kept` and the Kept count do not change, and nothing is stored for the retention, so no write can leave it stale. When the comment is not in the new generation, or its body no longer holds the quote, the Highlight is `gone` or `ambiguous` and keeps its quote. When a later generation has the quote again, the same id is `attached` again.

**Search.** One `search_parts` row of kind `highlight` per Highlight holds the exact quote. `search_parts.highlight_id` references the Highlight, is nullable and has a unique index, so a Highlight has at most one part and the other kinds have none. The Remove deletes the part before the row, because the reference has no cascade. The parts stay while the Highlight is unattached, so an Item stays findable by a quote its text no longer has. A publication never rewrites them. Two Highlights with the same quote have two parts that differ by `highlight_id`, so a hit maps back to its Highlight. The delete of an Item still passes, because SQLite checks that reference when the statement ends, after the cascade removed both rows.

**In the Reader.** The Reader selects and draws Highlights with the browser's own selection and every Highlight is a row from `GET /api/items/{id}`. The Reader sends the Keeps and Removes of one Item one at a time, so a late answer cannot bring back a Highlight that a later Remove took away. A selection is eligible when it is one non-empty passage inside one post text or Kept comment, and the Reader reads it 150 ms after the last `selectionchange`. The marks use `mark` elements and not the CSS Custom Highlight API, because [Changing code](../agents/changing-code.md) asks for Baseline Widely available features and the API is Newly available.

Not verified: the phone's own selection menu (iOS Safari, Android Chrome), the reading of the popover by a screen reader, and Firefox and WebKit.

## Media

`media` holds what the fetch job found in an Article besides its text: one row for each image and each video. An X Item has rows for the photos of its post, its author thread and its quoted posts, and none for a video (the X section of [Fetchers](fetchers.md), Images). The Reader draws a stored image from its file route (Showing images).

**Identity.** A row's id is generated and never reused. Within an Item a row is matched by its kind and its source URL (`media_item_source`). The source URL is the address after Defuddle resolved it against the page and its `<base href>`, with the fragment and any credentials removed, the query kept, and no Item URL normalization, because a query can choose the picture. A base64 `data:` image has no address, so its source is `inline:sha256:<hex digest of the whole data URL text>`. A row's file key is unique and belongs to one attempt (`items/<id>/img-<job id>-<attempt>-<position>.<ext>`), and no key is written twice.

**Events.**

| Event | What happens to the rows |
|---|---|
| Refresh that still finds the image | The row keeps its id and moves to the attempt's new file key and alt text. The file of the old key goes after the publish. |
| Refresh that no longer finds it | The row is deleted in the publishing batch, and its file goes after the commit. |
| Refresh that finds an image for the first time | A new row with a new id. |
| Failed refresh, or a result that publishes no content | Rows, files and text stay as they were. |
| Refresh with no images, or a change to Other | Every row of the Item is deleted and every file goes. |
| A thread published over the Item (`publishSupplied`) | Every row of the Item is deleted in the publishing batch, and the cleanup pass removes the files that no row names. |
| An X thread published by the check job (`x_verify`) | The photos in its post text are stored like an Article's. A photo that is still there keeps its row, one that is gone loses it with its file, and a post with no photo removes every row. |
| Delete of the Item | The cascade deletes the rows and the prefix delete removes the files. |
| Export and Restore | The records carry the ids, the file keys and the video URLs as stored, so a Restore keeps every row and link. The Export also writes each `stored` image as `items/<id>/<file name>` beside the Item's note, and `itemNote` rewrites the file-route links of the Item's own images to that bare file name. |
| Merge of two copies | Not built. Two Items never share rows, because the match key holds `item_id`. |

**Alt text and size.** `alt` is the alt text of the first place the text shows the image, with runs of whitespace collapsed, trimmed and cut to 300 characters (`ALT_MAX`). `media.width` and `media.height` are pixel hints that `imageSize` reads from the stored bytes only to reserve space, so a wrong or missing hint costs a layout move and never a wrong picture. AVIF, videos, failed images and unrecognized headers have no hint, and JPEG hints ignore EXIF rotation.

**Extraction.** `readArticle` runs `replaceMedia` on the linkedom document first. A `video` element's HTTP(S) `src` and `source` URLs become links and video rows, an `iframe` of a provider that `embedLinkOf` knows (matched by exact host name) becomes the provider's watch-page link and a video row, and `audio` and any other `iframe` become plain links with no row. Defuddle then runs with `separateMarkdown: true` and returns `contentMarkdown`. Defuddle converts to Markdown only inside `Defuddle()`: the pinned `defuddle/full` exports `Defuddle`, `default` and `module.exports` and no `createMarkdownContent`, so no separate converter exists to call on a cleaned DOM.

**Which images.** `readArticle` finds the image nodes with `remark-parse` and `GFM_PLUGINS` (`scanMarkdown`), never a regular expression, so a code sample and an ordinary link stay as written. It does so inside the page reader and not in the job, because parsing the 3.2 MB War and Peace text took 1,098 ms on the event loop (Node 26, 2026-11-09), and another Item's read then took 1,112 ms against a 1,000 ms bound. `prepareMedia` takes the first 20 distinct sources in text order and downloads at most 2 at once. A failed image, or an image past the 20, keeps its source address as the image destination. A `blob:`, `file:`, script, fragment-only or empty destination becomes its alt text, and so does an inline image that failed. An embed that Defuddle wrote as an image becomes a link before any download.

**Caps.** These are product limits, not Cloudflare limits.

| Limit | Value |
|---|---|
| Images per Item | 20 (`ITEM_IMAGES_MAX`) |
| Bytes per image | 2 MiB (`IMAGE_MAX_BYTES`), decoded for a `data:` URL |
| Downloads at once | 2 |
| Bytes per address | 4,096 |
| Videos per Item | 20 |
| Deadline | The fetch job's one deadline for the page, the extraction and every image ([Jobs, leases and the schedule](jobs-leases-and-the-schedule.md), Deadlines, attempts and retries) |

The fetch guard's per-hop deadline and 20-redirect limit apply to each image.

**Formats.** JPEG, PNG, GIF, WebP and AVIF, where the declared `Content-Type` and the bytes agree (`sniffImageType`, which follows the signatures of [WHATWG MIME Sniffing](https://mimesniff.spec.whatwg.org/#matching-an-image-type-pattern) section 6.1 and the AVIF brand). SVG, HTML, XML, PDF, an unknown type and a mismatch stay links (`not-an-image`, `type-mismatch`).

**Fetching.** `guardedFetchBytes` gives the fetch guard's byte-level traversal an image policy. It refuses a Reddit or X link as the first address (the photo host `pbs.twimg.com` is not one) and stops at one in a redirect. A photo of an X post must start and stay on `https://pbs.twimg.com/media/` addresses. It follows no meta refresh and sends no owner credential, agent token or GitHub token.

**Publication.** The files are put before the guarded `db.batch()` that publishes the text, the media set, the search parts, the generation and the job's completion. `mediaWrites` makes the media set one delete of the rows the attempt did not find and one insert-select from a single JSON parameter, because D1 allows 100 bound parameters per statement. A `put` that fails is a failed attempt (the job retries), not an image failure, and the files it wrote go to the cleanup pass.

## Showing images

- In the Reader, `PostText` draws an `img` for a Markdown image only when the destination is an image file route of the Item (`isImageRouteOf`), for every Source. A comment and an image of another Item stay a link, or the alt text when the destination is not a link. The detail answer carries `{ url, width, height, sourceUrl }` for each stored image that has dimensions (`sizedImageRows`), so a late image does not move the paragraphs below it. A failed image, one past the 20 and an SVG are links to their source from the fetch job on, so the browser makes no request for them.
- In List and Grid, every Item answer carries `image`, the stored image with the lowest `position` (`IMAGE_VIEW_COLUMNS`). The URL comes from a stored file key (`imageOf`), so the row does not check it again, unlike the Reader, whose post text is untrusted Markdown. A card whose image fails to load becomes a text card. With Card images Off, `ItemRow` renders no image, and Reader pictures ignore the setting.
- Not built: the prototype leaves a card without a picture when the picture is too dark or flat to read at card size. The app measures no pixels and draws every stored first image.

## The Note

The owner's one free-text Note per Item.

**Identity and revision.** A Note has no id of its own. `notes.item_id` is its primary key and a foreign key to `items.id`, so an Item has at most one Note, and the Note follows `items.id` through an edit, a clear, a refresh, a re-paste, a new Digest, a change of the Item's `normalized_url` (Item identity) and an Export and Restore. Deleting the Item ends it. Two copies of a library that both have a Note on one Item need their own merge contract, as the Item merge does.

`revision` counts the Note's writes. No row means revision 0, the first save writes 1, and every accepted write, a replace or a clear, stores the revision it named plus 1. A clear keeps the row with a null `body`. The revision never resets while the Item exists, so a save made before a clear is still stale after it.

**Write.** `saveNote` runs one `guardedBatch` whose guard holds while the Item exists and the stored revision, or 0 for no row, equals `revision`. The batch upserts the row and replaces the Note's search part from the stored row (`notePartWrites`). When the guard fails, a second read answers 404 for a missing Item or 409 with the current Note and revision, and nothing was written. A `body` that is empty after `trim()` clears the Note. Any other body is stored as sent, as plain text that is never read as Markdown or HTML, up to 10,000 code points (`NOTE_MAX_CODE_POINTS`) of well-formed Unicode. 10,000 code points are at most 40,000 bytes in UTF-8, far under D1's 2,000,000 bytes per row ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)), and the 64 KiB request cap still holds a body of 10,000 control characters escaped as `\u00XX`.

**Authority.** `PUT /api/items/{id}/note` is declared `access("owner")`, so an agent token gets 403. `GET /api/items/{id}` returns the Note to the owner and to an agent token alike. A refresh, a Digest and an agent's update name no statement on `notes`, so none rewrites a Note.

**Search.** One `search_parts` row of kind `note` per nonempty Note, with a null `highlight_id`. The write replaces it in the Note's own batch, so a replace never leaves two parts and a clear leaves none.

**In the Reader.** `useNote` keeps the saved Note apart from the draft, so a refresh cannot move text under the owner. A revision conflict shows a panel that preserves both versions. If a save committed but its answer was lost, the next save shows the panel even when the texts match. `exceedsNoteLimit` counts code points, the test the Instance applies, because a field's `maxLength` counts UTF-16 units. The Reader keeps the draft and its revision in `localStorage` under `threadsift.note-draft.<items.id>`, so a reload preserves it. An Item deleted elsewhere can leave an unused draft, because ids are never reused.

## The Highlights page

**Stored data and identity.** The page stores nothing: no table, no stored reference, no migration. An entry is a row of `highlights` or of `notes` read with its Item. It is named by its `kind` and its `id`, which is the generated Highlight id or the Item id for a Note. A link to an entry, `/items/<id>?highlight=<highlight id>` or `/items/<id>?note`, therefore survives a refresh, a re-anchor, a new Digest, an edit of a Note and an Export that keeps ids. It ends with the Highlight or the Item, and the Reader then opens with no place to go to.

**The read.** `GET /api/highlights` answers `{ entries, next, counts }`, at most 50 entries (`PAGE_SIZE`), newest first. A Highlight is dated by `highlights.created_at`, a Note by `notes.updated_at`, and a cleared Note has no entry. `found` is false when a Highlight's status is not `attached`. An agent token with the `read` scope may read it.

- `source`, `topic` and `tag` mean what they mean in `GET /api/items` (`itemFilters`, `itemConditions`, with the same `catalogKey` rule). The words of `q`, each a prefix as in the Library search, must all be in the entry's own `search_parts` row (`partMatching`), so a word of another Highlight, of the Note of the same Item, or of the Item's title, Summary or Tags finds nothing.
- One select over `highlights` and one over `notes` are combined with `unionAll` and ordered by `(date desc, kind desc, id desc)`. The cursor is `<date>.<kind>.<id>`, and the next page asks for the rows below it by row-value comparison, so a read depends on the position named and not on a row that still exists. A Highlight kept between two reads shows at the top of a new read and moves no later page, so a run has no repeat and no gap. A Note saved again between two reads moves to the top, so a run that is already below the top does not see it. A cursor of another shape, or one with a number above 9007199254740991, is a 400. A well-formed cursor that no page gave is accepted and answers the entries below that position.
- `counts.total` ignores every filter. `sources`, `topics` and `tags` give, for each choice, the number of entries it leaves with the search and the other groups applied, and a group ignores its own filter, as in `GET /api/items`. They run the same `facetQueries` as the Library's counts, with a `Unit` that counts an Item's matching entries in place of `count()`.
- No index covers `highlights.created_at` or `notes.updated_at`, so a page sorts every matching entry. This is not measured.

**The page.** `/highlights` is reached from the Highlights link in the settings panel (`PageLinks`). The link is not a control of its own in the masthead row, because a second 44 px control there made the masthead scroll sideways at 1440 px in the mono Font at Small text size and Compact density, and moved the gear. The Index link sits in the settings panel for the same reason. The page reuses the Library's search box and filters with the Read group left out, because an entry has no read state of its own. A Highlight kept across a stored picture holds `STORED_PICTURE_TEXT` (U+FFFC) where the picture was, and `QuoteText` draws it as an inline chip.

**Arrival.** An entry links to `/items/<id>?highlight=<id>` or `/items/<id>?note`, and `arrivalPlace` reads the query. `ReaderPane` holds one `Arrivals` ledger, so each address and kind arrives once even when the Sheet and page subtrees remount each other. `watchPlace` does not restore the saved reading place while the ledger still holds the arrival, because the restore would set the scroll again after the arrival had scrolled.

## The library wiki

[The library wiki](../wiki.md) describes Topic pages, the Index, Related Items and the Log, and the identity of each record.

## Proposals

[Proposals](../proposals.md) describes the weekly checks, the Proposals page, Reject, Accept of each kind, and the Pins a merge or a disagreement leaves.

## Item identity

`items.normalized_url` is the only identity of an Item, and `parseLink` writes it. `parseLink` gives the identity of an identity as itself, so a Paste of a stored identity and a Paste of the link it came from reach the same Item.

`canonicalHost` removes every trailing dot, every leading `www.` that leaves a dot in the host and a `mobile.` in front of `x.com` or `twitter.com`, in any order. `withoutGitSuffix` removes every `.git` from a repository name. `hostOf`, `redditRefOf`, `isRedditOrXLink` and `isGitHubLink` call the same `canonicalHost`, so a fetch, a supplied page and `parseLink` agree on which Source a spelling belongs to (`www.mobile.x.com` is X and `www.www.github.com` is GitHub for all of them), and a fetch still sends the pasted address.

A generic link keeps its scheme and case, and loses its fragment, credentials, a trailing dot on the host, a `www.` prefix and the tracking parameters (`utm_*` and the others in `TRACKING_PARAMS`), so `http` and `https` stay two Items. Three rules are named exceptions, each for a Source whose service gives one thing one id:

- **X.** A post's identity is its status id, written as decimal text without leading zeros: `https://x.com/i/status/<id>`. The hosts `x.com` and `twitter.com` (with `www.` and `mobile.`), any handle spelling, `/i/status/`, `/i/web/status/`, a media or quotes suffix and any query give the same identity. The id stays text because X ids pass 2^53. A reply or a quote post has its own status id and is another Item. The handle is not in the identity. `original_url` keeps the pasted link, and the place line reads the handle from it (`spellingOf`, `whereOf`).
- **GitHub.** A repository-root link (exactly an owner and a repository) lower-cases both and drops a trailing `/` and a `.git` suffix, because GitHub documents `owner` and `repo` as case-insensitive ([Get a repository](https://docs.github.com/en/rest/repos/repos#get-a-repository)). A deep link and a file path keep their pasted case and stay their own Items, and a renamed repository stays an Item under the name it was pasted with. The Reader and the place line show the pasted case, read from `original_url` when it has the same identity.
- **Reddit.** A post id and a comment id must be ASCII letters and digits (base-36) and are lower-cased. A link whose id fails the check is a plain link. A comment is a different Item from its post, and two comments on one post differ. `redd.it` links follow the same rule. A share link (`reddit.com/r/<community>/s/<code>`) holds no id, so it is no identity. The Paste resolves it to the post or comment it leads to and keeps it as an alias (Short-link aliases).

There is no Source id column. A new rule for another Source changes `parseLink`.

## Short-link aliases

A short link (`isShortLink`) or a Reddit share link (`isRedditShareLink`) is not an Item's identity. The Item's identity is the address it resolves to. This section says "short link" for both, except under Reddit share links. `item_aliases` records which Item a short link made or reached, so a later Paste or Try again of that short link finds the Item without resolving the link again. `original_url` cannot do this, because it holds only the first spelling that made an Item.

- **Key.** `item_aliases.normalized_url` is the primary key. It is `parseLink(<short link>).normalizedUrl`, so two spellings of one short link (a tracking parameter, a fragment, a trailing dot on the host) are one alias, and the path keeps its case because short codes are case sensitive.
- **Address.** `item_aliases.address` is the address the short link resolved to when the row was written, spelled as the fetch job read it (`www.` and query kept). Every later refresh through the alias fetches that address, because the Item's `normalized_url` drops the `www.` and tracking parameters that the site may need. The first row wins, and a later resolution does not change it.
- **Survives.** A re-paste, a Try again, a refresh, an Export and a Restore keep the row.
- **Ends.** Deleting the Item deletes its aliases in the same batch.
- **Breaks.** A change to the generic rule of `parseLink` can change the key of a short link. The old row is then never found, and the short link resolves anew and writes a row under the new key. That costs a lookup and never reaches a wrong Item. A merge of two Items, which no code does yet, must repoint the aliases of the Item it removes.

`saveItem` handles a pasted short link in this order:

```text
Paste or Try again of a short link
  |
  alias exists? --yes--> refresh that Item: queue a fetch job at the alias's address, resolve nothing
  | no
  resolve the link
  |-- fails -----> saveUnresolved: a failed Item under the short URL, no alias
  |-- succeeds --> one batch:
        1. an Item under the short URL failed earlier and none holds the resolved identity?
             yes -> promoteFailedItem: that Item takes the resolved identity, kind and Source
             no  -> if an Item holds the resolved identity, the Paste reaches it and the failed Item stays
        2. save or refresh the Item at the resolved identity, queue its fetch job with the resolved address, write the alias
```

- A refresh through an alias fetches the alias's `address`, never the short link, so a short link that now points elsewhere cannot bring other content into the Item, and a dead short link still reaches its Item.
- `saveUnresolved` starts with a guard that fails while an alias for the link exists. A failure that ends after another Paste wrote the alias makes no failed Item, and the Paste starts again from the alias test.
- `promoteFailedItem` requires that the failed Item's `fetch_result` is set and is not `ok`, and that `fetched_at` is null, because a refresh that failed leaves an earlier success's content and date on the Item. A failed Item next to an Item at the resolved identity stays for the owner to delete, because merging two Items needs its own contract.
- A second short link to the same target ends at the same Item and gets its own alias.
- Concurrent first saves of one short link end with one Item. The unique index on `items.normalized_url` and the primary key of `item_aliases` allow one row each, and the batch starts with a guard (`insertGuard`) that holds only while no alias for the link names an Item other than the one at the resolved identity. When another Paste writes such an alias first, the batch rolls back and writes nothing, and the Paste starts again from the alias test. The promotion is one `UPDATE` that renames only when no Item holds the new identity, so two Pastes cannot both take it.

An alias never moves one Item's content to another Item.

**Reddit share links.** `isRedditShareLink` accepts a path of exactly `/r/<community>/s/<code>` (a trailing `/` allowed, `<code>` letters and digits) on the host `reddit.com`, with or without `www.`. Every other form stays a plain link with no request: `old.reddit.com` and the other subdomains (an `old.reddit.com` share link answers a redirect to its login page), `reddit.com/s/<code>` without a community (it answers 200 and holds no redirect), and `/u/` or `/user/` paths.

`resolveShortLink` follows a share link's one redirect with `SHARE_LINK_POLICY`, whether the share link was pasted or a short link redirected to it. The policy stops at the first redirect whatever its host, so no request goes to the destination. It reads no body, follows no meta refresh and sends no cookie, and it accepts the address only when `redditRefOf` reads a post or a comment from it. A redirect to a community root, a wiki page, a login page or any other address, and an answer that is no redirect, answer `unresolved` (the notice says Threadsift could not find the post or comment). An HTTP error answer such as a 403 stays `status`, and a transport failure keeps its own result. `saveUnresolved` saves each of them as a Link-only Item under the pasted link (the share link, or the short link that led to it), with no alias and no job. The next Paste resolves the link again, and if it then resolves, `promoteFailedItem` turns that Item into the resolved one. A comment destination keeps its comment id, so the Item is the comment's and never its post's.

The alias key is the pasted link's normalized address: for a share link, `reddit.com` without `www.` and the community and code in their pasted case, because a code is case sensitive. A short link that redirects to a share link is keyed by the short link, and the share link gets no alias. The alias `address` is the `www.reddit.com` address of the post or comment that Reddit redirected the share link to, with its `share_id` and `utm_*` query kept as it came. The fetch job uses only the post or comment id from it (`linkRouteOf`).

## The import cursor

`POST /api/items/batch` saves up to 100 links with `pasteLinksThenSaveCursor`, which saves the caller's cursor in `imports` only after every link has an outcome. A request that carries `import.previous` saves the cursor only when the stored one equals it (`null` means the row must not exist yet), so a late batch cannot move the cursor back over a later one. A request without `previous` saves it unconditionally. While a Restore holds the library the write is refused and the batch answers 503 `restoring`. The batch and `GET /api/imports/{name}` are open to agent tokens, because they are declared `access("add")` and `access("read")` (see [Access](access-owner-login-agent-tokens-mcp.md)).

- **Key.** `imports.name` is the primary key, chosen by the caller: 1 to 64 letters, digits, `.`, `_` and `-`. The Instance generates nothing, because the caller already has a stable name for its routine, such as `x-bookmarks`. `cursor` is the caller's opaque text of 1 to 256 characters. The Import screen names a row `list-` plus the first 16 hex digits of the SHA-256 of its cleaned links joined by line feeds (`importNameOf`) and keeps its cursor as the number of links done, so the same list is the same row, and a list with one link added, removed or moved is another.
- **Stop marker.** The X bookmark sync keeps the post id of the top bookmark of its last clean run under `x-bookmarks`. An import of all bookmarks keeps its top id under `x-bookmarks-all` and also stores it under `x-bookmarks`, so the next sync stops on its first page. The sync reads the list from the top and stops at that id, so the cursor marks where to stop and never where to resume, and a missing cursor only makes the next run read further. A run stops cleanly when it sent every page it read and stopped at the stored id, at the end of the list or at the 20-page limit of a sync. A sync that stops at the limit moves the marker to the top, because a marker that stayed would make every later run send the same 2,000 bookmarks again. The bookmarks below those pages wait for the import of all bookmarks.
- **Survives.** A restart, a deploy, an Export and a Restore keep the row. Losing it makes a routine send everything again, which is safe but slow, since every link answers `known`.
- **Breaks.** A caller that renames its routine starts a new row. The old row stays, nothing points to it, and it points to no Item, so deleting an Item never touches it.
- **Order.** The links are saved one after the other, in the order given, and the cursor is written after the last one. A call that dies half way leaves the old cursor, and the caller sends the same links again. This is at-least-once delivery, and the repeat is cheap because a link the library holds answers `known`.
- **Known links.** `pasteLinksThenSaveCursor` calls `saveItem` with `existing: "keep"`, which writes only when the link's final identity has no Item. One guarded batch inserts the Item with its fetch job and pending Digest, and the guard (`holdsNoItem`) fails the whole batch when an Item exists. A short link or a Reddit share link is resolved first, and then the same guard runs on the address it reached. An Item found that way keeps its status, jobs and pending Digest, and the batch only records the new alias (`saveResolved`). The link answers `known`, spends no fetch and no Digest, and drops a Digest sent with it. A Paste of that link still refreshes it, because `paste` and `pasteLink` pass `existing: "refresh"`. An Import adds Items (GLOSSARY), and refreshing the library would cost one model call per link.

### Limit of 100 links

The number is our choice, not a platform limit. The counts below justify it against the paid-plan limits: 10,000 subrequests per invocation, which count `fetch` calls, each hop of a redirect chain, and requests to D1 and other Cloudflare services ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)), and 1,000 queries per invocation, where one `db.batch()` call counts as one query however many statements it holds ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)).

Measured on 2026-11-11 on the Worker (`wrangler dev --local`, with a wrapper that counts `env.DB.prepare` and `batch` calls, `fetch` calls and `env.JOBS.sendBatch` calls inside one request), one call of 100 links with an agent token:

| Call | D1 executions | D1 batches | D1 queries | Statements in batches | Redirect fetches | Queue sends |
|---|---|---|---|---|---|---|
| 100 new X, article and Reddit links | 253 | 116 | 369 | 774 | 0 | 100 |
| The same call again, all known | 402 | 100 | 502 | 700 | 0 | 0 |
| 100 new short links of one real shortener, each reaching its own address | 302 | 100 | 402 | 800 | 200 | 100 |
| The same call again, all known | 502 | 100 | 602 | 700 | 0 | 0 |

A new link costs about 4 D1 queries and one queue send, and a short link adds 2 fetches here. The call stays under 1,000 D1 queries and uses 702 subrequests at most (402 D1 queries, 200 fetches and 100 queue sends), against 10,000. A short link can take up to 20 redirect hops (`resolveShortLink`), which would be 2,100 fetches for 100 links and about 2,800 subrequests in all, still under 10,000. A known link costs 5 to 6 D1 queries, because the guarded batch fails and the Item is read again. The container has none of these limits. The counts are for the paid plan, which this page assumes. The Free plan allows 50 subrequests per invocation and does not fit a call of this size.

## Catalog keys

`catalogKey` is the one key function for Topics and Tags. Digest publication and the `topic` and `tag` filters of `GET /api/items` all call it. It runs in JavaScript on both targets because SQLite has no case folding. The key of a name is, in this order: NFKC, Unicode full case folding, removal of U+0307 directly after an `i`, NFC, trim, and each run of whitespace collapsed to one space.

- Folding `İ` (U+0130) gives `i` and U+0307 (`CaseFolding.txt`, status F), and the removal step drops that dot. `İ`, `I`, `i`, `I` with U+0307 and `i` with U+0307 all give `i`. Dotless `ı` has no entry in the C and F statuses, so it stays apart from `i`, and every other accent stays too: `café` and `cafe`, `ş` and `s` are different keys. The rule is not Turkic folding (status T), which would split `Istanbul` from `istanbul`, and it uses no locale. The removal covers a run of U+0307, because a key must give itself back when it is folded again.
- `node tools/case-folding/check.ts` calls `catalogKey` on every code point except surrogates and on every two- and three-character string made from 24 characters that matter here, 1,126,464 names in about 3 s, and fails when the key of a key is not the key.
- A key is at most `CATALOG_KEY_MAX` (4,320) UTF-16 units. A Topic or Tag name is at most 240 units (`SHORT_TEXT_MAX`), and the worst single unit, U+FDFA, makes 18, because its NFKC form is 18 characters. Both Topic routes bind the key through `TopicKeyParamSchema`, and the Index cursor uses the same bound, so a key a Topic can have is never refused. A test takes the largest ratio of key length to name length over every code point and checks that this ratio times `SHORT_TEXT_MAX` equals `CATALOG_KEY_MAX`, so a change in Unicode expansion is noticed. It also checks that the key of a 240-unit name made from U+FDFA reaches `CATALOG_KEY_MAX`. A request line that carries a key this long, percent-encoded, can exceed a server's request-line limit before the route sees it. That limit is not measured.
- `ModelDigestSchema` and `DigestSchema` refuse a Topic name, a Tag name, a title or a Summary that holds a control character (`\p{Cc}`) or a lone surrogate (`isReadableText`). A Summary may still hold the one line break its two-line rule allows. JSON writes a control character, except the five with a short escape, and a lone surrogate as 6 bytes, where any other UTF-16 unit costs at most 3, so the rule keeps a Topic overview input under `AI_INPUT_BYTES` ([AI tasks and Providers](ai-tasks-and-providers.md), The `topic_overview` task).
- `StoredDigestSchema` reads a stored Digest without that rule, so a Topic, a Tag or a Digest stored before the rule keeps its name, its key, its Pins and its merged keys, and no step rewrites it. A Restore reads the rows of an Export as stored, and a Pin publishes the stored name of its target. A Grok Bot answer that was stored before the rule and is applied after it is checked with the rule. One that breaks it fails `no-json`, and its job asks again.
- `node tools/case-folding/build.ts` generates the folding table from `https://www.unicode.org/Public/18.0.0/ucd/CaseFolding.txt` (Unicode 18.0.0) with the C and F statuses. The generator refuses a file whose SHA-256 is not the pinned one, and the table carries the Unicode license header (`Unicode-3.0`). A new Unicode release changes keys only when someone runs the generator again.
- `unicode-case-folding` 1.1.2 has a table equal to the C and F statuses of Unicode 18.0.0, but it states no Unicode version, so a dependency update could change every stored key between the two targets. `@unicode/unicode-18.0.0` pins the version in its name, but it decodes its data with `node:zlib`, which the core and feature modules may not import. `fold-case` (last release 2014) and `@ar-nelson/foldcase` (2019) are not maintained (npm searched 2026-11-08). The generated table costs 7,741 bytes of source and a script, and in return the keys change only by a commit.
- A Topic or Tag is identified by its row id, which `items.topic_id` and `item_tags.tag_id` reference. The key is derived from the name, is unique, and survives a refresh, a re-import and an Export and Restore, because it is stored with the row.

**The shared Topic rewrite.** `topicMoves` is the bounded rewrite of one Topic into another. `retired` bumps `catalog_version` and deletes the loser, which every merge closes with, and `applyUnit` runs them for every merge kind. `planTopicUnit` adds the overview attempt for a Topic as a write that `applyUnit` reads the opened jobs from, so Accept of a Topic merge can wake the job the attempt opened. [Proposals](../proposals.md) describes Accept.

For up to `MERGE_ITEMS` Item ids and, independently, up to `MERGE_ITEMS` Log entry ids that `topicLinked` read, a unit does three things in this order:

1. One `UPDATE` sets `digests.topic` and the `topic` field of the Digest JSON (`json_set`, only when `json_valid`) to the survivor's name, for the Digests of those Items that still link to the loser, with no read of the Digest and no JavaScript. A stored Digest must not name a Topic that no longer exists, because the Export and the Vault mirror carry it, even though the Reader shows the linked Topic's name whatever `digests.topic` says. A Digest whose JSON is not valid keeps its text, still gets `digests.topic`, and its Item still moves.
2. `items.topic_id` and `log_entries.topic_id` move.
3. `planTopicUnit` deletes the loser's `topic_pages` row once no Item and no Log entry names the loser.

A unit closes only when neither collection has rows left, because Digest publication keeps adding Log entries for a Topic, so a Topic with few Items can have more than one unit of Log references. `topicMoves` does not repoint Proposals or Pins, and Accept keeps its own Proposal row to the last batch, because the row carries the continuation, the count and the unit revision.

The closing writes join the last unit. They make one opening attempt for the survivor's overview (`continuingOverview`), bump `catalog_version` once and delete the loser, each only when no Item and no Log entry names the loser. The opening attempt is not a promise of exactly one job. The open-job index is on Item and kind, so a job of either Topic's owner Item can already be open, and a job takes its Topic from its owner Item when it starts, so a queued job of the loser's owner follows its Item into the survivor. The chain that one attempt starts is long for a big merge, because a run covers at most 40 Items (`ADDED_READ_LIMIT`). A merge that moved 600 Items needed 16 jobs and 16 model calls on Claude Code.

## Deleting an Item

`deleteItem` runs `DELETE /api/items/:id` for the owner's session and for an agent token with the `delete` scope. The route answers 204 when the delete's `RETURNING` names the Item and 404 otherwise.

- The batch queues the Vault notes of the Item (`STALE.itemDeleted`) and then deletes the `items` row. That last statement removes the Item's rows in every other table, because each column that references `items(id)` is `ON DELETE cascade`, and the `AFTER DELETE` trigger of each Proposal subject table deletes the `proposals` row, on both targets. The Vault mirror queue has no Item foreign key, so the notes are queued first, while the old references still exist and the writer can still remove the files.
- `PRAGMA foreign_keys` returns 1 on `node:sqlite`, where `enableForeignKeyConstraints` defaults to true ([Node.js SQLite](https://nodejs.org/api/sqlite.html)), and on local D1, which enforces foreign keys in every query ([D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)). A child row whose parent is missing fails with `FOREIGN KEY constraint failed` on both. The cascade fires `search_parts_delete`, so the search index follows. `digests.task_id` references `ai_tasks` with no action, and the delete passes because SQLite checks an immediate foreign key when the statement ends, after the cascade removed both rows ([SQLite foreign keys](https://www.sqlite.org/foreignkeys.html)).
- Deleting either Item of a pair removes the pair. The other Item's list shrinks by one entry and renumbers nothing (a gap stays in `position`), and no new pick runs. The Summaries that a deleted Item's pick sent stay in that Item's `ai_tasks.inputs` until the Item itself is deleted.
- An entry with an Item reference (`ingest`, `digest` and `related`) holds that Item's title and Tags, so it goes with the Item. `topic`, `overview`, `merge`, `merge-topic`, `vault-file-skipped` and `vault-file-conflict` entries have no Item reference and stay. The delete itself is not an entry.
- Topics, Tags and `catalog_version` stay, because the lists outlive their last Item and a filter shows such a name with the count 0. `scheduled_runs`, `file_cleaning` and the id sequences stay too, so an id is never reused.
- After the batch commits, `deleteItem` lists `items/<id>/` through `FileStore.list` until the cursor is `null` and deletes every key it found, so the delete reaches temporary files too. A storage failure is logged as `item-files-not-deleted` and the route still answers 204, because the Item is already gone. The cleanup pass deletes what is left, since no Item names it.
- Every job write and AI task insert is guarded on its job row (`holding`), so a runner that finishes after the delete writes nothing and ends as a lost claim. A fetch that put a long post text into the store before it lost its claim deletes that file itself, or the cleanup pass does.
- The Reader's confirm dialog refuses Escape and both buttons while its DELETE is pending. The DELETE has the 20 s write deadline of a database write (`DATABASE_WRITE_DEADLINE_MS`; see [Web app](web-app.md), Read and write deadlines), and a rejected request moves the dialog to its failed state with Cancel and Delete enabled. The browser ends the request, and what happens on the Instance depends on the install target. On the container the handler keeps running and the Item can still be deleted. On Cloudflare the work of a request whose client disconnected may be canceled ([Workers limits, Duration](https://developers.cloudflare.com/workers/platform/limits/)), so the Item may or may not be deleted. A second Delete on an Item that is already gone counts as deleted, because the route answers 404 (`removeItem`).
- Proposals:
  - A merge row names no Item (it names two Tags or two Topics, and its Item counts are read live), so a delete never touches it. The same holds for a merge Pin and for a `merge` or `merge-topic` Log entry.
  - An `overview-gap` row names a Topic and reads its counts live, so the counts shrink at once and the row stays.
  - A `highlight-lost` row names a Highlight, and a Highlight names its Item, so the cascade removes the subject row and its trigger removes the `proposals` row, in any state. The quote that row showed is the owner's own text and stays nowhere else.
  - An `items-disagree` row and an `items-disagree` Pin name two Items, so the cascade on both columns removes the subject row and the Pin, and the trigger removes the `proposals` row, in any state.
  - The three weekly model runs (`proposals`, `topic_proposals` and `disagreement_proposals`) open their jobs on the same owner Item, which the open-job index allows because the kinds differ. Deleting that Item while a job is open deletes the job and its task, and that week's run is lost until the next one. The `disagreement_proposals` task's `inputs` hold the id, title and Summary of each sent Item and stay in `ai_tasks.inputs` until the task goes with its owner Item. The other two tasks' `inputs` hold Tag and Topic names and no Item text.
  - `topic_checks` names a Topic and no Item, so an Item delete leaves it. The membership text it holds then names an Item id that no longer exists, which makes that Topic touched on the next weekly run.
