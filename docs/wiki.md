# The library wiki

The records the agent keeps beside the Items: the Topic pages with their overviews, the Index of every Topic, the Related Items of each Item, and the Log of committed changes. [Proposals](proposals.md) owns Proposals and Pins. [The data model outline](architecture/data-model-outline.md) owns the tables.

The [Vault mirror](architecture/vault-mirror.md) writes the Topic pages, Index and Log as Markdown. The vault's Log links to UTC month notes. Item notes link to their Topic pages and Related Items. A Topic page note lists all current Known disagreements, while the app shows the most recent 20 (`DISAGREEMENTS_SHOWN`).

- [Topic pages](#topic-pages)
- [The Index](#the-index)
- [Related Items](#related-items)
- [The Log](#the-log)

## Topic pages

The run that writes the overview is the `topic_overview` job (`src/features/wiki/core/topic-overview-job.ts`; `docs/architecture/jobs-leases-and-the-schedule.md` and `docs/architecture/ai-tasks-and-providers.md`, The `topic_overview` task).

**Identity.** The address of a Topic page is `/topics/<key>`, where `<key>` is the Topic's `catalogKey` (`docs/architecture/data-model-outline.md`, Catalog keys), written by `topicPath` in `src/core/contract/topic-path.ts`. Two rules in `topicPath` exist because of the path:

- A key may contain a dot (`node.js`), and the static fallback answers `index.html` only when the last path segment has no `.` (`docs/architecture/web-app.md`), so `.` is written `%2E`.
- A key made only of dots, or of `~` followed only by dots, gets one more leading `~` (`topicSegment`), because a path segment of dots is a directory step that a browser, a proxy or the server collapses before the route sees it, and percent-encoding does not stop that.

`GET /api/topics/{key}` runs the key through `catalogKey` again, so a Topic written `İstanbul` and one written `istanbul` have one page and the page answers for the name in any spelling. `built_from` names Items by id and Digests by the id of the AI task that wrote them. The Digest id is a version token only compared with `digests.task_id`, so the task it names need not survive.

| Event | What happens to the reference |
|---|---|
| Rename of the Topic's first spelling | The key and the ids stay. |
| Refresh or new Digest of an Item | The Digest's AI task id changes, so the next overview run counts the Item as not yet built from. |
| Export and restore | Items keep their ids and the restore keeps `digests.task_id`, so `built_from` still compares right even though the export drops the `ai_tasks` row of a Digest that a newer one replaced. |
| Deleting an Item | `deleteItem` removes no `topic_pages` row, because the page holds the Item id only inside JSON. The next run finds the ids in `built_from` that no longer belong to the Topic (`removedItemIds` in `src/features/wiki/core/topic-coverage.ts`), takes them out of the overview text before the model call and stores an overview without them. A run reads at most 200 removed ids besides the ones the overview text cites, and a run that leaves removed ids behind opens the next while a Provider is saved. |
| Moving an Item to another Topic | The same as a delete for the old Topic. |
| An accepted disagreement of two Items | Listed while both Items sit under the Topic and still carry the Digests in the Pin. A Topic merge leaves it listed under the survivor, a new Digest of either Item or a move out of the Topic hides it, and deleting either Item deletes the Pin (`docs/proposals.md`, Identity). |
| Merge of two Topics | Breaks the reference: the losing Topic's page goes with its row and its Items move to the kept Topic, which counts them as uncovered at its next run. The Topic merge path (Accept) are in `docs/architecture/data-model-outline.md`, Catalog keys, and `docs/proposals.md`, Accept. |

**The read.** `disagreements` is the Known disagreements section: the `items-disagree` Pins whose two Items both sit under the Topic now and still carry the Digest tokens in the Pin (`currentDisagreementPin` in `src/core/kernel/disagreement-sql.ts`, `readDisagreements` in `src/features/wiki/core/known-disagreements.ts`), the last accepted first (`created_at`, then `id`, because Accept replaces a stale Pin in place and keeps its id), at most 20 (`DISAGREEMENTS_SHOWN`, chosen). A Pin whose Item got a new Digest or left the Topic is not shown and not deleted, and it shows again when both Items carry the Pin's Digests again. A key that no Topic has and no `topic-merge` Pin holds answers 404, and a key held only by a Pin opens the Topic the Pin points to.

**Try again.** `POST /api/topics/{key}/overview` and Accept of an overview-gap Proposal share one start, `startOverview` (`src/features/wiki/core/overview-start.ts`): one guarded batch (`docs/architecture/database-and-search.md`, Guarded batches) whose guard holds while a Provider is saved, the Topic has an Item with a Digest, and no `topic_overview` job that is not `done` is owned by any Item of the Topic. The owner of the new job is chosen inside the batch as one SQL subquery (`newestOwner`: the Topic's Item with a Digest, newest `saved_at`, then `id`) that the guard and the job insert both use. An owner picked before the batch could have left the Topic, or the Topic's last uncovered Item could have gone, in between. After the guard the batch inserts the job, then clears the failure marker.

When the guard fails, `startOverview` reads the Provider, the owner and the open run once and returns `no-provider`, `no-items`, `open`, or `stale` (the state changed between the guard and that read, or the batch failed a guard check). Try again maps `no-provider` and `no-items` to 409, retries on `stale`, and on `open` answers 202 without a second job. On `open` it clears the failure marker only while the open job that the start found is still open (`overviewRetried`, with the id of that job), so a run that failed and closed in between keeps the marker it stored. Accept's own guards and answers are in `docs/proposals.md`, Accept.

**The overview run's state.** The state is derived and never stored: an open `topic_overview` job makes it `pending`, otherwise the failure marker makes it `failed`, otherwise `idle` (`overviewState` in `src/core/contract/topic-overview-contract.ts`). `src/features/wiki/core/topic-overview-run.ts` is the only code that writes `topic_pages.failure`, and each change of the marker is one named write there. A Digest publication, a continuing run and a Topic merge open a job with no `overviewOpened`, so a Topic can be `pending` with a marker still stored. `overviewGaveUp` writes for the Topic of the job's latest `topic_overview` task (its `context.topicId`) unless a newer revision is stored, and for the Topic of its owner Item when no task has the job id, because the job may give up at its claim with no attempt in hand, after runners that died.

**One overview run at the bot per Topic.** With Grok Bot as the Provider, each `topic_overview` task is a full bot run of minutes. A burst of Digests into one Topic opens one job for each Item, and sending them all would make the first stored overview refuse the rest as out of date. So a job whose Topic already has another job's task at the bot waits (`topic-busy`) and does not send. When that task is applied, the waiting job reads the Topic again, so its run covers the Items that fit one call (at most 40, fewer when the 14,000-byte input budget cuts the list, and the first Item always fits because its key points are dropped one by one until it does). It closes with no send when the stored overview already holds every Item (`docs/architecture/ai-tasks-and-providers.md`, One overview task per Topic). A burst costs a few runs, each covering the Items that arrived while the one before it ran, and not one run for each Item.

**The page.** While the overview is `pending`, the page polls the same address every 3 seconds (`usePolling` in `web/src/use-polling.ts`) and replaces the rows, count, flags and cursor, so an Item deleted or moved meanwhile leaves and a new Item appears. A poll that lands after Load more or a reload began is dropped. On a phone, a citation takes its own row at least `--target` (44px) tall, and the Topic link in the Reader is at least `--target` wide, because both sit outside rendered post text, where `DESIGN.md` allows no smaller target. A failed overview shows its note and Try again above the Items, and the Items still list. With no Provider and no stored overview, the page shows a note and the Items only.

## The Index

The Index reads `topics` and `topic_pages` and adds no table, no job and no AI task, so it works with no Provider saved.

**Identity.** A row is a Topic, identified by its catalog key (`topics.key`), the same key that addresses its Topic page, so `İstanbul` and `istanbul` are one row. The cursor is a key, which is unique, so it needs no second column. A merge of two Topics removes the merged-away key as a Topic, and its old address still opens the kept Topic through the Topic Pin.

**The read.** The MCP endpoint gets no tool, because the spec fixes three. A Topic whose Items were all deleted stays in the list with `itemCount` 0, because the lists outlive their last Item (`docs/architecture/data-model-outline.md`, Deleting an Item, What stays). `overviewLine` is the first non-blank line of the stored `topic_pages.overview` with every `[12]`-style mark removed, inside the line as well as at its end, because the Topic page turns a mark into the cited Item's title or drops it and never shows it as raw text. A bracketed phrase that is not an id stays (`[the docs] [12]` gives `[the docs]`). The Index reads the stored text whatever the failure marker says, so a failed run does not hide an earlier overview. The Topic page splits the same text with `overviewLines`, so both screens use one rule.

**Order and paging.** Rows come ascending by `topics.key`, so a row does not move when a count changes. SQLite compares the keys byte by byte, which for UTF-8 text is code point order: `éclair` sorts after `zebra`, and no locale rule applies. A `cursor` over `CATALOG_KEY_MAX` characters (`docs/architecture/data-model-outline.md`, Catalog keys, Length) answers 400, so the `next` of any page is a cursor the next request accepts. Measured on 2026-11-11 with 1,000 seeded Topics of one Item each: a page took 4.1 to 5.7 ms on the container target (5 requests each for the first page, the second page and the page after the key `seeded topic 0900`) and 40.0 to 64.9 ms on `wrangler dev --local`. A page issued 3 SQL statements on the container and 2 D1 round trips on the Worker.

**The page.** The Index link sits in the settings panel and not in the masthead row, for the reason given in `docs/architecture/data-model-outline.md`, The Highlights page.

## Related Items

The agent's links from one Item to up to 5 others. A pick belongs to the Item that made it. The other Item's Reader does not list it, because showing both directions would need a ranking and a reason policy to keep the cap of 5. A set is replaced as a whole, a delete leaves a gap in `position`, and a read orders by `position` and renumbers nothing. The `related_items` table has no id of its own, because nothing points at a pair. The index on `related_id` keeps the delete of an Item from scanning every pair.

A refresh of a candidate after a pick does not re-pick, so a reason may be out of date until the source Item's next pick. The export leaves out the pick's AI task, because no Digest names it.

**When it starts.** `digestWrites` in `src/features/digest/core/digest-writes.ts`, which `digestStored` in `src/features/digest/core/digest-publish.ts` calls, holds `openingPick`, which runs right after the Digest upsert. It opens one `related_pick` job for the Item, and only while a Provider is saved. There is no backfill, because it would cost one model call for each stored Digest and needs the owner's approval of the spend. The job is not an Item job kind, so the Item stays `ready` while it runs, and it waits for the Item's own `digest` job (`blockedBy`). A Digest that lands while a pick runs opens no second job, and the running pick's writes are guarded on the Digest versions it read, so it is discarded and runs again.

**The candidates.** `candidateIds` ranks the other Items that have a stored Digest by FTS5 `bm25()` over the `digest-title`, `summary` and `tags` parts, a lower score being a better match. The terms are the words of the source Digest's clean title and then of its Tags, with repeats dropped and the first 12 kept (a chosen limit, unsupported). The terms are joined with ` OR `, because an AND would match almost nothing (not verified, see Open items and unverified claims). The first 20 Items are the candidates (a chosen limit, unsupported). Post text, comments, the fetched title, Highlights and Notes neither match nor reach the Provider.

The obvious `min(bm25(...))` over a `GROUP BY` fails on both targets with `unable to use function bm25 in the requested context` (`node:sqlite` on Node 26.12.1 with SQLite 3.53.3, and local D1 under wrangler 4.158.0, 2026-11-11), because `bm25()` works only where the FTS5 table is the row source. The query scores the rows in a `with scored as materialized (...)` subquery, and the outer query takes the minimum for each Item.

**The input and the result.** The input cap is 14,000 UTF-8 bytes (`utf8Length`), `AI_INPUT_BYTES`, the one cap of every model prompt. A candidate is added whole in rank order, and one that does not fit is skipped and the next is tried. When candidates exist and none fits, or the source Item alone is over the cap, the job makes no AI task, writes one `related-input-refused` log line, closes, and leaves the earlier picks. A stored Digest that does not parse closes the job the same way when it is the source's (`related-digest-unreadable`) and is skipped when it is a candidate's (`related-candidate-unreadable`). Zero picks is valid.

**Storing.** One batch holds the version guard, the delete of the old set, the insert of the new set, the completion of the AI task and the closing of the job. The guard holds only while the source Item's Digest is the one the attempt read, every candidate that was sent still has the Digest it had, and the AI task is still running. When the guard fails, nothing is written, the AI task fails as `stale` and the job returns to the runner's stale backoff without spending an attempt. A terminal refusal or the last retry closes the job and leaves the stored set as it was. The Item is not marked and the Reader shows no status for the pick, only the retained set, so "not run", "failed" and "picked none" look the same there, and there is no Try again. A later Digest of the Item runs the pick again.

**The read.** The title is the other Item's Digest title or, with none, its fetched title. The Reader reads the Item when it opens, so a pick that lands while it is open shows on the next open. The Reader draws nothing, heading included, when the list is empty.

**Cost.** Each claimed run makes at most one model call, with SDK retries off and the handler's deadline `AI_DEADLINE_MS`. An Item with no candidate or no term makes none. Error retries (up to 3 attempts) and stale reruns add calls. An Import of 100 links can add up to 100 pick calls plus retries, and the CLI Providers run 2 tasks at a time.

## The Log

The Log lists committed library changes and files the Vault mirror skipped. It is the `log_entries` table, one row for each entry.

**Recording.** A library change writes its Log entry in the guarded batch that commits the change. A skipped file writes its entry when the Vault mirror acknowledges the write, while the same lease still holds. Both batches queue the entry's UTC month immediately after the Log insert. A list binds as one JSON value because D1 allows at most 100 bound parameters per statement.

| Action | Written |
|---|---|
| `ingest` | the Item has no `digests` row yet (`loggedDigest`, run by `digestStored` before the `digests` upsert) |
| `digest` | the Item already has a `digests` row (Try again, a refresh, a new caller-sent Digest) |
| `topic` | the Topic insert inserted a row (`loggedTopic` in `linkingDigest`, right after the Topic's `bumpVersion`) |
| `overview` | every stored revision, changed, unchanged or prune-only (`loggedOverview` in `storedPage`) |
| `related` | the stored set has at least one pick (`loggedRelated`) |
| `merge` | the last unit of an accepted Tag merge left no `item_tags` row for the merged-away Tag |
| `merge-topic` | no Item and no Log entry names the merged-away Topic any more |
| `vault-file-skipped` | the writer leaves a file above GitHub's 100 MiB limit out and records its managed path once under the write lease |
| `vault-file-conflict` | an unowned file occupies a Folder mode path. The writer parks that subject and records the path once |

- **`changes()` placement.** `bumpVersion` reads `changes()` right after the Topic insert, and SQLite defines `changes()` as the count of the most recent completed insert, update or delete. The `topic` entry therefore sits after `bumpVersion` and before the Tag insert, conditioned on `changes() > 0`, so no statement comes between a catalog insert and the one that reads its count. The count is 1 when the Topic row was inserted and 0 when `ON CONFLICT DO NOTHING` skipped it (`node:sqlite`, Node 26, and local D1, 2026-11-11), so a second publication that reuses a Topic writes no `topic` entry.
- **`ingest` or `digest`.** The statement reads whether a `digests` row exists, so it runs before the upsert. Entries of one batch keep their insertion order, so a first Digest in a new Topic shows `ingest` above `topic`, because the newest id comes first.
- **No AI failure entries.** A failed Digest, overview or pick, the Verify task and an Item's deletion add no entries. An empty set of picks records nothing, including when it clears an older one.
- **The action list.** `LOG_ACTIONS` in `src/core/contract/log-actions.ts` is the list, and the `log_entries_action_check` CHECK refuses a row with another action, as `jobs_values_check` does for jobs. `test/consistency-triggers.test.ts` refuses an unknown action on insert and update through the real database.
- **One table of actions.** `LOG` in `src/core/contract/log-actions.ts` holds the entry schema and the Vault note word of each action in `LOG_ACTIONS`; the Log page, the month notes, the writers and the CHECKs read it. The two `vault-file-*` actions share one schema, because the OpenAPI document shows them as one branch.
- **Start time.** The initial migration inserts the start time into `log_start` from the database clock.
- **The read.** Rows come newest first by `id`, so a clock that steps back cannot reorder them. The route does not check that an entry with the cursor's `id` exists, so a cursor stays valid after its entry is deleted with an Item.
- **The page.** A line starts with the browser's local date as `YYYY-MM-DD` and the time of day as 24-hour `HH:MM`, both as text in a `<time>` element whose `datetime` is the UTC ISO time (`web/src/log-date.ts`). The line has no `title`, because a tooltip cannot be opened by keyboard or touch.

**Identity.** An entry holds a snapshot: the Digest title, the Topic's first spelling and the Tag names as they were when the batch ran, so a later rename, merge or regeneration does not change an old line. The line shows the snapshot, and the link goes through the reference. `item_id` is `ON DELETE cascade`, so deleting an Item removes its entries, because they hold its title and Tags. `topic_id` has no delete action, and a Topic merge moves it to the kept Topic. `merge` and `merge-topic` entries hold names only and no reference, so nothing deletes them.
