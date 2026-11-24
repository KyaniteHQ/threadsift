# Database and search

SQLite on both targets, one Drizzle schema, one migration folder.

## Drivers

D1 uses `drizzle-orm/d1`. The container uses Node's built-in `node:sqlite` through `drizzle-orm/sqlite-proxy`, with a small adapter. `sqlite-proxy` wants rows as arrays, and `node:sqlite` returns them that way after `setReturnArrays(true)`. Drizzle 0.45.4 has no `node:sqlite` driver, and `node:sqlite` needs no native addon in the image, unlike `better-sqlite3`.

The adapter opens the file with a 5 s busy timeout, because `DatabaseSync` sets none by default and a read then fails at once with `database is locked` while another connection writes.

## Async and batch only

Both drivers are async and support `db.batch()`. D1 has no interactive transactions, so every multi-statement write is one `batch`, which commits or rolls back as a unit on both targets. The container runs each batch in one transaction.

## Guarded batches

A batch that may only commit while a condition holds starts with an insert into `guards`, a table with `CHECK (ok = 1)`. The insert selects the count of rows that the condition's `SELECT` returns, so a failed condition inserts 0 and the check fails. The failed check aborts the whole batch on D1 and in the container alike, so a guarded write is all or nothing. Examples of a condition are a Proposal still at the unit revision a merge read, and a catalog still at the version a job read.

The helpers are `guardedResults`, `guardedWrite` and `guardedBatch`, and `insertGuard` for a batch that builds its own guard.

