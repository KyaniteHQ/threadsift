# Proposals

This page describes how each kind of Proposal is checked each week, listed, accepted, rejected and pinned. [GLOSSARY](../GLOSSARY.md) defines Proposal and Pin.

- [The lifecycle](#the-lifecycle)
- [The read](#the-read)
- [Reject](#reject)
- [Accept](#accept)
- [Pins](#pins)
- [The weekly Tag and Topic checks](#the-weekly-tag-and-topic-checks)
- [The weekly Highlight check](#the-weekly-highlight-check)
- [The weekly overview check](#the-weekly-overview-check)
- [The weekly disagreement check](#the-weekly-disagreement-check)
- [The Log entry](#the-log-entry)
- [The page](#the-page)
- [The reads of the run](#the-reads-of-the-run)
- [Identity](#identity)
- [Not verified](#not-verified)

| Kind | Subject | Weekly check | Accept |
|---|---|---|---|
| `tag-merge` | Two Tags | Model run (`proposals`) | Merges the Tags and leaves a Pin. |
| `topic-merge` | Two Topics | Model run (`topic_proposals`) | Merges the Topics and leaves a Pin. |
| `highlight-lost` | A Highlight that is not found | Plain check (`highlight_proposals`) | Removes the Highlight. |
| `overview-gap` | A Topic whose overview leaves out Items | Plain check (`overview_proposals`) | Starts an overview run. |
| `items-disagree` | Two Items of one Topic whose Summaries disagree | Model run (`disagreement_proposals`) | Keeps the pair on the Topic page with a Pin. |

A plain check calls no model, makes no `ai_tasks` row and opens no job. The name in parentheses is the key of the check's claim row in `scheduled_runs`. [Jobs, leases and the schedule](architecture/jobs-leases-and-the-schedule.md) and [AI tasks and Providers](architecture/ai-tasks-and-providers.md) (The `proposals` task) hold the run, its input and its freshness rule. [Data model outline](architecture/data-model-outline.md), Proposals and Pins, holds the tables and constraints.

## The lifecycle

A row starts `open`, except a merge pair that the weekly run sent and the model did not return, which starts `declined`. The states are `open`, `accepting`, `rejected` and `declined`. Only a merge kind holds `accepting` or `declined`, and the database refuses them on any other kind. Every kind can end `rejected`.

Only the lifecycle module moves a row between states or removes it. A statement that moves a row names the state it moves the row from, so it leaves a row in another state alone. The constraints refuse a state that a kind cannot hold and the `accepting` columns on a row that is not `accepting`. They do not define which transitions are allowed. A row also goes one other way: the foreign-key cascade on the subject columns of its subject table, whose trigger deletes the row. The subject tables hold their reference to `proposals` with no action, so a Proposal is removed through its subject row (see Trigger depth on D1 in [Decisions and evidence](architecture/decisions-and-evidence.md)).

- **Reject.** A row of any kind moves from `open` to `rejected`.
- **Apply.** An Accept of a merge moves the row from `open` to `accepting` before any unit runs. A first unit that throws hands the row back to `open`. The columns `cursor`, `moved`, `unit_revision` and `failed_runs` mean something only while the row is `accepting`. The row leaves with the Tag or Topic it names, in the last unit's batch, by the cascade.
- **Remove.** An `open` row is deleted when Accept of an overview update or of a disagreement commits, and when a weekly stage finds that the row no longer holds. The row of a lost Highlight goes with the Highlight.
- **`declined`.** The weekly merge run inserts a `declined` row for each pair the model did not return. A `declined` row never changes.
- **Merge lock.** One merge runs at a time. It holds while a row of any kind is `accepting`.

## The read

`GET /api/proposals?cursor=` answers the owner's session and an agent token. The MCP endpoint has no tool for it. It lists `open` and `accepting` rows of every kind, 50 to a page, newest first by `id`.

- A merge row shows its `items` counts as of the call. A disagreement row shows the title and `summary` of the stored Digest the row names, so the page shows the text the model judged and never a later text.
- A row is listable while its subject condition holds: a merge row always, a `highlight-lost` row while its Highlight is not `attached`, an `overview-gap` row while the Topic still has the gap, and an `items-disagree` row while it stays listed (What hides and deletes a row). Each kind's query inner-joins its subject table, so a row with no subject row is not listed.
- The page is one snapshot of the five kinds' results by id, so a hidden row leaves a full page and not a short one. The eligibility, the quote, the Item and the title come from one batch, because a later read could pair a row with a subject that the row was not chosen for.
- `checkedAt` is the largest `last_run_at` of the weekly claims. `provider` says whether a Provider is saved.

`GET /api/proposals/{id}` answers `{ state }` for one row of any state, including `rejected` and `declined` rows, which the list hides. It answers 404 for an unknown id and for a row with no subject row. It answers the owner's session and an agent token, and the MCP endpoint has no tool for it. The Proposals page reads it when an Accept or a Reject ends with no answer.

## Reject

`POST /api/proposals/{id}/reject` is owner-only. It runs one `UPDATE ... WHERE state = 'open' RETURNING`, and the `WHERE` also requires a subject row. It reads the row again only when the update changed nothing, and then it answers 404 for an unknown id and for a row with no subject row, and 409 `not-open` for a row in another state.

Reject is final. There is no undo, and Reject changes no Highlight and no Topic page. A rejected row stays, so the weekly check never proposes the same subject again, in either order for a pair. An accepted disagreement row is deleted instead, and its Pin keeps the pair decided while both Items carry the Digests the Pin was accepted on.

## Accept

`POST /api/proposals/{id}/accept` is owner-only. An agent token gets 403, and the MCP endpoint has no tool for it. Accept has no confirmation and no undo. It reads the row's kind and runs the Accept of that kind.

| Answer | Kinds | Meaning |
|---|---|---|
| 404 | All | Unknown id, a row with no subject row, or a repeated Accept after a success for a kind whose Accept deletes the row. |
| 409 `not-open` | All | The row is in another state. |
| 409 `not-current` | Lost Highlight, disagreement, overview | The row's subject changed since the row was made, or a concurrent Accept removed the row between the read and the guarded batch. A concurrent Accept that finished before the read gives 404. |
| 409 `no-provider` | Overview | No Provider is saved. The row stays open. |
| 409 `merge-busy` | Merge | Another row of either merge kind is `accepting`. |
| 200 | All except a long merge | The Accept committed. A merge that finished inside the request answers `{ state: "done" }`. |
| 202 `{ state: "accepting" }` | Merge | Units remain. |

A changed subject leaves its row stored but hidden. For most kinds the weekly stage deletes the row, and a disagreement row whose Items sit in two Topics is kept. Every 409 body is `{ error }` with a name from `ACCEPT_REFUSALS`, the one list that the web app reads.

### Lost Highlight

Accept uses the same writes as Remove in the Reader, including the Vault mirror queue entry. The cascade deletes the subject row, and its trigger deletes the Proposal row. The guard holds only while the row is `open` and its Highlight is not `attached`. When a publication anchors the Highlight again between the read and the batch, the batch writes nothing and the call answers `not-current`.

Accept leaves no Pin, because a Pin keeps a regeneration from undoing a correction and nothing regenerates a Highlight.

### Disagreement

Accept needs no Provider. `not-current` has three causes: either Item no longer has the Digest the pair was judged on, the two Items no longer sit under one Topic, or a concurrent Accept removed the row before the guarded write.

One guarded batch inserts the Pin, queues the Topic page's Vault note when the Pin was written, and deletes the row. The Pin insert is an upsert on `(kind, from_key)` that updates only when the stored Pin is not current. A stale Pin of the same pair is replaced in place and keeps its id, and a current Pin stays. An `open` row whose pair already has a current Pin is therefore deleted with the Pin untouched, and the call answers 200. Accept changes no Item, Summary or overview.

### Overview update

Accept starts an overview run through the same start as Try again. [The library wiki](wiki.md) (Topic pages, Try again) owns its guard, its owner choice and its answers. Accept adds two conditions to the guard: the row is `open` for this Topic, and the Topic still has an Item the overview was not built from. `not-current` also covers a Topic that already has an overview run open. After the job insert the batch deletes the row, which changes nothing unless a job was inserted. Accept of an overview update has no `accepting` state and no `merge-busy`.

One run reads at most 40 uncovered Items and starts the next run itself until every Item is covered ([AI tasks and Providers](architecture/ai-tasks-and-providers.md), Continuation, holds the cost). The row shows the number of uncovered Items, so the owner sees the size before the press. A Topic whose uncovered Items have only unparsable Digests is never covered, so its row, once accepted, is proposed again in a later weekly check unless the owner rejects it. The design accepts that repeat as a known cost.

### Merge

One merge runs at a time, so no two merges touch one Tag or one Topic. Overview writes use their own input revision guards. In this section `from` is the Tag or Topic that goes, and `into` is the one that stays.

A merge runs in guarded units, each one batch ([Database and search](architecture/database-and-search.md), Guarded batches). A Tag unit moves up to 100 Items, and a Topic unit up to 500 Items and 500 Log entries. These sizes and the bound of 50 units per request are our choice. The two kinds share the guard, the Pin writes, the Log entry, the closing writes and the answers. Each kind differs in its tables, its link to an Item, its Log action and what a unit plans.

- Accept claims the row (`open` to `accepting`) when no row is `accepting`, and answers `merge-busy` otherwise. Every unit holds while the row is `accepting` at the unit revision it read, and holds both ids and both stored keys as it read them. Two runners therefore never move the same Items twice, and a unit that loses the guard writes nothing.
- The Pin insert is an upsert on `(kind, from_key)`, where `from_key` is the `catalogKey` of the name of `from`, and every unit repoints the Pins that target `from` to `into`. The Pin commits with the first Items, so a Digest that publishes during the merge already lands on `into`.
- A Tag unit takes the next Items that link to `from`, by ascending Item id after the cursor, and moves the links before it rewrites the Digests. The Digest rewrite drops repeated Tags by key, keeps the first place, and writes `$.tags` alone, so it does not undo a concurrent Topic rewrite of the same Digest. It is guarded per Digest, so an Item whose Digest changed in between keeps its link and its Digest for a later unit.
- A stored Digest that does not parse, or whose text holds a second `tags` key that SQLite and `JSON.parse` read differently, keeps its text. Its link still moves, and one `merge-digest-unreadable` line names the Item id. An unparsable Digest never stops the merge, because one merge at a time blocks every other merge Accept.
- A Topic unit moves its Items and Log entries with the shared Topic rewrite ([Data model outline](architecture/data-model-outline.md), Catalog keys). A Topic merges in one unit only when both collections fit.
- `moved` counts the `item_tags` rows of `from` among the unit's Items whose Digest still matched the read, including Items that already had `into`.
- The last unit runs when no link or Log entry to `from` remains. It writes the `merge` or `merge-topic` Log entry, and then the closing writes: for a Topic, one attempt to open an overview run for `into`, then one bump of `catalog_version` (which makes a Digest that read the old list ask again), then the delete of `from`. The cascade of that delete removes the row and every other Proposal that names `from`. The Proposal row stays until that last statement, because the row holds the count that the Log entry reads.

The overview run after a Topic merge opens only when a Provider is saved, `into` has Items its page does not cover or removed Items that its overview still lists, and the Topic's lowest-id Item has no open overview job. When such a job already waits, it runs for `into`, because a job takes its Topic from its owner Item when it starts. The row shows both Item counts before the press. A survivor page with overview text marks the moved Items "Not in overview yet", and a page with no overview text shows no marker.

**Who runs the units.** The Accept request claims the row, then runs up to 50 units. The `merges` sweep stage continues every `accepting` row of either kind, with the same bound, on each tick. A unit that loses its guard counts as one of the 50, the first included. A merge therefore finishes by itself after a closed tab, a crash or an ended Worker invocation. The route and the stage call one function, because a Topic unit that opens an overview job wakes the runner. A unit that throws a database error ends the call, the stage is logged as `sweep-stage-failed`, and the next tick starts again from the stored row.

**A unit that keeps failing.** A unit that fails before its batch commits writes nothing, so the row stays `accepting`. Until a later run commits the unit, `merge-busy` refuses every other merge Accept, and Reject of the row stays refused. A failure of the first unit hands the row back to `open`, so the failure leaves the row as it was. A request that ends after the claim and before the first unit commits leaves the row `accepting` at revision 0, and the `merges` stage runs the first unit on the next tick. No `failed` state exists, because a merge that started cannot go back to `open` once the Pin has committed. The row counts failed runs in `failed_runs`, a unit that commits clears the count, and the page points the owner to the `merge-unit-failed` log line, which holds the Proposal id and the error class.

**Query budget.** A unit costs 4 D1 queries (3 reads and 1 batch, which counts as one query, [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)), so 50 units cost about 200, under the 1,000 queries a Workers Paid invocation may make. The largest bound string is the JSON of a Tag unit's read state, at most 509,401 bytes measured, under the 2,000,000 bytes that the same page allows. Local D1 ran a Topic of 25,101 Items as 50 units in the request and the last 101 Items in one scheduled event. A deployed D1 was not run, so its CPU time per unit is not measured.

## Pins

A merge Pin records an accepted merge. It holds the merged-away name's `from_key` and `from_name`, and the target's id in `into_tag_id` or `into_topic_id`. Neither target column has a delete action, so no target can be deleted while pinned. One Pin exists for a name in each kind, so a Tag and a Topic can share a key.

Publishing a Digest reads the Pins for its Tag keys and its Topic key, for a model result, a caller-sent Digest and a pending Digest alike. A name whose key is pinned becomes the target's name. The Item links to the target, the stored Digest names the target, and no `tags` or `topics` row with the pinned key is inserted. The AI task's own result keeps the names the model returned.

Publication guards its batch on the exact resolution it used: for each key, the Pin it found and its target, or that no Pin existed. The Pin guard is separate from the catalog guard, because the model path drops its catalog guard after `MAX_STALE_REQUEUES` and the caller path has none, and the Pin guard inherits neither gap. A publication that loses the guard is stale and requeues under the existing stale rules.

### The address of a merged-away Topic

A key is looked up in `topics` first. When no Topic has the key, the `topic-merge` Pins answer with the Pin's target. A Topic with the key always wins over a Pin. A Pin is repointed when its target is merged away, so a chain of merges resolves the first address to the last Topic.

The Topic page replaces the address with the survivor's path when the Topic's key differs from the requested key, so a reload and the Back button land on a key that exists. The `topic=` filter of `GET /api/items` and the Index do not follow a Pin, because a filter is built from live lists and an address is stored by the owner. A Tag Pin is not read for an address.

### The Pin of a disagreement

Accept of a disagreement writes an `items-disagree` Pin that names a pair of Items and not a name. It reuses two columns that every Pin has, because the table cannot make those columns nullable without a second rebuild of `pins`. `from_key` holds the pair key `<lowItemId>:<highItemId>`, which the unique index turns into one Pin per pair. `from_name` holds the agent's reason as the owner accepted it. Both Item columns are `ON DELETE cascade`, because the Pin is a statement about those two Items.

The Pin is weaker than a merge Pin, as [the spec](spec.md) and the Pin entry of the glossary say. It binds the pair to the two Digest versions the pair was judged on:

- It survives a regenerated overview, a Topic merge (it names Items and no Topic), a refresh that leaves both Digests alone, and a restart.
- It does not survive a new Digest of either Item, even one with the same Summary text, because the version token changes. The Pin is then stale. The Topic page no longer lists the entry, a later weekly check can judge the pair again once its Topic is touched, and a later Accept replaces the Pin in place.

A pair is current when its Pin still carries both Digest tokens. Four readers use that one condition:

- The Topic page.
- The `decided` list of the weekly check, which reads the rows first and then the Pins. An Accept deletes the row in the batch that writes the Pin, so that read order cannot miss both.
- The store of the weekly check. A returned pair with a current Pin inserts no row.
- The rule that keeps a row listed.

## The weekly Tag and Topic checks

The `proposals` and `topic-proposals` sweep stages claim the `scheduled_runs` rows `proposals` and `topic_proposals`. A claim succeeds when a Provider is saved, at least one Item has a Digest, and one of three things holds: the task has no row, its `last_run_at` is at least 7 days old, or its `last_run_at` is more than 7 days ahead of the clock.

Each stage opens one job in the same batch as its claim, and the newest Item with a Digest owns the job. A stage opens no job when that owner Item already has an open job of that kind. The two claims are independent, so a stage or a job that fails in one check does not skip the other check. The input holds pairs of Tags or Topics that have an Item and no row yet (see [The reads of the run](#the-reads-of-the-run)).

## The weekly Highlight check

The `highlight-proposals` sweep stage claims `highlight_proposals` on the same rule and under the same conditions as the other stages: a Provider is saved and at least one Item has a Digest. The condition is shared so that the page's empty state stays true, because that state says the weekly check needs a Provider. The stage is one `db.batch` of three statements:

1. The claim. It must be the statement right before the insert that reads `changes()`.
2. The insert, with `WHERE changes() > 0` after the claim. A second tick in the week inserts nothing, and a batch that fails spends no week. The insert takes the 20 newest Highlights (`LOST_HIGHLIGHTS_PER_WEEK`) whose status is not `attached` and that have no `highlight_lost_proposals` row in any state. It inserts them in ascending id order, so the newest Highlight lists first. Each row is `open` with the fixed reason `plain-check`, because `proposals_open_reason` needs a reason on an open row.
3. The delete of `open` rows whose Highlight is `attached` again. It comes after the insert, so that `changes()` in the insert still reads the claim's row. It runs only when the `scheduled_runs` row holds this tick's time, because a tick that lost the claim must delete nothing. A rejected row stays, so Reject is final for that Highlight.

Nothing in the check updates `highlights`. Publication stays the one writer of `status` and `start` after the insert, so a Highlight whose text comes back is `attached` again with no help from a Proposal.

**Unattended path.** A stage that throws before its batch commits logs `sweep-stage-failed`, and the next tick tries again, because the claim did not commit. A batch that commits and whose answer is lost (see [Database and search](architecture/database-and-search.md), Guarded batches) leaves the rows stored and the week claimed, so nothing is lost. The page shows nothing about either case. The overview check works the same way.

## The weekly overview check

The `overview-proposals` sweep stage claims `overview_proposals` on the same rule and under the same conditions. The Provider condition is needed here, because Accept starts an overview run and an overview run needs a Provider. The stage is one `db.batch` of three statements:

1. The claim.
2. The insert, with `WHERE changes() > 0` after the claim. It takes up to 20 Topics (`OVERVIEW_GAPS_PER_WEEK`) for which `overviewGap` holds and that have no `overview_gap_proposals` row in any state, so a Reject is final for the Topic. `overviewGap` holds on two conditions:
   - The Topic has an Item with a Digest that `built_from` does not list with that Digest's task id. That is the predicate the Topic page uses. The stage does not use `coverageGaps`, because `coverageGaps` also counts removed Items.
   - No Item of the Topic owns a `topic_overview` job that is not `done`, because that run, and the runs it chains, close the gap.

   The stage chooses the Topics by the number of uncovered Items, most first, then by Topic id. It inserts them in the reverse order, so the Topic furthest behind lists first, with the fixed reason `plain-check`.
3. The delete of `open` rows whose Topic no longer has a gap. The delete runs only in the tick that won the claim, and after the insert. Between claims the page hides such a row and the row stays. A row whose Topic has a run open lists again if that run ends and leaves a gap. A Topic that falls behind again after its row was deleted is proposed again.

An overview run that failed leaves a failure marker and uncovered Items with no open job, so this stage finds that Topic. It also finds Items that arrived, or that a Topic merge moved, while no Provider was saved.

## The weekly disagreement check

The `disagreement-proposals` sweep stage claims `disagreement_proposals` on the same rule and under the same conditions. It opens one job in the same batch, and the newest Item with a Digest owns the job. The batch also deletes two sets of `open` rows: the rows whose Items no longer both have the Digest the row names, and the rows whose pair has a current Pin. It runs only when the claim row holds this tick's time, so a tick that lost the claim deletes nothing. A `rejected` row is never deleted, and neither is an `open` row whose Items merely sit in two Topics.

### Which Topics are read

A Topic is touched when it has at least 2 Items with a Digest and the text of its membership differs from the text stored for it in `topic_checks`. The membership text is `itemId:digestTaskId` for each of the Topic's newest 12 Items with a Digest, joined by commas in ascending Item id. One `group_concat(... ORDER BY ...)` in SQL builds the text, and that syntax needs SQLite 3.44 or later. Four changes inside the newest 12 Items each make the Topic touched: a new Item, a deleted Item, an Item that moved Topic, and a refreshed Digest. A Digest replaced on an older Item does not make the Topic touched.

The read takes the touched Topics in pages of 20, the Topic with the newest Digest `created_at` first. It goes on until the input has no room for another Topic or no Topic is left, so Topics that cannot fit never keep the later Topics out. A Digest with no JSON, no title or no Summary leaves its Item out and logs `topic-digest-unreadable`. The run adds each Topic whole, in that order, while the input stays within the AI input cap (14,000 UTF-8 bytes). A Topic that does not fit loses its oldest Items, down to 2, and a Topic that cannot fit 2 Items is skipped and stays touched.

The model gets each Item's id, title and Summary, and a list `decided` of the Item pairs that already have a row in any state or a current Pin, lower id first. It gets no post text, comment or author.

### The run

The result is at most 10 pairs. Each pair is two different Items that were sent in one Topic, with a `reason` of 1 to 160 characters under `plainText`. Zero pairs is a valid result.

One guarded batch stores the result. Its guard holds while the AI task is running and the membership text of every sent Topic, computed again inside the batch, is still the text the run read. The batch does four things in order:

1. It deletes the `open` rows that no longer match the stored Digests or whose pair has a current Pin so a hidden row of a pair that the run judged again cannot keep the pair's slot in `items_disagree_proposals_pair`.
2. It inserts an `open` row for each pair that has no current Pin and no row of its own. A row that still matches, open or rejected, is kept, and a returned pair that the owner already accepted stores no row.
3. It upserts `topic_checks` for every sent Topic, including a Topic that produced no pair.
4. It completes the AI task.

When the guard fails, the batch writes nothing, the task fails as `stale`, and the job runs again without spending an attempt. A Topic that was touched but not sent stays touched for the next week.

### What hides and deletes a row

An `open` row stays listed while three conditions hold: both Items still have the Digest the row names, both Items are still in one Topic, and the pair has no current Pin. The variants of that condition each differ in one place:

- Accept leaves the Pin condition out, so it answers 200 for an open row whose pair already has a current Pin.
- The weekly delete leaves the Topic condition out, so it keeps a row while its Items sit in two Topics.

A refreshed Summary hides a row at once. The next weekly stage, or the next store of any disagreement result, deletes the row. Two Items in different Topics hide the row too, but nothing deletes it, because a Topic merge of more than 500 Items commits in units, and a pair can sit in two Topics between two units. The row is listed again when the merge ends. A Topic merge leaves the row alone, because the row names no Topic column.

### Cost and budget

Each attempt makes at most one model call, with SDK retries off. The week opens one job, and error retries and stale reruns add calls. A Topic is judged again only after its membership changed, so a library where no Topic's membership changed costs no call.

The output allowance is 4,096 tokens (`AI_LIST_OUTPUT_TOKENS`). It is passed to the executors that take one, and Claude Code takes none. A valid answer of 10 pairs with 6-digit ids and 160-character ASCII reasons is 1,979 bytes of JSON, under the allowance at one token per byte. With 160 CJK characters in each reason the answer is 5,179 bytes, which would exceed it, and a cut-off answer is a refusal that is not retried. The token count of CJK text was not measured.

The static bound counts one token per byte against the 24,000-token context of the model in Measured Digest input budget ([AI tasks and Providers](architecture/ai-tasks-and-providers.md)), which also holds the measured input of the five filled inputs. With the instructions (1,098 bytes) and the schema (559 bytes), input, instructions, schema and allowance come to at most 19,591, at least 4,409 under the context.

### Unattended path

A stage that throws before its batch commits logs `sweep-stage-failed` and tries again on the next tick. A refusal that can be retried retries after 30 seconds and after 2 minutes while the inputs remain current. When the job finds stale inputs, it requeues without spending an attempt. On the last attempt with current inputs, a refusal closes the job with nothing stored and every `topic_checks` row unchanged, so the Topics that changed are read again the next week. The handler has no `blockedBy`, because it writes only `proposals` and `topic_checks` rows. When the job fails before a task row exists, one `disagreement-proposals-run-failed` line names the refusal.

## The Log entry

A `merge` entry holds the two Tag names as written when the merge finishes and the Items that carried the Tag. It names no Tag and no Item, so it blocks no delete and survives an Item delete. A failed merge unit adds no Log entry. A `merge-topic` entry is the same row for a Topic merge, and its `moved` is the number of Items that the units of this Accept moved.

## The page

`/proposals` lists the Proposals, with the words of each kind in one table. The page makes these decisions:

- **No confirmation.** The row's sentence states the effect before the press. An Accept of a merge cannot be undone, an Accept of a lost-Highlight row removes the Highlight for good, an Accept of an overview row starts a model run, an Accept of a disagreement row keeps the pair on the Topic page, and a Reject is final.
- **Accessible names.** Each name begins with the visible label and names the subject. The names of a disagreement row also carry the first 40 characters of each Summary, because Items often share a title and two rows would otherwise read the same.
- **The failed-merge note.** The note ("Applying this merge failed once…") has no live role, because the count rises about once a minute and each rise would be announced again. Polling updates the count silently.
- **Empty state.** The date is the most recent claim time of the weekly runs. A claim time does not say that a check finished, so the last line says no more than the page knows. The list is empty because the check found nothing, is still running, or failed, or because the owner rejected every row. The page shows no failure of the weekly run.
- **No "applying" state for a disagreement or overview row.** Accept answers 200 for these rows, and the overview run belongs to the Topic page. A 409 `no-provider` or `merge-busy` shows a note beside the buttons and keeps the row with its buttons on. A 409 `not-current` reads the list again, where the row is gone, and shows the notice that the Proposal was already decided or is no longer in the list.
- **Reload after a press.** The page reloads the first page once after an Accept or a Reject that changes the list, and announces one result. While a Proposal is being applied, it reads the list again every few seconds down to the last row the owner has loaded, so rows opened with Load more stay. A refused or failed press keeps the loaded list, its row note and focus. The page does not announce changes made elsewhere.

## The reads of the run

The run reads the Tags, or the Topics, that have an Item in pages of 1,000 by id, because D1 caps one result at 50 MB. It reads every row of the run's kind from its subject table in one query. A row is under 100 bytes and at most 20 rows are added a week, so the rows need about 480 years to reach 50 MB (guess).

## Identity

Every `proposals` and `pins` row has a generated id that is never reused. A `topic_checks` row is keyed by its Topic id. The weekly claims in `scheduled_runs` are keyed by the task name. They survive a restart and a deploy, and they stay out of the Export as working tables. The rows below break only where the table says.

| Record | Identity | Breaks |
|---|---|---|
| A merge row | A generated id, and the unordered pair of two Tag or Topic ids, one row in any state | Deleting either Tag or Topic. The cascade removes every merge row that names it, and an accepted merge's last unit deletes the merged-away side, so it also removes the other rows that name that side. No row is ever repointed to another pair. |
| A `highlight-lost` row | A generated id, and `highlight_id` | Removing the Highlight, deleting its Item, or a Highlight that becomes `attached` (the weekly stage deletes the open row) |
| An `overview-gap` row | A generated id, and `topic_id` | Deleting the Topic (a Topic merge, by cascade), Accept (the row is deleted with the run it starts), or a gap that closes (the weekly stage deletes the open row) |
| An `items-disagree` row | A generated id, and the unordered pair of two Item ids, with the two Digest task ids as version tokens | Deleting either Item (cascade), or a refreshed Digest of either Item (the row is hidden at once, the weekly stage deletes it while it is `open`, and a `rejected` row stays). A row whose Items sit in two Topics is kept and listed again when they sit in one. |
| A disagreement Pin | The kind and the pair key `<low>:<high>`, with the two Digest task ids | Deleting either Item (cascade), a new Digest of either Item (hidden, and a later Accept replaces the Pin), or the Items leaving one Topic (hidden) |
| A Tag or Topic Pin | The kind and the merged-away `from_key` | A Pin removed by hand. A target delete is refused until the Pin is repointed. |
| A `topic_checks` row | The Topic id, the membership text the last run read, the time | Deleting the Topic (cascade). A run that stores nothing keeps the text of the last run that stored. |
| The `accepting` state and its counters | The row's own id | The last unit's delete of the Tag or Topic, which removes the row. A restart, a deploy or a closed tab does not break it, because the sweep continues it. |
| A `merge` or `merge-topic` Log entry | A generated id, snapshot names, no reference | Nothing |

An Item delete changes no merge Pin, merge row or merge Log entry, because none names an Item. A disagreement Pin, an `items-disagree` row and the `highlight-lost` rows of the Item's Highlights go with the Item in any state, because the quote a row showed is the owner's own text, kept nowhere else. [Data model outline](architecture/data-model-outline.md), Deleting an Item, holds the cascade.

The reason on a disagreement Pin is the agent's own sentence and cites no Item text beyond what the agent wrote. That claim is not verified (see [Open items and unverified claims](architecture/open-items-and-unverified-claims.md)). The Summaries a disagreement row showed stay in the Digests and in no row. The AI task's `inputs` keep the Item titles and Summaries of the Topics that were sent, until the owner Item or the task goes. The weekly model runs open their jobs on the same owner Item, so deleting that Item while the jobs are open loses that week's check for all of them.

## Not verified

No run has covered these cases.

- A Try again button on the old address of a merged-away Topic.
- A deployed Worker, a real Cron Trigger and the first scheduled weekly run on a live Instance.
- A Provider other than Claude Code and Grok Bot, the Worker's model path and a refusal by a vendor.
- The CPU time of a unit on a deployed D1.
- The quality and cost of the Proposals on a real library. The earlier runs used planted contradictions in libraries of 8 to 715 Items.
- A real phone.
- The stale and lost-claim orderings of a store batch in a live run. Tests run those conditions against a real database.
