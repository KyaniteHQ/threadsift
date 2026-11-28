# Export, backup and restore

An Export is a zip of the whole library. A Restore reads that zip back into an Instance whose library is empty. The same zip backs up both install targets and moves a library between them. Both run as chains of jobs that commit a checkpoint after each slice, so a stopped container, a lost queue message or a dead Worker continues from the last committed slice.

- [The zip](#the-zip)
- [Export](#export)
- [Restore](#restore), including [While it runs](#while-it-runs)
- [Measured runs](#measured-runs)

## The zip

The zip holds three kinds of entry, all under one folder named `threadsift-<UTC date>/`:

- a Markdown note for each Item, with its stored images and post text file beside it,
- every library record as JSON Lines files under `records/`,
- the manifest `threadsift.json`.

The manifest lists the record files with their row counts. It also holds the format, the export time, the highest applied migration, the `sqlite_sequence` value of each `AUTOINCREMENT` table, and the number of Items that had an open job of a kind in `ITEM_JOB_KINDS` when the Export read them. The writer and Restore's reader share one definition of the root folder, the manifest name, the record file names and the manifest schema. Restore reads the format, the migration, the tables and the sequences, and ignores the export time and the open Item count. The manifest is separate from the records because a CRC-32 needs a whole entry, and one file of every record cannot be written in slices.

**Every record keeps its id.** Restore inserts the ids unchanged into the fresh Instance, so foreign keys, file keys (`items/<id>/…`) and `/items/<id>` addresses hold, and new rows continue after the highest restored id.

**Why the app writes its own backup.** D1's export does not support databases with virtual tables, and the FTS5 tables are virtual (D1 docs, Import and export data). D1 Time Travel restores a database to any minute of the last 30 days on the paid plan (7 on the free plan) and covers the database only, not R2 (D1 docs, Time Travel).

### The backup list

`BACKUP_TABLES` holds one record for every included table: the columns a backup exports, the columns it leaves out, and what a Restore does with the table (`mustBeEmpty` for a table whose rows make the library non-empty, `singleton`, `rewrites` and `rebuiltInto`). Each table the records leave out has a reason beside it:

- Secrets, the owner's password hash, sessions, agent token hashes and the working tables are left out, because a restored Instance gets a new password and new tokens and starts with no work in flight.
- The `ai_tasks` rows that Digests name stay, because `digests.task_id` is NOT NULL and a task's inputs hold the comment ids the agent was shown. A model's or the Grok Bot's task keeps its inputs as sent, so a task sent before the migration that renamed the thread tables still shows `t1_` ids there. Its `result`, and the `inputs` of a caller's task, hold a Digest and carry the bare ids that every stored Digest carries.
- `d1_migrations` and `sqlite_sequence` are excluded as `carried-in-manifest`.
- The records hold every stored comment, Kept or not. The Item notes hold Kept comments only.

The backup-tables test fails when a table is in neither the backup list nor the excluded list, when it is in both, or when a column of an included table is in neither set. A migration that adds a table or a column must decide where it belongs. The key order of the lists is not an insert order, because Restore derives the parent order from the foreign keys of the schema.

A Proposal is two records, its `proposals` row (`records/proposals.<n>.jsonl`) and one subject row (`tag_merge_proposals`, `topic_merge_proposals`, `highlight_lost_proposals`, `overview_gap_proposals` or `items_disagree_proposals`). The Export reads the tables in slices, so a row of one may be read without its partner. Restore inserts the `proposals` rows first and drops a subject row whose `proposals` row, Tag, Topic, Highlight or Item is not in the restored library. Its finishing slice deletes each `proposals` row left with no subject row (`proposalsWithoutSubject`).

## Export

`POST /api/export` inserts the `exports` row and the first job of the kind `export` in one batch. Each slice reads the next rows, closes whole zip entries, writes them as objects of the file store, and returns one checkpoint. The runner commits the checkpoint in the same guarded batch that closes the job and opens the next one. A limit here with no source named is our choice.

- On the container the start expires the claim of every `running` job (`abandonRunning`), and on Cloudflare the sweep takes over a claim that expired.
- A job that fails 3 attempts ends the export `failed` with `gave-up`. A slice that finds that the table list differs from the one the export started with ends it `failed` with `list-changed`, because resuming would skip or repeat a table without any error. A deploy that changes a table or an exported column in `BACKUP_TABLES` while the export runs causes this.

### Layout in the file store

Slice `n` of attempt `g` writes `exports/<id>/part-<n>-<g>`, `exports/<id>/dir-<n>-<g>` and, on the last slice, `exports/<id>/tail-<g>`.

- The attempt number is in the name, so a runner that lost its claim and writes late writes other names than the runner that committed the slice. It cannot overwrite committed bytes, its guarded commit fails, and it deletes what it wrote.
- The objects are separate because R2 multipart needs equal parts of at least 5 MiB and the container has no multipart.
- The download streams every `part`, then every `dir`, then the `tail`, as one store-mode zip with ZIP64 records when needed. The file-key module builds these names beside the pattern that accepts them.

### Records

The slices read `topics` and `tags` first, then the other tables in `BACKUP_TABLES` order.

- A table is read in pages of at most `EXPORT_PAGE_ROWS` (2,000) rows in `rowid` order. A page also stops when its rows reach the room left in the slice, so a page of long comments stays inside the budget.
- A slice ends at `EXPORT_SLICE_BYTES` (8 MiB) of rows. Local figures set the size (Measured runs). A slice at that size on a deployed Worker is unverified ([Open items and unverified claims](open-items-and-unverified-claims.md)).
- A record file closes at `EXPORT_ENTRY_BYTES` (8 MiB), so every entry is complete inside one slice and its CRC-32 is known before the next slice starts.
- A table with no rows gets one empty file, so every included table has a file.

### Item notes, images and post text

After the last table the slices read the Items by id, at most `EXPORT_SLICE_ITEMS` (40) Items per slice and at most 8 MiB of entries, except that a slice's first entry is taken whatever its size. When the next entry does not fit, the slice ends inside the Item and the checkpoint records how many of its entries are written, so an Item of 20 images of 2 MiB spreads over 5 or more slices.

`choose` counts the entries of an Item that fit in the slice with `fitting`, a scan with `findIndex` and a running total, and not with a `while` loop. On Node 26.13.1 the `while` form returned a wrong `next` after the process had run it for many Items. For an Item whose note fit and whose post text file did not, it returned no `next`, so the slice ended after the note, the next slice started after that Item, and the Export ended `ready` with a zip that lacked the post text file. The core tests of two files in one process (`node --test --test-isolation=none test/export-lifecycle.test.ts test/export-slices.test.ts`) showed it on every run, and it did not appear with Maglev turned off ([measurement](decisions-and-evidence.md#export-entry-count-on-node-26131)). Keep the scan form, and run `pnpm test 4` and the slice boundary tests of the Export before any change to this count or to `entriesOf`, which packs a table's record lines into zip entries in the Export slice module, and `completeLines` in Restore, which count the same way with a first entry that is always taken. A recursive form is not an option, because an Item with thousands of stored files would need one stack frame for each.

`takeItems` reads each Item with the Reader's read plus its stored files, its Topic and its Kept comments in one batch that also lists its stored files, so the note and the image list come from the same rows. `readPlannedItem` turns that read into the note's input, the post text file and the stored files with `itemFilePlan`, and the Vault mirror plans an Item's files through it too. `readAgainOnce` is the one place that repeats a read after a miss, for the Export's `gather` and the Vault mirror's plan alike. A stored image whose size differs from the recorded one counts as missing.

Each read of an Item costs 11 D1 statements (the Reader's 10 and the list of stored files), so a slice of 40 Items runs near 440 Item-read statements, and up to 880 when every Item is read again after a miss, plus the one query that lists the ids, against the 1,000 queries of one invocation (arithmetic).

### Note format

`itemNote` and `noteFileName` are pure functions of an Item's values, so the Vault mirror can call them.

- The entry name `note-<slug>.md` cannot collide with a stored name, which starts with `post-` or `img-`. The slug is cut at 80 code points and at 240 bytes, which keeps the file name under the 255-byte limit of common file systems.
- Every front matter string is written by `JSON.stringify` and the front matter has no `title` key, so a hostile title or author cannot add a key.
- The title, Summary, Key points, Highlight quotes, Note and comment authors are plain text in the Reader, so the note escapes their Markdown characters. The post text and comment bodies stay as stored.
- The comments are Kept comments only. A comment that the Reader shows only because an attached Highlight holds it is not in the note, but its Highlight is. A Kept comment's ancestors that are not Kept appear as Context stubs, so the nesting reads correctly. The Reader's own headings, stub lines and `handleOf` come from the shared reader-text module.
- An image link in the post text that names one of the Item's own files becomes the bare file name, so the folder works wherever it is copied.

### Items that change during the export

- An Item deleted before its slice reads it is left out.
- A missing post text file or image makes the slice read the Item again once, because a refresh in between gives the Item new keys. A second miss throws `ExportFileMissing`, so the attempt fails and retries. This re-read is the only protection against a file deleted during an export, and no deletion hold exists.
- An Item refreshed between two slices of its own entries can leave entries of the old and the new version in the zip.

### Not a snapshot

The slices read the live database over minutes, so a row written between two slices can appear in one table's file and not in a related one. The manifest's `openItems` counts the Items that had an open job when their page was read, because a Restore may see their text and Digest from different moments. An Item deleted after its page was read stays in the zip.

### One at a time, kept 24 hours

The partial unique index `exports_one_live` allows one `running` or `ready` row, so a second start while one runs answers 409. A start while one is `ready` marks the old row `failed` with `replaced` and removes its objects.

| State | Removed by the sweep stage `exports` |
|---|---|
| `removing` | at the next run |
| `failed` | 12 minutes after its last update |
| `ready` | 24 hours after `finished_at` (`EXPORT_KEEP_MS`) |

The 12 minutes are the 10-minute slice deadline plus the 2-minute claim margin (`EXPORT_SLICE_DEADLINE_MS`, `CLAIM_MARGIN_MS`), so the claim of a slice that was still running has expired and its guarded commit fails. The wait does not stop that slice.

`DELETE /api/export` removes a ready or failed export at once. It stops a running export (`failed`, `cancelled`) and leaves its objects to the sweep, because a slice that is already running fails its guarded commit and deletes what it wrote.

A runner is never cancelled. A slice that a host suspend, `podman pause` or a stalled disk held for longer than 12 minutes can still write its objects after the export is `expired`, and if the process then stops before the runner deletes them, the objects stay under the `expired` row. The `exports` stage therefore lists `exports/` on every run and deletes each object whose export row is `expired` (`cleanExports`, logged as `export-stray-objects-removed`). Such an object lives until the next sweep that runs the stage, because only the stages in `WHILE_RESTORING` run while a Restore holds the library (`restoreHoldsLibrary`; see While it runs). The stage leaves the objects of a `running`, `ready`, `failed` or `removing` export to the removal above, and the objects of an export with no row (after restoring an older database copy), which nothing removes.

### Limit of the download on the Worker

The download reads 2 objects per slice and the tail, and each read is a subrequest of the one invocation that streams the zip. The same invocation makes up to 3 other calls (the session check, a session renewal, the `exports` row), counted here as subrequests, although Workers may not count D1 calls ([Open items and unverified claims](open-items-and-unverified-claims.md)).

The Cloudflare target needs Workers Paid ([Cloudflare deploy button](cloudflare-deploy-button.md)), which allows 10,000 subrequests (Workers docs, Limits). So 2 x slices + 1 + 3 <= 10,000 gives at most 4,998 slices, and a library needs at least its Items divided by 40 slices. The container has no such limit.

| Library | Slices | Subrequests |
|---|---|---|
| 4,000 Items, best case (40 per slice, and one more slice finds the end) | 101 | 206 |
| 4,000 Items with files of 4 to 8 MiB each | about 4,010 (10 record slices, a guess) | 8,024 |
| 4,000 Items with 20 images of 2 MiB each | 20,000 or more | does not fit |

The slice counts are arithmetic. The largest download run on a Worker is 6.1 MB in 4 slices (Measured runs). The Free plan is not supported.

## Restore

A Restore is the upload of an Export zip into an Instance whose library is empty, and a chain of jobs of the kind `restore` that writes every record with its id. It brings back the records, the stored images and post text files, the search parts and the Highlight anchors, with cancel, resume and the cleanup of parts. Only the owner's session may call its routes, and an agent token gets 403.

```text
uploading --start--> running (check, tables, files, search, highlights, finish) --> done
    |                   |
    | Cancel            +-- the check refuses the zip ------> failed (refusal code)
    v                   +-- a unit fails 3 times -----------> failed (gave-up) --Resume--> running
 cancelled              +-- Cancel past the check ----------> running (undoing) --> cancelled
```

### Upload

`POST /api/restore` answers 409 in two cases.

- `library-not-empty`: the library holds an Item, Topic, Tag, Log entry, Proposal, Pin or Import cursor.
- `restore-open`: a Restore is already open. That is one that waits for its upload, one that runs, or one that `failed` with `gave-up` and so still holds the library, which the owner resumes or cancels first. `createRestore` checks the library first, so a run that already wrote records, which is the usual case for a `gave-up` run, gives `library-not-empty`. `restore-open` is the answer only while the library is still empty, such as a `gave-up` in the phase `check`.

A Restore that a refusal of the check ended does not block an upload. The Restore screen offers no file picker while a `gave-up` run holds the library.

- The client cuts the zip into parts of 32 MiB (`RESTORE_PART_BYTES`). The limit is `RESTORE_MAX_BYTES` (50 GB). A part upload can be repeated while the Restore is `uploading`, and `GET /api/restore` lists the parts that arrived, so a reloaded page sends only the missing ones.
- After the write, `storePart` bumps `updated_at` of an `uploading` row, which keeps a slow upload from looking abandoned.
- When the row has left `uploading`, `storePart` keeps the part if the Restore still holds its parts: it is `running`, or `failed` with `gave-up` outside the `undoing` phase. Start required every part, so the key existed before and the Restore needs it, and a retry of a stalled part can land after Start. Otherwise (`done`, `cancelled`, or a failure that is not resumable) it deletes the part it just wrote and answers `409 not-uploading`.

### Start and check

`POST /api/restore/<id>/start` flips the row to `running` and opens the first job in one guarded batch.

- A Restore that is past its upload (`running`, `failed`, `cancelled` or `done`) gives `409 not-uploading`, also when a Cancel ends it between the reads of the start. `restore-open` belongs to `POST /api/restore` alone.
- A live Vault mirror lease gives `409 vault-busy`. The uploaded parts stay ready for retry.
- The same guarded batch deletes the `ai_tasks` rows that no Digest names (`deletedUndigestedTasks`), such as the task of a Verify that the owner pressed on the empty Instance. The zip holds only the tasks that Digests name. An insert that repeats a key is dropped, so a task left on the Instance would take the id of a zip task, and the restored Digest would name the wrong row.
- A Verify pressed after Start answers 503 `restoring` and writes no task, because `insertTask` writes through the Restore hold ([While it runs](#while-it-runs)). The delete at Start and the hold together keep every zip task's id.
- A Grok Bot answer that arrives for a deleted task finds no row. A Verify that still waits reads its answer only from a row with a callback hash, and a restored task has none, so it answers `unreachable` instead of taking the zip's task as its answer.
- The upload comes before the job chain, which has the phases `check`, `tables`, `files`, `search`, `highlights` and `finish` (`RESTORE_PHASES` also lists `upload`), and `undoing` while a Cancel runs.

The check is a separate phase so that its time per request is bounded and the Worker never reads a whole zip in one request. Each check job reads one region of about 8.25 MiB (`RESTORE_CHECK_BYTES`) and moves a cursor that commits with the next job. A refusal ends the Restore `failed` with one code from `RESTORE_REFUSALS` in one guarded write. The check also logs one `restore-check-refused` line, when it refuses, whether or not the guarded write then lands (a Cancel that wins the race leaves the run `cancelled`). The line holds the Restore id, the code, the refusal's message and the error class (`RestoreRefused` or `ZipRefused`). A message is a fixed text, with at most a line number and the name of a table of the export format, and never a name taken from the zip. The job closing then deletes the parts, and the check writes nothing to the library.

The zip reader imports nothing from Restore. It throws `ZipRefused` with its own fault, and `restoreRefusalOf` maps each fault to a code and keeps its message. A local header whose extra field puts the data of its entry past the start of the central directory is refused with `not-a-zip`, so a check job never stops on an entry without moving its cursor. The check and the slices read the zip through `partSource`, which streams the parts in order, so a read holds one region and never a whole part.

### Schema version

Restore accepts only an Export of the running migration, because older Export zips are not supported. The manifest's `format` names the zip layout (`EXPORT_FORMAT`) and stays 1 while that layout holds. A migration that changes the columns of a record changes `migration` instead, so Restore refuses an older zip with `other-release` before it reads a record.

- The check validates the manifest before any library record is written.
- `phaseUnit` compares the manifest's `migration` with the running one again before every unit of the `tables`, `files` and `finish` phases (`verifiedRelease`). The check reads the zip directory and the manifest once, and the unit uses those two reads, so a unit reads each of them once. A Restore that a deploy or a restart moved to a newer migration between two units therefore ends `failed` with `other-release` (and the same log line) before that unit writes, and not `done` with the rows of the changed tables counted as dropped. The rows written before that stay until the owner cancels the Restore.
- Each record must carry exactly the exported columns of its table. A column deliberately left out of backups takes its default from the schema, and the registry fails to build when such a column has none.

### Values

- A duplicate member name in a line is read the way `JSON.parse` reads it (the last one), at the check and at the write, because the write binds the re-serialized row.
- A row whose serialized form passes `RESTORE_BIND_BYTES` (1,900,000 bytes, under the 2,000,000 bytes a bound string may hold on D1) is inserted alone, with each column bound separately.
- In a singleton table a repeated key updates the one row. In any other table a row that repeats a key of an earlier row is left out and counted in `restores.dropped`, like a row whose parent is missing, because the check keeps no per-key state (a staging table would hold every key of a library of millions of rows).
- A row that a CHECK or trigger refuses fails the slice.
- `reddit_settings` is emptied by the finishing slice when the zip lacks it. `catalog_version` and `log_start` take the rows the zip holds, and a Cancel keeps them so the seeded catalog counter remains present and the Log keeps its start date.

### Slices

Each job reads the next window of one record file (at most `RESTORE_UNIT_LINES` (500) lines or `RESTORE_UNIT_BYTES` (1.5 MB)) in foreign key order (`RESTORE_ORDER`, derived from the Drizzle schema). The window, the new cursor and the counts commit in one guarded batch that also opens the next job. A slice that dies is read again from the saved cursor, and a repeated slice writes nothing twice.

The last slice raises each `AUTOINCREMENT` counter of `sqlite_sequence` to the exported high-water mark, so a new Item continues after the highest restored id even when the exported Items with the top ids were deleted. It uses ordinary `UPDATE` and `INSERT` statements, as the SQLite documentation allows, and this ran on the container, on local D1 (`wrangler dev --local`) and on real D1 (see Measured runs).

### Files

The `files` phase walks the file names that rows hold, not the zip. `NAMED_FILES`, which `cleanFiles` also uses, lists each `media.file_key` and `items.post_text_key` with its Item. A job reads up to the next 1,000 of them by `(Item id, key)` (`RESTORE_FILE_ENTRIES`, cursor `{ owner, key }`) and restores those that fit one `RESTORE_FILE_BYTES` (8 MiB) window (`windowOf`). It looks each name up in the zip's directory.

- A name that the zip lacks, a name outside its Item's folder, an image above 2 MiB (`IMAGE_MAX_BYTES`) and a post text file above 8 MiB (`ITEM_REQUEST_BYTES`) are counted as missing and not read. Those are the sizes the app stores, so no unit buffers an entry larger than the app itself writes.
- `entriesBytes` reads the span of one window with one read (`extentWith` sizes it: at most 8 MiB plus one entry), plus one read of the header and one of the data for an entry whose local header is longer than `LOCAL_HEADER_ROOM`. It checks each CRC-32 and each local header's name against the directory. A read per file would stream half a part for each one. `readDirectory` refuses a zip that holds one name twice.
- A put of the same key and bytes can repeat, so a window read again writes the same objects.
- `restored.files` counts the objects put and `dropped["missing-files"]` the names that no object answered. The status route shows them as `files` and `missingFiles`, so a table named `files` cannot collide with them.
- A row whose file is missing stays. For an image, the Reader links the image's original web address (`media.source_url`, sent as `sourceUrl` in `images`) in place of the picture. For a post text file, the Item shows no text (`textLost`). The screen names the missing files in their own line and leaves both counts out of the record totals.

### Job ids in keys

A key holds the id of the job that stored it (`items/<id>/post-<job>-<attempt>.md`), and the `jobs` table is not exported, so a new Instance numbers its jobs from 1. The finishing slice moves the `jobs` counter above the highest job id found in the restored names, so a later fetch on this Instance cannot write a key a restored Item names and then delete the restored object as superseded.

### Search

The `search` phase rebuilds `search_parts` through `restoredPartWrites`, which calls `rebuiltPartWrites` for every kind of part, so restored Items are searchable when Restore ends.

- `RESTORE_INDEX_ITEMS` bounds the commit guard below D1's 100 bound parameters per statement, and `RESTORE_INDEX_BYTES` bounds the post text and Kept comments read in one job.
- D1's [2,000,000-byte string limit](https://developers.cloudflare.com/d1/platform/limits/) still applies to each bound string. `keptBodies` reads separate comment bodies, and `commentPartWrites` chunks them and groups the parts with `jsonArrays`. A Restore whose Kept comments total more than 2,000,000 bytes is unverified on real D1.
- File-backed post text is read through `postTextOf`.
- Each job commits only while every Item still matches its read snapshot (`snapshotHolds`) and the cursor has not moved. Otherwise it reads the unit again.

### Highlights

The `highlights` phase anchors again the Highlights of each Item that has any, up to `RESTORE_INDEX_ITEMS` (8) Items per job and fewer once 4 MiB of text has been read. It uses `anchoredOutcome`, the code that a refresh and a Digest publication run, so the status and `start` come from the restored text and not from the exported columns.

- A post Highlight is anchored in the Item's post text, read only for an Item that has a post Highlight.
- A comment Highlight is anchored in the body of its comment in the thread the Reader shows, with the readability rule of the Reader (`commentReadable`). An Item with no stored thread has no comment text, so its comment Highlights become no longer found, as after a refresh.
- The projection of a text (`projectText`) held about 500 MB of heap per MiB in a node run and aborted under a 128 MB heap at 600 KiB (the Worker's limit). A text above `RESTORE_ANCHOR_BYTES` (256 KiB), a post text file the zip lacked and a comment above that size therefore keep the exported status of their Highlights, counted in `dropped["highlights-as-exported"]` (`keptHighlights` in the status). An attached post Highlight always has a place, because its revision is the Item's generation, so these Highlights stay readable.
- Each job commits only while the Highlights of its Items are the ones it read (`anchorsHold`) and the cursor has not moved.

### No work in flight

A restored Instance starts with no jobs. A Proposal in state `accepting` is restored as `open` with its counters reset, so the owner can Accept it again, and the Items it already moved are safe to move again. An Item that had an open fetch or Digest job when the Export read it has no job after the Restore, so nothing resumes its work.

### Not restored

Provider keys, the password, sessions and agent tokens are not in the zip, so the owner enters them again, and the screen says so.

### While it runs

A write that adds a record to a table the zip brings back answers 503 with `code: "restoring"`. The new record would take an id or a key the zip holds, and the Restore's later window of that table would leave the zip's row out as a repeated key. The hold covers the writes made while it stands. An AI task written before the Restore started, such as a Provider Verify on the empty library, keeps its id, and the zip's AI task with the same id is left out.

- Requests that store no Item answer their own refusal. `POST /api/items` and `POST /api/items/batch` read no Restore state before they write, so a refused host answers 400, a batch of only refused links without a cursor answers 200, a token over its Daily budget answers 429, and an unknown token answers 401. A short link is resolved over the network before its write is refused.
- The guard does not rely on a check that a write can outrun. Every write the hold refuses commits through `heldBatch`, the one door in the Restore hold module, and no other module builds a batch with `restoreGuard`. `heldBatch` puts `restoreGuard` in front of the writes, so a batch that a Restore holds off rolls back whole, as every guarded batch does ([Database and search](database-and-search.md), Guarded batches).
- `itemInsert` stays the one place that builds an insert into `items`, and its callers commit that insert through `heldBatch`.
- `restoreGuard` fails with its own refusal (`guards_restore`). `whileOpen` answers `restoring` when a write fails with it, and it rethrows every other failure without reading the predicate again.
- Every batch that holds `restoreGuard` starts with it, before the guards of its own condition, so a write that lost a race for another reason, such as an Item that already exists, does not hide the hold, and a batch of known links is refused too.
- The Restore's own inserts (`insertRows`) take no guard, because they are not a Paste.
- These writes answer the same 503: storing an Item, saving the Import cursor, keeping a Highlight, saving a Note, accepting a Proposal of any kind but `highlight-lost`, and queuing a Digest or a Topic overview again. A Provider Verify, a Provider save and a save of the Reddit setting answer it too.
- Each of them adds a record whose id or key the zip may hold: an Item, a Highlight id, the Note of an Item, a Pin, a Log entry or an AI task. Each writes through `heldBatch` and answers through `whileOpen` ([Database and search](database-and-search.md), Guarded batches).
- Reads, deletes, a Read state, a Reject and the removal of a lost Highlight take no key, so they work meanwhile.
- The Restore always writes the Reddit setting: it inserts the zip's row, or the finishing slice clears the table when the zip holds none (`singleton: "reset"`). A save of that setting during the hold would be replaced either way, so it is refused.
- `insertTask` is the one door for a new AI task, so a Provider Verify, a Digest, a Topic overview and a Grok Bot task all carry the guard. A job that is already running when the hold begins meets the refusal at this write. The engine queues it again with the same attempt count, so the hold spends none of its retries, and the next claim waits for the end of the hold.
- A Provider save is refused, although the zip holds no Provider settings. The save queues Digest jobs for the Items without a Digest, and those jobs would write records the zip brings back. A Grok Bot Provider gets the same refusal.
- Owed Digests are not opened while the hold stands, because `owedDigests` holds the same predicate. A Restore queues no Digest itself. After the hold, an Item that the zip brought back without a Digest waits for the next Provider save or Digest request. With the Grok Bot as the Provider, the sweep queues those Digests itself, 20 per run (`sweepDigests`).
- No job of an owned kind is claimed while the hold stands (`isDue`). A job that a write queued before the hold waits, and only `export` and `restore` jobs run.
- A sweep that read the hold as released before a Restore started can still reach its later stages. So the claim of a weekly check (`claimingWeek`) and the opening of owed Digests hold the predicate in their own statement, and a Merge's units commit through `heldBatch`. A unit that the hold refuses leaves the Merge `accepting` without counting a failed run, and the sweep continues it after the hold.
- The claim guards the start of a job, not its result. A job claimed before the hold began can still write its result during the hold, such as a Digest with its Topics and Log entries. `Start` needs an empty library, so only the `undoing` phase of a Cancel can meet such a job. The undo reads every restored table again on each unit, so it deletes that result too, unless the job commits after the last unit.
- `sweep` runs only the `enqueue` and `restores` stages while the newest Restore is `running` or `failed` with `gave-up` (`HOLDS_LIBRARY`, the one predicate that `restoreGuard`, the job claim, the sweep and the file cleanup use). No other stage writes a half-restored library, and the stages wait and run after the owner resumes or cancels it. A Restore that failed with `gave-up` therefore keeps the library closed to Paste the way a running one does, and a Restore that a refusal of the check ended does not.
- The batch saves the Import cursor through `heldBatch` too (`saveImport`), because the Item writes cover only inserts into `items`. A batch whose links were all refused hosts adds no Item, so a Restore can start while it runs, and an unguarded cursor write would land in the restored library, where nothing in the zip accounts for it. The batch then answers 503 `restoring` and keeps the old cursor.
- A Restore that a deploy or a crash interrupts resumes on the container at the next start and on the Worker when the sweep takes over the expired claim. A slice that fails 3 times marks the Restore `failed` with `gave-up` and leaves the rows written so far. The owner then resumes or cancels it (next section), and a new Restore can start only after that, because it needs an empty library.

### Cancel and resume

`DELETE /api/restore/<id>` cancels. Cancel and Resume act only on the newest Restore, and an older id answers 409 `superseded`, so a page that still shows an older failed Restore cannot erase a newer library. A cancel of a `done` Restore answers 409 `finished`. An already `cancelled` run answers 204 to a Cancel and changes nothing but the deletion of its parts.

**A Restore that wrote no library record.** An `uploading` Restore becomes `cancelled` at once and loses its parts. A `running` or `failed` Restore whose `restores.restored` is still `{}` and that is not `undoing` has written no library record, because every written record row is tallied there in the batch that writes it. That covers the phase `check` (a refusal of the check, which frees the library so the owner may save Items before the Cancel, and a `gave-up` in the check) and the phase `tables` until its first slice commits.

- Cancel moves such a Restore to `cancelled` in one guarded batch that tests `restored` in the same statement as the update, closes its open `restore` jobs, then deletes its parts, and leaves the library alone.
- A slice that commits first makes the test fail, so the Cancel takes the undo below. A slice that finishes later finds the row `cancelled` and writes nothing, because its commit is guarded by the state, the phase and the cursor.
- The undo step itself deletes nothing and settles the row as `cancelled` when `restores.restored` is `{}` (`wroteNothing`), so an undo job that was queued for such a Restore cannot empty a library that holds Items saved since.
- The route answers 204, as it does for an upload, and `GET /api/restore` shows `cancelled` at once. Only a cancel that starts an undo answers 202.

**The undo.** Any other `running` or `failed` Restore past `check` moves, in one guarded batch, to state `running` with phase `undoing` (`cancelRestore`; `GET /api/restore` shows it as `cancelling`). The same batch closes the open `restore` jobs of that Restore and opens a new one, so the unit in flight finds its cursor changed and writes nothing, and the third failure of an older job cannot end the undo.

Each undo unit deletes up to 500 rows of the first table that still has rows. It deletes by table, not by Restore, so an Item the owner saved after a failure that freed the library (`other-release`) is deleted too; cancel such a Restore before saving Items. The order is:

1. The tables that `items` is rebuilt into, which is `search_parts`. Their foreign keys point at `highlights` and `topics` without a cascade, so rows that a sweep wrote before the failure would make the delete of those tables fail.
2. The restored tables in the reverse of `RESTORE_ORDER`, one query per table, because D1 refuses a compound `SELECT` of more than a few terms. A unit looks again at every table, so a row that appears in an earlier table is still found.
3. Every object under `items/`, up to 1,000 a unit, before the unit commits.

The last unit sets `cancelled` and supersedes the parts. The undo skips `log_start` and `catalog_version`, resets no sequence, and empties `reddit_settings` only when `restores.restored` shows that the run wrote it. What the `files`, `search` and `highlights` phases wrote needs no undo step of its own: `search_parts` go first with the other dependents, the Highlights go with the restored tables, and the listing of `items/` removes every stored image and post text file. A `files` unit that was in flight when the cancel started can put an object after the last listing, and `cleanFiles` removes it because no row names it. A cancel that fails 3 times (`gave-up` in `undoing`) shows `cancelFailed` and is cancelled again, not resumed.

**Resume.** `POST /api/restore/<id>/resume` accepts a Restore `failed` with `gave-up` whose phase is not `undoing` and whose parts are all stored (`resumable` in `GET /api/restore`). It moves the row to `running` and opens a job, which continues from the cursor of the last committed unit: `{ owner, key }` in `files` and `{ after }` in `search` and `highlights` (the next job reads its Items again). A resume that is not allowed answers 409 `not-resumable`. A refusal of the check keeps no part and cannot be resumed. A `gave-up` failure keeps its parts for Resume, and the sweep deletes them 24 hours after the failure, like an abandoned upload. Resume then answers 400 `incomplete-upload` and the owner cancels.

### Cleanup of parts

The sweep stage `restores` (`cleanRestoreParts`) runs after `exports`. It first sets an `uploading` Restore to `cancelled` when its `updated_at` is older than 24 hours (`RESTORE_PARTS_KEEP_MS`). It then deletes every object under `restores/` except those of an `uploading` or `running` Restore and of the newest Restore when it is `failed` with `gave-up` outside the `undoing` phase and its `updated_at` is less than 24 hours old. The stage also runs while a Restore holds the library, because that is when a failed Restore's parts age out.

## Measured runs

Runs of 2026-11-16 on the container and on a deployed Worker, not repeated after later Restore changes (the Item-insert guard moved into the write batches, and a failed run now holds the library). [Open items and unverified claims](open-items-and-unverified-claims.md) lists what no run covers.

| Run | Largest case | Result |
|---|---|---|
| Export on the Worker | 218 entries, 6.1 MB, 4 slices | slice CPU 287 to 556 ms, wall 7.4 to 18.5 s; download 215 ms CPU, 2.1 s wall |
| Restore on the Worker | 116 Items, two preview deployments | 117.8 and 122.6 s in 42 and 41 units; at most 745 ms CPU and 8.8 s wall per unit |
| Restore on the container | 6 Items | 1.2 s |

- All four zip readers (`unzip -t`, `bsdtar -tf`, `7zz t`, and `python3 -I` with `zipfile.ZipFile(...).testzip()`) passed every zip. Every Worker invocation ended `ok`, and the largest slice CPU time, 556 ms, is 0.2% of the 300,000 ms `limits.cpu_ms` in the Wrangler config. Every Restore brought back each row of the zip, dropped 0 rows and left no file missing.
- On the Worker, the Item documents of all 51 Items and the 6 image files equal the live demo's. On the container, the Reader text and images of the checked Items equal the source, and Highlights and a Note added to the copy came back `attached` with `keptHighlights` at 0.
- The container Export ran on a second container from the same image over a copy of the owner's database (`sqlite3 .backup`) and files, because the export route takes the owner's session and no agent can read the owner's password.
- An Export started 3 s after an Import of 100 links listed 116 of the 151 Items and counted 65 with an open job. No foreign key column of the zip names a row it lacks. Its Restore brought back 116 Items, 51 Reddit threads and 1,805 comments, and the restored Items had no job to finish them (67 had no Digest).
- A unit takes 2.8 to 3.3 s on the Worker against 1.2 s for the whole 6-Item Restore on the container. How the wall time splits between D1, R2 and CPU is not measured.
- After the third Restore, D1's `sqlite_sequence` held `items` 178 (the manifest value; the highest Item id of the zip is 143), and the next `POST /api/items` got id 179. Had the writes been skipped, SQLite would have handed out 144.

`wrangler dev --local` does not enforce the 128 MB isolate limit (Workers docs, Limits), so the slice size comes from local figures of 2026-11-15 on the owner's workstation:

- A slice of 23 MiB raised Node's peak resident memory from 296 to 450 MiB over 6 slices, so a slice is 8 MiB.
- A slice of about 8.4 MiB took 226 to 321 ms of wall time on local workerd over 200 Items with 300 KB of post text each (15 slices).
- CRC-32 of 24 MiB took 101 to 104 ms in Node (5 runs).