- A helper reports a refusal only when the error is a failed guard check (`GUARD_REFUSED` lists the messages that count, and a helper reads only the innermost error of the cause chain, because the message of a Drizzle wrapper holds the bound parameters) and the condition no longer holds. That is a lost lease with nothing written.
- A helper rethrows any other error, because its outcome is unknown. A D1 batch whose answer is lost can have committed, and the condition then no longer holds because the batch itself changed it.
- A driver that sends a write batch again after it committed would report that batch as lost, because the batch closed its own condition. Neither target does: D1 retries read-only queries only ([D1 retry queries](https://developers.cloudflare.com/d1/best-practices/retry-queries/)), and `node:sqlite` runs each batch once.
- The guard insert uses Drizzle's `insert(guards).select(...)`, because a raw `db.run(sql)` inside a D1 batch fails in drizzle-orm 0.45.4 with `Cannot read properties of undefined (reading 'bind')`.

## Migrations

`pnpm exec drizzle-kit generate` writes the table definitions into the migration folder. Custom SQL holds what Drizzle Kit cannot: the FTS5 table, the triggers, the unordered-pair expression indexes and the singleton seed rows. Drizzle Kit 0.31.11 splits the commas inside an expression index into quoted column names, so those indexes stay in custom SQL.

The current triggers are the three `search_parts` triggers that feed the FTS5 table, the three `settings` triggers that count changes in `ai_settings_revision`, and the five `<kind>_proposals_gone` triggers (Consistency constraints). After a change to `HOLDING` or `OPEN_RUNS` (the Restore standings behind the index `restores_one_open`), run `pnpm exec drizzle-kit generate`. It prints a change when the index needs a new migration.

| Target | How migrations apply |
|---|---|
| Live Cloudflare | The `gate` workflow runs `wrangler d1 migrations apply DB --remote --env live`, and then `wrangler deploy`. |
| Container | The node target applies the same files at start. |
| Local D1 | `wrangler d1 migrations apply DB --local --persist-to <dir>` needs no Cloudflare login. |

The deploy applies a migration before it deploys the Worker, so the previous Worker runs for a short time on the new schema. A migration that drops a column or a trigger that the previous Worker still uses needs a deploy while no feature that uses it is running, because there is no compatibility layer. No build older than the one that migrated a database is supported on it.

- SQLite treats each NULL as distinct in a unique index, so `jobs_one_open_per_item_kind` accepts two open `export` jobs with no Item. The partial unique index `exports_one_live` guards the one-live-Export rule instead.
- A Restore writes the high-water mark of each `AUTOINCREMENT` counter into `sqlite_sequence` (the manifest's `sequences`). It runs one `UPDATE` of `max(seq, mark)` and one `INSERT ... SELECT` for a table with no row yet, because `sqlite_sequence` has no unique key on `name`.

## Consistency constraints

The Drizzle table definitions declare row-local value and subject rules as `CHECK` constraints. Their value lists come from constants, and the subject-column matching comes from the schema-check helpers. A failed check rolls back its batch on both targets. The storage tests exercise the CHECK constraints and unique indexes. The Proposal subject tests also delete subject rows to exercise the triggers that remove their Proposal.

Triggers remain where a rule reads another table or maintains derived data: the FTS5 search triggers, the settings revision triggers, and the five `<kind>_proposals_gone` triggers that delete the `proposals` row of a deleted subject row. [Data model outline](data-model-outline.md), Proposals and Pins, holds the rules of the Proposal tables. D1 refuses a statement whose trigger programs nest more than 10 levels, so a table that reaches D1 through a cascade and a trigger needs a run on local D1 (Trigger depth on D1 in [Decisions and evidence](decisions-and-evidence.md)).

## Search

FTS5 external-content table `search_index` over `search_parts`, with the `unicode61 remove_diacritics 2` tokenizer, kept in step by triggers. D1 supports FTS5 ([D1 SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/)). `search_parts` holds one row per searchable part of an Item, and a query matches parts and groups them by Item.

- A search term is a run of letters and digits (`searchTerms`), matched as a quoted prefix. The terms reach SQL as one JSON parameter. The filter counts come from the same batch as the first page of the list, so both describe one state of the library.
- A part longer than 500,000 bytes is split into chunks of at most 125,000 characters at the last whitespace (`chunkPostText`), so no word is split and no search row nears D1's 2 MB row limit. One token longer than a chunk is cut hard, which is accepted.
- A Kept comment body is cut like a post text. The Digest job reads the selected bodies before its batch, and a Restore reads the Kept bodies of the published generation in a separate query (`keptBodies`), so no single value or bound parameter holds all of an Item's comments, which can total 4 MiB against D1's 2,000,000 bytes per string. `commentPartWrites` binds the parts as JSON arrays.
- The app rewrites an Item's parts in the same batch as the change to that part. The migration that creates the index fills nothing. A Restore rebuilds the parts in its `search` phase through `rebuiltPartWrites`, which calls each rewrite.
- Every rewrite deletes the kinds it replaces from `PART_GROUPS`, and a kind added to `search_parts` fails type-checking until a group holds it. A group does not make its rewrite insert the kind, so the rewrite that reads the new group still needs its insert.
- A stored Digest that does not parse adds no Digest parts, and the Item's titles, post text and Tags stay searchable.
- `saveUnresolved` (a save that fails to resolve) rewrites no part, because it sets the status, the reason, the fetch result and the X note, and never the title or post text.
- The Related Item candidates come from the same index, ordered by `bm25()` ascending, because a lower `bm25` score is a better match ([SQLite FTS5](https://www.sqlite.org/fts5.html)). The aggregate form that fails and the measured form are in [The library wiki](../wiki.md), Related Items.
- Run `INSERT INTO search_index(search_index, rank) VALUES ('integrity-check', 1)` to check the external-content table.

## Large text

A post text over 1,000,000 bytes is stored as an object in the file store, and its row holds the key (see [Files](files.md)). The same rule runs on both targets, so no single value nears the 2 MB limit. A comment body is never stored as a file. A Paste whose thread has a comment body over 1,000,000 UTF-8 bytes is refused with a 400, and so is a post text that long.

Two limits, which are our choice, keep every value and statement below D1's 2,000,000 bytes per string or row ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)):

- A title, author, subreddit, comment id, comment author or parent id over 4,096 bytes is refused, far above any real username, subreddit or title.
- A comment whose stored row, as JSON with its escapes, is over 1,499,998 bytes is refused. That is the 1,500,000-byte statement budget less the array brackets, which leaves 500,000 bytes of room under 2,000,000 for the statement's own text. A body of 300,000 control characters is under the body limit and over the row limit, because each escapes to 6 bytes.

`GET /api/items` leaves out the post text, because about 50 rows of long text would pass the 50 MB query-result limit. `GET /api/items/:id` returns it.

## D1 limits that shape queries

100 bound parameters per statement, 1,000 queries per invocation on the paid plan, 2 MB per row, and 50 MB per query result ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)). A list whose length the data decides is bound as one JSON parameter and expanded with `json_each`, and large reads page by key.

## Duplicate column names

A `db.batch` select that joins one table twice, or two tables that share a column name, must name each repeated column with `sql<T>`...`.as("name")`, as `lostPage` does for the Proposal, the Highlight and the Item `id`. On `wrangler dev --local` 4.158.0 the unnamed query returned `from.id` as the Tag's name and `into` as `{}`, because the D1 driver reads each row as an object and the repeated `id` and `name` keys collapse. `node:sqlite` reads rows by position and returned the right values, so the core tests cannot show this.

## Numbers

D1 returns numbers as JavaScript numbers, so an integer above 2^53 loses precision ([D1 import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)). X post ids are above that, so every id that comes from a Source is `text`.
