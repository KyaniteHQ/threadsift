# The library wiki

The wiki is the set of records the agent keeps beside the Items: the Topic pages with their overviews, the Index of every Topic, the Related Items of each Item, and the Log of committed changes. [Proposals](proposals.md) owns Proposals and Pins. The [data model outline](architecture/data-model-outline.md) owns the tables.

- [Topic pages](#topic-pages)
- [The Index](#the-index)
- [Related Items](#related-items)
- [The Log](#the-log)

The [Vault mirror](architecture/vault-mirror.md) writes the Topic pages, the Index and the Log as Markdown. The vault's Log links to UTC month notes. Item notes link to their Topic pages and Related Items. A Topic page note lists all current Known disagreements, while the app shows the most recent 20.

## Topic pages

The `topic_overview` job writes the overview. [AI tasks and Providers](architecture/ai-tasks-and-providers.md) describes its input, result and continuation, and [Jobs, leases and the schedule](architecture/jobs-leases-and-the-schedule.md) describes how jobs run.

### Identity

The address of a Topic page is `/topics/<key>`, where `<key>` is the Topic's catalog key (see Catalog keys in the [data model outline](architecture/data-model-outline.md)). `topicPath` writes the address and applies two rules:

- A key can contain a dot (`node.js`). The static fallback serves `index.html` only when the last path segment has no `.`, so `topicPath` writes `.` as `%2E`.
- A key made only of dots, or of `~` followed only by dots, gets one more leading `~`. A path segment of dots is a directory step that a browser, a proxy or the server collapses before the route sees it, and percent-encoding does not stop that.

`GET /api/topics/{key}` runs the key through `catalogKey` again, so `İstanbul` and `istanbul` have one page, and the page answers for the name in any spelling.

`built_from` names Items by id and Digests by the id of the AI task that wrote them. The Digest id is a version token that is only compared with `digests.task_id`, so the task it names need not survive.

| Event | What happens to the reference |
|---|---|
| Rename of the Topic's first spelling | The key and the ids stay. |
| Refresh or new Digest of an Item | The Digest's AI task id changes, so the next overview run counts the Item as not yet built from. |
| Export and Restore | Items keep their ids and Restore keeps `digests.task_id`, so `built_from` still compares right, although the Export drops the `ai_tasks` row of a Digest that a newer one replaced. |
| Deleting an Item | `deleteItem` removes no `topic_pages` row, because the page holds the Item id only inside JSON. The next run finds the ids in `built_from` that no longer belong to the Topic (`removedItemIds`), takes them out of the overview text before the model call and stores an overview without them. A run reads at most 200 removed ids besides the ones the overview text cites. A run that leaves removed ids behind opens the next one while a Provider is saved. |
| Moving an Item to another Topic | The same as a delete for the old Topic. |
| An accepted disagreement of two Items | Listed while both Items sit under the Topic and still carry the Digests in the Pin. A Topic merge leaves it listed under the surviving Topic. A new Digest of either Item, or a move out of the Topic, hides it. Deleting either Item deletes the Pin. See Identity in [Proposals](proposals.md). |
| Merge of two Topics | The losing Topic's page goes with its row, and its Items move to the kept Topic, which counts them as uncovered at its next run. See Accept in [Proposals](proposals.md) and Catalog keys in the [data model outline](architecture/data-model-outline.md). |

### Known disagreements

Known disagreements lists the `items-disagree` Pins whose two Items both sit under the Topic now and still carry the Digest tokens in the Pin. The last accepted Pin comes first (`created_at`, then `id`, because Accept replaces a stale Pin in place and keeps its id). At most 20 show (`DISAGREEMENTS_SHOWN`, our choice). A Pin whose Item got a new Digest or left the Topic is hidden and not deleted, and it shows again when both Items carry the Pin's Digests again.

A key that no Topic has and no `topic-merge` Pin holds answers 404. A key held only by a Pin opens the Topic the Pin points to.

### Try again

`POST /api/topics/{key}/overview` and Accept of an overview-gap Proposal share one start, `startOverview`. It is one guarded batch (see Guarded batches in [Database and search](architecture/database-and-search.md)). The guard holds while all of these are true:

- A Provider is saved.
- The Topic has an Item with a Digest.
- No `topic_overview` job that is not `done` names the Topic (`jobs.topic_id`).

The batch picks the owner of the new job inside one SQL subquery (the Topic's Item with a Digest, newest `saved_at`, then `id`), and both the guard and the job insert use it, because an owner picked before the batch could leave the Topic in between. After the guard, the batch inserts the job and clears the failure marker.

When the guard fails, `startOverview` reads the Provider, the owner and the open run once and returns one of four answers.

| Answer | Cause | Try again |
|---|---|---|
| `no-provider` | No Provider is saved. | Answers 409. |
| `no-items` | The Topic has no Item with a Digest. | Answers 409. |
| `open` | An overview job is already open. | Answers 202 with no second job. |
| `stale` | The state changed between the guard and the read, or the batch failed a guard check. | Retries. |

On `open`, Try again clears the failure marker only while the open job that the start found is still open. A run that failed and closed in between keeps the marker it stored. [Proposals](proposals.md) describes the guards and answers that Accept adds.

### The overview run's state

The state is derived and never stored. An open `topic_overview` job makes it `pending`. Otherwise the failure marker makes it `failed`, and otherwise it is `idle`. The overview run code is the only writer of `topic_pages.failure`.

A Digest publication, a continuing run and a Topic merge open a job and leave a stored marker alone, so a Topic can be `pending` with a marker still stored. When a job gives up, the marker goes to the Topic of the job's latest `topic_overview` task, unless a newer revision is stored. When no task has the job id, it goes to the Topic the job names, because a job can give up at its claim with no attempt in hand.

### One overview run at the bot per Topic

With Grok Bot as the Provider, each `topic_overview` task is a full bot run of minutes, and a burst of Digests into one Topic opens one job for each Item. A job whose Topic already has another job's task at the bot therefore waits (`topic-busy`) and does not send. When that task is applied, the waiting job reads the Topic again and sends only if Items are still uncovered. A burst costs a few runs, each covering the Items that arrived while the one before it ran. [AI tasks and Providers](architecture/ai-tasks-and-providers.md) describes the deferral.

### The page

While the overview is `pending`, the page polls its own address every 3 seconds and replaces the rows, count, flags and cursor. An Item deleted or moved meanwhile leaves, and a new Item appears. A poll that lands after Load more or a reload began is dropped.

On a phone, a citation takes its own row at least `--target` (44px) tall, and the Topic link in the Reader is at least `--target` wide. Both sit outside rendered post text, where the [design guide](../DESIGN.md) allows no smaller target.

A failed overview shows its note and Try again above the Items, and the Items still list. With no Provider and no stored overview, the page shows a note and the Items only.

An Item whose stored Digest is not valid JSON, or holds no Summary text, still lists with an empty Summary line, and the page answers 200.

## The Index

The Index reads `topics` and `topic_pages`. It adds no table, no job and no AI task, so it works with no Provider saved.

- A row is a Topic, identified by its catalog key (`topics.key`), the same key that addresses its Topic page, so `İstanbul` and `istanbul` are one row. The cursor is that key. A merge of two Topics removes the merged-away key as a Topic, and its old address still opens the kept Topic through the Topic Pin.
- A Topic whose Items were all deleted stays in the list with `itemCount` 0, because the lists outlive their last Item.
- `overviewLine` is the first non-blank line of the stored `topic_pages.overview` with every `[12]`-style mark removed, inside the line as well as at its end. The Topic page turns a mark into the cited Item's title or drops it, and never shows it as raw text. A bracketed phrase that is not an id stays (`[the docs] [12]` gives `[the docs]`). The Index reads the stored text whatever the failure marker says, so a failed run does not hide an earlier overview. The Topic page splits the same text with `overviewLines`, so both screens use one rule.
- Rows come ascending by `topics.key`, so a row does not move when a count changes. SQLite compares keys byte by byte, which for UTF-8 text is code point order: `éclair` sorts after `zebra`, and no locale rule applies. A `cursor` longer than `CATALOG_KEY_MAX` characters answers 400, so the `next` of any page is a cursor that the next request accepts.
- The Index link sits in the settings panel and not in the masthead row, for the reason that The Highlights page gives in the [data model outline](architecture/data-model-outline.md).

## Related Items

Related Items are the agent's links from one Item to up to 5 others (`RELATED_MAX`), each with a reason of 1 to 160 characters. A pick belongs to the Item that made it. The other Item's Reader does not list it, because showing both directions would need a ranking and a reason policy to keep the cap of 5.

- A set is replaced as a whole. A delete leaves a gap in `position`, and a read orders by `position` and renumbers nothing.
- The `related_items` table has no id of its own, because nothing points at a pair. The index on `related_id` keeps the delete of an Item from scanning every pair.
- A refresh of a candidate after a pick does not re-pick, so a reason can be out of date until the source Item's next pick.
- The Export leaves out the pick's AI task, because no Digest names it.

### When it starts

The job opens right after the Digest upsert, only while a Provider is saved, and it waits for the Item's own `digest` job. It is not an Item job kind, so the Item stays `ready` while it runs. A Digest that lands while a pick runs opens no second job. The running pick's writes are guarded on the Digest versions it read, so they are discarded and the pick runs again.

There is no backfill, because it would cost one model call for each stored Digest and needs the owner's approval of the spend.

### The candidates

The candidates are the other Items that have a stored Digest, ranked by FTS5 `bm25()` over the `digest-title`, `summary` and `tags` parts, where a lower score is a better match. The terms are the words of the source Digest's clean title and then of its Tags, with repeats dropped and the first 12 kept. The terms are phrases joined with `OR`, because `AND` would match almost nothing (not verified, see [Open items and unverified claims](architecture/open-items-and-unverified-claims.md)). The first 20 Items are the candidates. Both limits are our choice. Post text, comments, the fetched title, Highlights and Notes neither match nor reach the Provider.

`bm25()` works only where the FTS5 table is the row source, so `min(bm25(...))` over a `GROUP BY` fails on both targets. The query scores the rows in a `with scored as materialized (...)` subquery, and the outer query takes the minimum for each Item.

### The input and the result

The input is capped at the AI input cap ([AI tasks and Providers](architecture/ai-tasks-and-providers.md)). A candidate is added whole in rank order, and a candidate that does not fit is skipped. Zero picks is valid.

| Condition | What the job does |
|---|---|
| Candidates exist and none fits, or the source Item alone is over the cap | Makes no AI task, writes one `related-input-refused` log line, closes, and leaves the earlier picks. |
| The source's stored Digest does not parse | Closes the same way (`related-digest-unreadable`). |
| A candidate's stored Digest does not parse | Skips that candidate (`related-candidate-unreadable`). |

One batch holds the version guard, the delete of the old set, the insert of the new set, the completion of the AI task and the closing of the job. The guard holds only while the source Item's Digest is the one the attempt read, every candidate that was sent still has the Digest it had, and the AI task is still running. When the guard fails, nothing is written, the AI task fails as `stale`, and the job returns to the runner's stale backoff without spending an attempt. A terminal refusal or the last retry closes the job and leaves the stored set as it was.

The Item is not marked, and the Reader shows no status for the pick, only the retained set. "Not run", "failed" and "picked none" therefore look the same, and there is no Try again. A later Digest of the Item runs the pick again.

The title is the other Item's Digest title or, with none, its fetched title. The Reader reads the Item when it opens, so a pick that lands while it is open shows on the next open. The Reader draws nothing, heading included, when the list is empty.

Each claimed run makes at most one model call, with SDK retries off. An Item with no candidate or no term makes none. Error retries (up to 3 attempts) and stale reruns add calls. An Import of 100 links can add up to 100 pick calls plus retries, and the CLI Providers run 2 tasks at a time.

## The Log

The Log lists committed library changes and files the Vault mirror skipped. It is the `log_entries` table, with one row for each entry.

### Recording

A library change writes its Log entry in the guarded batch that commits the change. A skipped file writes its entry when the Vault mirror acknowledges the write, while the same lease still holds. Both batches queue the entry's UTC month immediately after the Log insert. A list binds as one JSON value, because D1 allows at most 100 bound parameters per statement.

`LOG_ACTIONS` is the list of actions, and the `log_entries_action_check` CHECK refuses a row with another action. [GLOSSARY](../GLOSSARY.md), Log entry, names each one. The conditions are these:

| Action | Written when |
|---|---|
| `ingest` | The Item has no `digests` row yet. |
| `digest` | The Item already has a `digests` row (Try again, a refresh, a new caller-sent Digest). |
| `topic` | The Topic insert inserted a row. A second publication that reuses a Topic writes none. |
| `overview` | Every stored revision, changed, unchanged or prune-only. |
| `related` | The stored set has at least one pick. |
| `merge` | The last unit of an accepted Tag merge left no `item_tags` row for the merged-away Tag. |
| `merge-topic` | No Item and no Log entry names the merged-away Topic any more. |
| `vault-file-skipped` | The writer leaves a file above GitHub's 100 MiB limit out and records its managed path once under the write lease. |
| `vault-file-conflict` | An unowned file occupies a Folder mode path. The writer parks that subject and records the path once. |

- The `ingest` or `digest` entry is read before the `digests` upsert. Entries of one batch keep their insertion order, so a first Digest in a new Topic shows `ingest` above `topic`, because the newest id comes first.
- A failed Digest, overview or pick, the Verify task and an Item's deletion add no entries. An empty set of picks records nothing, including when it clears an older one.
- The two `vault-file-*` actions share one schema, because the OpenAPI document shows them as one branch.
- The initial migration inserts the start time into `log_start` from the database clock.

### The read and the page

Rows come newest first by `id`, so a clock that steps back cannot reorder them. The route does not check that an entry with the cursor's `id` exists, so a cursor stays valid after its entry is deleted with an Item.

A line starts with the browser's local date as `YYYY-MM-DD` and the time of day as 24-hour `HH:MM`. Both are text in a `<time>` element whose `datetime` is the UTC ISO time. The line has no `title`, because a tooltip cannot be opened by keyboard or touch.

### Identity

An entry holds a snapshot: the Digest title, the Topic's first spelling and the Tag names as they were when the batch ran. A later rename, merge or regeneration does not change an old line. The line shows the snapshot, and the link goes through the reference.

- `item_id` is `ON DELETE cascade`, so deleting an Item removes its entries, because they hold its title and Tags.
- `topic_id` has no delete action, and a Topic merge moves it to the kept Topic.
- `merge` and `merge-topic` entries hold names only and no reference, so nothing deletes them.
