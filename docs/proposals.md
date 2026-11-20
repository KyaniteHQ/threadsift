# Proposals

A Proposal is a change the agent suggests once a week, and the owner accepts or rejects it. A Proposal is one of five kinds: `tag-merge`, `topic-merge`, `highlight-lost`, `overview-gap`, and `items-disagree`. The three plain checks call no model: lost Highlights, overview gaps, and the Tag and Topic candidate pairs. The Tag, Topic, and disagreement checks run a model. A merge leaves a Pin.

`docs/architecture/jobs-leases-and-the-schedule.md` and `docs/architecture/ai-tasks-and-providers.md` (The `proposals` task) hold the run, its input, and its freshness rule. This file holds the rest.

Start from these modules:

- `src/core/wiki/proposal-kinds.ts` holds `PROPOSAL`, which says for each kind how it is accepted, when its row is listed, how the page shows it, and how its weekly check runs (`ProposalKindSpec` in `src/core/wiki/proposal-kind.ts`), and the weekly stages built from it. The compiler refuses an entry under another kind's key. The entries sit beside the code of their kind: `merge-proposal.ts`, `highlight-proposals.ts`, `overview-proposals.ts`, `disagreement-proposal.ts`. A merge kind also has a record in `MERGE` (`src/core/wiki/merge-kinds.ts`), and a model check has its AI run (`weeklyKind`).
- `src/core/wiki/proposal-lifecycle.ts` holds the moves between states and the writes of a row. The state list is `PROPOSAL_STATES` in `src/core/contract/proposal-contract.ts`.
- `src/core/wiki/proposal-decision.ts` holds Accept's dispatch and Reject.
- `src/core/wiki/weekly-check.ts` holds the two weekly checks that a declaration chooses from, `plainCheck` and `modelCheck`.
- `src/core/wiki/weekly-kind.ts` holds `weeklyKind`, the AI task kind that every weekly model check shares.

With Grok Bot as the Provider, the Tag, Topic, and disagreement runs run as bot tasks through the same `weeklyKind` (`src/core/wiki/weekly-kind.ts`). `weeklyKind` keeps each run's `current` guard, so a guard that moved fails the task as `stale` and requeues the job.

## The lifecycle

A row starts `open`, except a pair that the weekly merge run sent and the model did not return, which starts `declined` (`rowsOf` in `src/core/wiki/proposal-stored.ts`). Only a merge kind holds `accepting` or `declined`, and the database refuses them on any other kind (`proposals_state_check`). Every kind can end `rejected`.

Only `src/core/wiki/proposal-lifecycle.ts` moves a row between states or removes it. A statement that moves a row names the state it moves the row from, so it leaves a row in another state alone. A row goes one other way: the foreign-key cascade on its subject columns.

- **Reject.** A row of any kind moves from `open` to `rejected`.
- **Apply.** The claim that starts an Accept (`proposalClaimed`) moves the row from `open` to `accepting` before any unit runs. A first unit that throws hands the row back to `open` (`handedBack`). `handedBack` matches only a row with no `cursor`, `moved`, or `unit_revision`. The columns `cursor`, `moved`, `unit_revision`, and `failed_runs` mean something only while the row is `accepting`. The row leaves with the Tag or Topic it names, in the last unit's batch, by the cascade.
- **Remove.** An `open` row is deleted when Accept of an overview update or of a disagreement commits, and when a weekly stage finds that the row no longer holds. The row of a lost Highlight goes with the Highlight. `goneWithItem` deletes the rows of any state that name a deleted Item or its Highlights.
- **`declined`.** The weekly merge run inserts a row in this state for each pair the model did not return. A `declined` row never changes.
- **Merge lock.** One merge runs at a time. `anyAccepting` holds while a row of any kind is `accepting`.

The database refuses a state that a kind cannot hold. It also refuses the `accepting` columns on a row that is not `accepting` (The value guard). `test/consistency-triggers-proposals.test.ts` and `test/consistency-triggers-lifecycle.test.ts` check those constraints. The constraints and the two tests do not define which transitions are allowed.

## The value guard

`src/core/kernel/proposal-tables.ts` and `src/core/kernel/pin-tables.ts` declare the CHECK constraints for values, subject columns, and state-dependent columns. The initial migration creates the constraints with the tables. Subject columns are nullable because one table holds every kind. Each Item foreign key has an index, because without an index an Item delete scans the child table ([SQLite foreign key indexes](https://www.sqlite.org/foreignkeys.html#fk_indexes)).

- `proposals_item_pair` is a unique index on the unordered pair, the `min` and the `max` of the two Item ids. It keeps one disagreement row per pair, in any state and in either order.
- `from_digest` and `into_digest` hold the task ids of the Digests the model judged. They have no foreign key, because a refresh of an Item replaces its Digest row.

## The read

`GET /api/proposals/{id}` answers `{ state }` for one row of any state. That includes `rejected` and `declined` rows, which the list hides. It answers 404 once the row is gone. Like the list, it answers the owner's session and an agent token, because it holds only the state. The MCP endpoint gets no tool for it. The Proposals page reads it when an Accept or a Reject ends with no answer.

`GET /api/proposals?cursor=` answers the owner's session and an agent token, and the MCP endpoint gets no tool for it. It lists `open` and `accepting` rows of every kind, 50 to a page, newest first by `id`, with the Log's cursor rule. `src/core/contract/proposal-contract.ts` holds the shapes. These fields need a reason:

- The list reads a merge row's `items` counts when the call is made. A disagreement row shows the title and `summary` of the stored Digest whose task id the row holds. The page shows the text the model judged, and never a later text.
- `pageQuery` is one statement. Its `WHERE` holds the condition that makes a row listable (`listedWhile` in the declaration of the kind), and the condition applies before the page limit. A merge row is always listable. A `highlight-lost` row is listable while its Highlight is not `attached`. An `overview-gap` row is listable while `overviewGap` holds for its Topic. An `items-disagree` row is listable while `DISAGREEMENT.listed` holds. A hidden row leaves a page of up to 50 full and not short. The eligibility, the quote, the Item, and the title come from one snapshot, because the Node adapter runs each batch in its own transaction. A later read could pair a row with a subject that the row was not chosen for.
- `checkedAt` is the largest `last_run_at` of the weekly claims in `WEEKLY_TASK`. `provider` says whether a Provider is saved.

## Reject

`POST /api/proposals/{id}/reject` is owner-only (Access). It runs one `UPDATE ... WHERE state = 'open' RETURNING`. It reads the row again only when the update changed nothing. It then answers 404 for an unknown id and 409 `not-open` for a row in another state.

Reject is final. There is no undo and no flip of direction. Reject changes no Highlight and no Topic page.

A rejected merge row never reaches a later run's input, because the plain check skips every pair that has a row, in either order. The weekly overview check never inserts a row for a Topic that has one in any state. A rejected lost-Highlight row stays, so that Highlight is not proposed again. A rejected disagreement row stays, so the pair is never stored again in either order (`proposals_item_pair`), and the pair is sent to the model as decided.

An accepted disagreement row is deleted. Its Pin keeps the pair decided while both Items carry the Digests the Pin was accepted on.

## Accept

`POST /api/proposals/{id}/accept` is owner-only. An agent token gets 403 (the route is declared `access("owner")` in `src/http/proposal-routes.ts`), and the MCP endpoint has no tool for it. Accept has no confirmation and no undo. `acceptProposal` reads the row's `kind` and calls `accept` in the declaration of that kind. `readRow` answers only for a merge kind.

Every kind shares two answers:

- 404 for an unknown id. A repeated Accept after a success also answers 404 for a kind whose Accept deletes the row.
- 409 `not-open` for a row in another state.

A lost-Highlight row, a disagreement row, and an overview row also answer 409 `not-current`. A merge row never does. `not-current` means that the row's subject changed since the row was made. For a lost-Highlight row or a disagreement row it also means that a concurrent Accept removed the row between the read and the guarded batch. A concurrent Accept that finished before the read leaves no row, so the call answers 404.

A changed subject leaves its row stored but hidden. For most kinds the weekly stage deletes the row. A disagreement row whose Items sit in two Topics is kept. Each kind adds its own answers.

### Lost Highlight

`acceptLostHighlight` (`src/core/wiki/highlight-proposals.ts`) uses the same writes as Remove in the Reader (`removalWrites` in `src/core/item/highlights.ts`), including the Vault mirror queue entry. The cascade deletes the Proposal row. The guard holds only while the row is `open` and its Highlight is not `attached`. When a publication anchors the Highlight again between the read and the batch, the batch writes nothing and the call answers `not-current`. `acceptLostHighlight` ignores `merge-busy`.

Accept leaves no Pin, because a Pin keeps a regeneration from undoing a correction and nothing regenerates a Highlight.

### Disagreement

`acceptDisagreement` (`src/core/wiki/disagreement-accept.ts`) needs no Provider and never meets `merge-busy`. `not-current` has three causes (`DISAGREEMENT.accepts`):

- Either Item no longer has the Digest the pair was judged on.
- The two Items no longer sit under one Topic.
- A concurrent Accept removed the row before the guarded write.

One guarded batch inserts the Pin and deletes the row. It queues the Topic page note for the Vault mirror when the Pin changes. Its guard holds while the row is `open` and `DISAGREEMENT.accepts` holds. The Pin insert is an upsert on `(kind, from_key)` with `DO UPDATE ... WHERE NOT currentDisagreementPin`. A stale Pin of the same pair is replaced in place and keeps its id, and a current Pin stays. That `WHERE` also covers an `open` row whose pair already has a current Pin. In that case the batch deletes the row, the Pin stays, and the call answers 200. Accept changes no Item, Summary, or overview.

### Overview update

`acceptOverviewGap` (`src/core/wiki/overview-accept.ts`) answers 409 `no-provider` when no Provider is saved, and the row stays open. `not-current` also covers a Topic that has no Item with a Digest outside `built_from`, and a Topic that already has an overview run open.

Accept uses `startOverview`. `docs/wiki.md` (Topic pages, Try again) owns the guard, the owner choice, and the answers of `startOverview`. Accept adds two conditions to the guard: the row is `open` for this Topic, and the Topic still has an Item the overview was not built from. Accept also adds one statement right after the job insert, the delete of the row with `WHERE changes() > 0`. The batch inserts the job first, then deletes the row, then clears the failure marker. Neither later statement changes anything unless a job was inserted.

The guard makes the insert certain. An open job owned by the chosen owner is an open job owned by an Item of the Topic, and the guard refuses that. The open-job index suppresses nothing. The same holds for an Item that moved in with a run still open for its old Topic. Accept of an overview update has no `accepting` state and no `merge-busy`.

### Cost of an overview update

One run reads at most 40 uncovered Items (`ADDED_READ_LIMIT`). It reads fewer when the 14,000-byte cap or an unparsable stored Digest leaves some out. After a success the run starts the next run itself, until every Item is covered (`continuingOverview`). When all 40 newest are unparsable, the run reads every remaining uncovered Item and keeps the first 40 that parse (`addedFrom` in `src/core/wiki/topic-overview-input.ts`). A failed run takes the refusal path (`refused` in `src/core/wiki/topic-overview-kind.ts`) and does not continue. A Provider removed mid-chain stops the chain.

Covering N uncovered Items therefore needs at least ceil(N / 40) successful model calls. Three numbers stay apart: the calls attempted, the calls that succeeded, and whether coverage completed. The row shows N, so the owner sees the size before the press.

A Topic whose uncovered Items have only unparsable Digests is never covered. Its row, once accepted, is proposed again in a later weekly check unless the owner rejects it, and the design accepts that repeat.

### Merge

A merge adds three answers:

- 409 `merge-busy` while another row of either kind is `accepting`.
- 200 `{ state: "done" }` when the merge finished inside the request.
- 202 `{ state: "accepting" }` when units remain.

One merge runs at a time, so no two merges touch one Tag or one Topic. Overview writes use their own input revision guards.

In the rest of this section, `from` is the Tag or Topic that goes, and `into` is the one that stays. The merge runs in units (`applyUnit` in `src/core/wiki/merge-apply.ts`, called by `runUnits` in `src/core/wiki/merge-accept.ts`). Each unit is one guarded batch (`guardedResults`, `docs/architecture/database-and-search.md`). The two kinds share the guard, the state change, `moved`, the unit revision, the Pin writes, the Log entry, the closing writes, and the answers. They differ in the facts that `MERGE` in `src/core/wiki/merge-kinds.ts` holds for each kind: its table, its columns on the Proposal, how an Item links to an entry, its Log action, what a unit plans (`plan`), and how the weekly run asks about it: the instructions to the model and the names it sends with each Tag or Topic (`instructions`, `names`).

#### The Tag unit

`applyUnit` builds each Tag unit from these parts. `planTagUnit` in `src/core/wiki/tag-merge.ts` supplies the Items to move, the writes that move them and the cursor:

1. Accept starts with one statement (`proposalClaimed`) that moves the row from `open` to `accepting` when no row is `accepting`. A claim that matches nothing answers `merge-busy`, or `not-open` when the row is no longer `open`. Every unit, the first included, holds while the row is `accepting` at the unit revision the unit read. Two runners never move the same Items twice or count them twice, even after the cursor goes back to 0. Every unit also holds both Tag ids and both stored keys as it read them. A unit that loses the guard writes nothing, and the next run reads the row again.
2. The Pin insert is an upsert on `(kind, from_key)`, so every unit can carry it. The Pin commits with the first Items, so a Digest that publishes during the merge already lands on `into`. `from_key` is `catalogKey` of the name of `from`. The unit also repoints every Pin that targets `from` to `into`.
3. Each unit takes the next 100 Items that link to `from` (`REWRITE_UNIT_ITEMS`), by ascending Item id after the cursor. It rewrites the `tags` of each stored Digest: it drops repeats by key and keeps the first place. The rewrite is guarded per Digest on `digests.task_id` and on the Digest's `tags` still being the ones read. The rewrite writes `$.tags` alone with `json_set`, so it does not undo a concurrent Topic rewrite of the same Digest. The links move (`tagMoves` in `src/core/wiki/tag-rewrite.ts`) before the Digests are rewritten, because the link guard reads the Digests as they were read. An Item whose Digest changed in between keeps its link and its Digest for a later unit. A readable stored Digest never names `from` beside a link to `into`. A stored Digest that does not parse, or whose text holds a second `tags` key that SQLite and `JSON.parse` read differently, keeps its text, its link still moves, and one `merge-digest-unreadable` line names the Item id. An unparsable Digest never stops the merge, because one merge at a time blocks every other merge Accept.
4. `moved` counts the `item_tags` rows of `from` among the unit's Items whose Digest still matched the read. The count is computed before the link writes, so an Item deleted or republished in between is not counted.
5. The last part runs only when no `item_tags` row for `from` remains. It writes the `merge` Log entry, then the closing writes (`retired` in `src/core/wiki/catalog.ts`). The closing writes are one bump of `catalog_version` and the delete of the Tag `from`. The bump makes a Digest that read the old Tag list ask again. The cascade of the delete removes the row and any other Proposal that names `from`.

A Tag on 100 Items or fewer therefore merges in one batch. `moved` and the Log's count are the Items that carried `from`, including the Items that already had `into`.

#### The Topic unit

`applyUnit` builds each Topic unit from the same parts as the Tag unit. `planTopicUnit` in `src/core/wiki/topic-merge.ts` supplies what differs:

1. Its guard holds the Proposal revision, both Topic ids, and both stored keys. An overview result whose Topic or input revision changed writes nothing and requeues over fresh inputs.
2. The Pin is a `topic-merge` Pin, and the repoint covers the Topic Pins that target `from`.
3. The moves are the shared Topic rewrite (`topicMoves`, described in `docs/architecture/data-model-outline.md`, Catalog keys). A unit moves the next 500 Items under `from` (`MERGE_ITEMS`) and the next 500 Log entries that name `from`. A Topic merges in one unit only when both collections fit. The cursor stays null, because the next read takes the first Items still linked.
4. When no Item and no Log entry names `from`, the unit writes the `merge-topic` Log entry and then the closing writes. The closing writes run in this order: one attempt to open an overview run for `into` (`continuingOverview`), one bump of `catalog_version`, and the delete of `from` (`retired`). The row stays until that last statement, because the row holds the count that the Log entry reads.

#### Failed units

A first unit that throws before its batch commits hands the claim back to `open` (`recordingFailure` in `src/core/wiki/merge-failure.ts`). A request that ends after the claim and before the first unit commits leaves the row `accepting` at revision 0. The `merges` stage then runs the first unit on the next tick. The unit revision guard prevents two runners from committing the same unit.

#### The overview run after a Topic merge

The closing writes try to open one `topic_overview` job for `into` (`continuingOverview`). They insert a job only when three conditions hold: a Provider is saved, `coverageGaps` holds for `into`, and its owner Item has no open job of that kind. `coverageGaps` holds when `into` has Items its page does not cover, or removed Items that `built_from` still lists. The owner Item is the Item of `into` with the lowest id. The closing writes can insert nothing while a job for that owner Item already waits. That job then runs for `into`, because a job takes its Topic from its owner Item when the job starts.

The cost is the lower bound of Cost of an overview update. The row shows both Item counts, so the owner sees the size before pressing Accept. A survivor page that has overview text marks the moved Items "Not in overview yet". A survivor page with no overview text shows no marker, because the page flags an Item only when the overview has text.

#### Who runs the units

The accept request claims the row, then runs up to 50 units (`UNITS_PER_RUN`). The `merges` sweep stage continues every `accepting` row of either kind, with the same bound, on each tick. A unit that loses its guard counts as one of the 50, the first unit included. The stage is `continueMerges` in `src/core/wiki/merge-accept.ts`, and `src/core/compose/sweep.ts` registers it. A merge finishes by itself after a closed tab, a crash, or an ended Worker invocation.

The route and the stage call one function (`runUnits`) with the job ports (`JobPorts`). The function needs the job ports because a Topic unit that opens an overview job wakes the runner with `enqueueRows`. The next sweep finds a queued row that is not woken. A unit that throws a database error ends the call. The stage is then logged as `sweep-stage-failed`, and the next tick starts again from the stored row.

#### A unit that keeps failing

A unit that fails before its batch commits writes nothing, so the row stays `accepting`. Until a later run commits the unit, `merge-busy` refuses every other merge Accept, and Reject of the row stays refused. The first unit is the exception. Its failure hands the row back to `open`, so the failure leaves the row as it was.

No `failed` state exists. A merge that started cannot go back to `open`, because the Pin commits in the first unit, and the one-merge rule keeps two merges off one Tag or Topic. The row counts its failed runs in `failed_runs` instead.

`runUnits` runs the planning and the applying of each unit through `recordingFailure` (`src/core/wiki/merge-failure.ts`). When either throws, `recordingFailure` does four things in order. It logs `merge-unit-failed` with the Proposal id, the error class, and, for a database error, its code (`databaseCodeOf`, no SQL and no parameters). It runs `unitFailed` in a write of its own. It tries `handedBack`, which matches only a first unit. It throws the original error. A cleanup write that fails does not replace the original error. A failed `unitFailed` is logged as `merge-unit-failure-not-counted`, and a failed `handedBack` as `merge-claim-not-handed-back`.

`unitFailed` matches only a row that is still `accepting` at the unit revision the run read, so a run that lost the row to another writer counts nothing. The first unit's failure count is cleared when the row is handed back. A unit that commits clears the count (`unitAdvanced`). The read returns the count as `failedRuns`, and the page points the owner to the log line.

#### Bounds of a Tag unit

A unit runs 3 reads and 1 batch: `readRow`, the two reads of `readRewrite`, and the batch. D1 counts them as 4 queries, because a `db.batch()` counts as one query ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/), read 2026-11-12). An accept request runs at most 50 units, so about 200 queries. That fits under the 1,000 queries a Workers Paid invocation may make. The queries of the other sweep stages are not counted in the 200. The same page limits each statement to 100,000 bytes and a bound string to 2,000,000 bytes, and gives a batch call 30 seconds.

The largest bound string is the JSON of a unit's read state. For each of 100 Items it holds an id, a task id, and at most 3 Tag names of at most 240 characters (`SHORT_TEXT_MAX`). The names take at most 3 × 240 × 7 × 100 = 504,000 bytes when every character is a control character that both JSON layers escape. The worst case with 6-digit ids and task ids measured 509,401 bytes (`JSON.stringify` of 100 objects `{id, task, tags}`, 2026-11-15). The unit size of 100 and the unit bound of 50 are chosen numbers, not limits.

#### Bounds of a Topic unit

A Topic unit runs 3 reads (`readRow` and the two reads of `topicLinked`) and 1 guarded batch, so 4 queries on D1. An accept request runs at most 50 units, which is 25,000 Items at `MERGE_ITEMS` = 500. The size 500 and the bound 50 are chosen numbers. Local D1 ran a Topic of 25,101 Items as 50 units of 500 in the request and the other 101 Items in one scheduled event, without error. A deployed D1 was not run, so its CPU time per unit is not measured.

## Pins

A merge Pin records an accepted merge. It holds the merged-away name's `from_key` and `from_name`, and the target's id in `into_tag_id` or `into_topic_id`. Neither target column has a delete action, so no target can be deleted while pinned. One Pin exists for a name in each kind (a unique index on `kind` and `from_key`), so a Tag and a Topic can share a key.

`digestStored` in `src/core/digest/digest-publish.ts` reads the Pins for the Digest's Tag keys and its Topic key. It reads them for a model result, a caller-sent Digest, and `items.pending_digest` alike. A name whose key is pinned becomes the target's name before `catalogEntries` runs. The Item links to the target, the stored Digest names the target, and no `tags` or `topics` row with the pinned key is inserted. The AI task's own result keeps the names the model returned.

Publication guards its batch on the exact resolution it used (`pinnedDigest` in `src/core/wiki/pins.ts`). For each key, the resolution is the Pin it found and its target (the token `id:target`), or that no Pin existed. The Pin guard is separate from the catalog guard, because the model path drops its catalog guard after `MAX_STALE_REQUEUES` and the caller path has no catalog guard. The Pin guard inherits neither gap. `test/topic-pins-wiring.test.ts` shows publication refusing its batch when a Pin appears after the read. A publication that loses the guard is stale and requeues under the existing stale rules.

### The address of a merged-away Topic

`topicOfKey` (`src/core/wiki/topic-lookup.ts`) looks a key up in `topics` first. When no Topic has the key, `topicOfKey` looks in the `topic-merge` Pins (`survivorOf` in `src/core/wiki/pins.ts`) and answers the Pin's target. A Topic with the key always wins over a Pin. A Pin is repointed when its target is merged away, so a chain of merges resolves the first address to the last Topic.

The Topic page replaces the address with the survivor's path when `topic.key` differs from the requested key (`web/src/use-survivor-address.ts` calls the router's `replace` in `web/src/routing.ts`, which calls `history.replaceState`). A reload and the Back button land on a key that exists. The `topic=` filter of `GET /api/items` and the Index do not follow a Pin, because a filter is built from live lists and an address is stored by the owner. A Tag Pin is not read for an address.

### The Pin of a disagreement

Accept of a disagreement writes an `items-disagree` Pin. This Pin names a pair of Items and not a name. It reuses two columns that every Pin has, because the table cannot make those columns nullable without a second rebuild of `pins`:

- `from_key` holds the pair key `<lowItemId>:<highItemId>` (`pairKey`). The unique index turns the pair key into one Pin per pair.
- `from_name` holds the agent's reason as the owner accepted it.

Both Item columns are `ON DELETE cascade`, because the Pin is a statement about those two Items.

The disagreement Pin is weaker than a merge Pin, and `docs/spec.md` and the **Pin** entry of `GLOSSARY.md` say so. It binds the pair to the two Digest versions the pair was judged on:

- It survives a regenerated overview, a Topic merge (it names Items and no Topic), a refresh that leaves both Digests alone, and a restart.
- It does not survive a new Digest of either Item, even one with the same Summary text, because the version token changes.

After a new Digest it is stale. The Topic page no longer lists the entry, a later weekly check can judge the pair again once its Topic is touched, and a later Accept replaces the Pin in place.

A pair is current when `currentDisagreementPin` holds. Four readers use that one condition:

- The Topic page (`readDisagreements`).
- The `decided` list of the weekly check (`decidedPairs`). `decidedPairs` reads the rows first and then the Pins. An Accept deletes the row in the batch that writes the Pin, so that read order cannot miss both.
- The store of the weekly check. A returned pair with a current Pin inserts no row.
- The rule that keeps a row listed (`DISAGREEMENT.listed`).

## The weekly Tag and Topic checks

The `proposals` and `topic-proposals` sweep stages claim the `scheduled_runs` rows `proposals` and `topic_proposals` with `claimingWeek`. A claim succeeds when a Provider is saved, at least one Item has a Digest, and one of three things holds: the task has no row, its `last_run_at` is at least 7 days old, or its `last_run_at` is more than 7 days ahead of the clock. Each stage opens one job in its own batch, and the newest Item with a Digest owns the job. The stage opens no job when that owner Item already has an open job of that kind. The two claims are independent, so a stage or a job that fails in one check does not skip the other check. A Topic row names no Item, and a Topic with no Item is not sent.

## The weekly Highlight check

The `highlight-proposals` sweep stage claims `highlight_proposals` on the same rule and under the same conditions as the other stages: a Provider is saved and at least one Item has a Digest. The condition is shared so that the page's empty state stays true. The empty state says that the weekly check needs a Provider. The stage calls no model, makes no `ai_tasks` row, and opens no job. It is one `db.batch` of three statements:

1. The claim.
2. The insert, with `WHERE changes() > 0` after the claim. A second tick in the week inserts nothing, and a batch that fails spends no week. The insert takes the 20 newest Highlights (`LOST_HIGHLIGHTS_PER_WEEK`) whose status is not `attached` and that have no `proposals` row in any state. It inserts them in ascending id order, so the newest Highlight lists first. Each row is `open` with the fixed reason `plain-check`, because the `proposals_open_reason` check needs a reason on an open row. `ON CONFLICT DO NOTHING` keeps the unique index `proposals_highlight` from failing the batch.
3. The delete of `open` rows whose Highlight is `attached` again. It comes after the insert, so that `changes()` in the insert still reads the claim's row. It runs only when the `scheduled_runs` row holds this tick's time (`claimedAt` in `src/core/wiki/scheduled-claim.ts`), because a tick that lost the claim must delete nothing. A rejected row stays, so Reject is final for that Highlight.

Nothing in the check updates `highlights`. `src/core/item/highlight-publish.ts` stays the one writer of `status` and `start` after the insert. A Highlight whose text comes back is `attached` again with no help from a Proposal.

### Unattended path of the Highlight check

A stage that throws before its batch commits logs `sweep-stage-failed`. The next tick tries again, because the claim did not commit. A batch that commits and whose answer is lost (`docs/architecture/database-and-search.md`, Guarded batches) leaves the rows stored and the week claimed, so nothing is lost. The page shows nothing about either case. The overview check works the same way.

## The weekly overview check

The `overview-proposals` sweep stage claims `overview_proposals` on the same rule and under the same conditions. The Provider condition is real here, because Accept starts an overview run and an overview run needs a Provider. The stage calls no model, makes no `ai_tasks` row, and opens no job. It is one `db.batch` of three statements:

1. The claim.
2. The insert, with `WHERE changes() > 0` after the claim. It takes up to 20 Topics (`OVERVIEW_GAPS_PER_WEEK`) for which `overviewGap` holds and that have no `proposals` row of this kind in any state, so a Reject is final for the Topic. `overviewGap` holds on two conditions. First, the Topic has an Item with a Digest that `built_from` does not list with that Digest's task id. That is the predicate the Topic page uses. The stage does not use `coverageGaps`, because `coverageGaps` also counts removed Items. Second, no Item of the Topic owns a `topic_overview` job that is not `done`, because that run, and the runs it chains, close the gap. The stage chooses the Topics by the number of uncovered Items, most first, then by Topic id. It inserts them in the reverse order, so the Topic furthest behind lists first, with the fixed reason `plain-check`. `ON CONFLICT DO NOTHING` keeps the unique index `proposals_overview_topic` from failing the batch.
3. The delete of `open` rows whose Topic no longer has a gap. The delete runs only in the tick that won the claim, and after the insert. Between claims the page hides such a row and the row stays. A row whose Topic has a run open lists again if that run ends and leaves a gap. A Topic that falls behind again after its row was deleted is proposed again.

An overview run that failed leaves a failure marker and uncovered Items with no open job, so this stage finds that Topic. It also finds Items that arrived, or that a Topic merge moved, while no Provider was saved.

## The weekly disagreement check

The `disagreement-proposals` sweep stage claims `disagreement_proposals` on the same rule and under the same conditions. It opens one job in the same batch (`modelCheck` in `src/core/wiki/weekly-check.ts`), and the newest Item with a Digest owns the job.

The batch also holds a third statement, `staleDisagreements`, which deletes two sets of `open` rows: the rows whose Items no longer both have the Digest the row names, and the rows whose pair has a current Pin. The second set makes a duplicate that an older release stored for an accepted pair go at once. The statement runs only when the claim row holds this tick's time, so a tick that lost the claim deletes nothing. The one exception is two ticks with the same millisecond, which both delete. That is harmless, because the rows they delete are stale for both ticks. A `rejected` row is never deleted, and neither is an `open` row whose Items merely sit in two Topics.

### Which Topics are read

A Topic is touched when it has at least 2 Items with a Digest and the text of its membership differs from the text stored for it in `topic_checks`. The membership text (`membersOf`) is `itemId:digestTaskId` for each of the Topic's newest 12 Items with a Digest, joined by commas in ascending Item id. One `group_concat(... ORDER BY ...)` in SQL builds the text. That syntax needs SQLite 3.44 or later. `node:sqlite` is 3.53.3, and local D1 parsed the same text. `sqlite_version()` is not allowed on D1.

Four changes inside the newest 12 Items each make the Topic touched: a new Item, a deleted Item, an Item that moved Topic, and a refreshed Digest. A Digest replaced on an older Item does not make the Topic touched.

The read takes the touched Topics in pages of 20 (`TOPICS_PAGE`), the Topic with the newest Digest `created_at` first. The read goes on until the input has no room for another Topic or no Topic is left, so Topics that cannot fit never keep the later Topics out. A Digest with no JSON, no title, or no Summary leaves its Item out and logs `topic-digest-unreadable`. `fillDisagreementInput` adds each Topic whole, in that order, while the input stays within 14,000 UTF-8 bytes. A Topic that does not fit loses its oldest Items, down to 2. A Topic that cannot fit 2 Items is skipped and stays touched.

The model gets each Item's id, title, and Summary. It also gets a list `decided` of the Item pairs that already have a row in any state or a current Pin, lower id first. It gets no post text, comment, or author.

### The run

The result is at most 10 pairs (`DISAGREEMENTS_MAX`). Each pair is two different Items that were sent in one Topic, with a `reason` of 1 to 160 characters under `plainText`. Zero pairs is a valid result.

One guarded batch stores the result. Its guard holds while the AI task is running and the membership text of every sent Topic, computed again inside the batch, is still the text the run read. The batch does four things in order:

1. It deletes the `open` rows that no longer match the stored Digests or whose pair has a current Pin (`clearedStaleDisagreements`). A hidden row of a pair that the run judged again cannot keep the pair's slot in `proposals_item_pair`.
2. It inserts an `open` row for each pair, with `ON CONFLICT DO NOTHING` and a `NOT EXISTS` on the pair's current Pin. A row that still matches, open or rejected, is kept, and a returned pair that the owner already accepted stores no row.
3. It upserts `topic_checks` for every sent Topic, including a Topic that produced no pair.
4. It completes the AI task.

When the guard fails, the batch writes nothing, the task fails as `stale`, and the job runs again without spending an attempt. A Topic that was touched but not sent stays touched for the next week.

### What hides and deletes a row

An `open` row stays listed while three conditions hold (`DISAGREEMENT.listed`): both Items still have the Digest the row names, both Items are still in one Topic, and the pair has no current Pin. The variants of that condition differ from it in one place each:

- `accepts` leaves the Pin out, so Accept answers 200 for an open row whose pair already has a current Pin.
- `stale` leaves the Topic out, so the weekly delete keeps a row while its Items sit in two Topics.

A refreshed Summary hides a row at once. The next weekly stage, or the next store of any disagreement result, deletes the row. Two Items in different Topics hide the row too, but nothing deletes it, because a Topic merge of more than 500 Items commits in units (`MERGE_ITEMS`). A pair can sit in two Topics between two units, and the row is listed again when the merge ends. A Topic merge leaves the row alone, because the row names no Topic column.

### Cost and budget

Each attempt makes at most one model call, with SDK retries off. The week opens one job, and error retries and stale reruns add calls. A Topic is judged again only after its membership changed, so a library where no Topic's membership changed costs no call.

The output allowance is 4,096 tokens (`AI_LIST_OUTPUT_TOKENS`, chosen). It is passed to the executors that take one, and Claude Code takes none. A valid answer of 10 pairs with 6-digit ids and 160-character ASCII reasons is 1,979 bytes of JSON, which is under the allowance at one token per byte. With 160 CJK characters in each reason the answer is 5,179 bytes, which would exceed the allowance at one token per byte. A cut-off answer is a refusal that is not retried. The token count of CJK text was not measured.

The static bound counts one token per byte against the 24,000-token context of the model of Measured Digest input budget (`docs/architecture/ai-tasks-and-providers.md`). The measurement filled five inputs to within 14,000 bytes: plain English, escape-heavy, CJK, emoji, and Turkish. The input was 12,806 to 13,838 bytes, the instructions 1,098 bytes, and the schema 559 bytes. Input, instructions, schema, and allowance therefore came to at most 19,591, which is at least 4,409 under the context. It built each input with `fillDisagreementInput` and `disagreementTask` and counted bytes. The script is not kept.

A run on 2026-11-12 sent the same five inputs with `claude -p --output-format json --json-schema` and the executor's other flags (Claude Code, `claude-sonnet-5-5`, `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`). The input-side usage was:

| Input | Tokens |
|---|---|
| plain | 6,490 |
| escape | 9,975 |
| CJK | 6,830 |
| emoji | 12,121 |
| Turkish | 8,649 |

`output_tokens` was 55 for each input, because the inputs repeat one text and the model found no pair. Those numbers hold for Claude Code only and include its own system prompt. The output side of a full answer of 10 pairs is not measured.

### Unattended path of the disagreement check

A stage that throws before its batch commits logs `sweep-stage-failed` and tries again on the next tick. A refusal that can be retried (`retriesAi`) retries after 30 seconds and after 2 minutes while the inputs remain current. When the job finds stale inputs, it requeues without spending an attempt. On the last attempt with current inputs, a refusal closes the job with nothing stored and every `topic_checks` row unchanged, so the Topics that changed are read again the next week. The handler has no `blockedBy`, because it writes only `proposals` and `topic_checks` rows. When the job fails before a task row exists, one `disagreement-proposals-run-failed` line names the refusal.

## The Log entry

A `merge` entry (`loggedMerge` in `src/core/kernel/log-writes.ts`) holds the two Tag names as written when the merge finishes and the Items that carried the Tag. It names no Tag and no Item, so it blocks no delete and survives an Item delete. A failed merge unit adds no Log entry. A `merge-topic` entry is the same row for a Topic merge. Its `moved` is the number of Items that the units of this Accept moved.

## The page

`/proposals` is the `proposals` screen (`web/src/screens.ts`). `ProposalsPage` draws it through `ListPage`. An exhaustive `switch` on `kind` chooses the body for each kind (`ProposalBody` in `web/src/ProposalRow.tsx`). The words of each kind come from one table (`WORDS` in `web/src/proposals-text.ts`), and the texts came from `tools/copy/write-copy.sh`. The code does not state these decisions:

- **No confirmation.** The row's sentence states the effect before the press. The head text covers every kind: an Accept of a merge cannot be undone, an Accept of a lost-Highlight row removes the Highlight for good, an Accept of an overview row starts a model run, an Accept of a disagreement row keeps the pair on the Topic page, and a Reject is final.
- **Accessible names.** Each name begins with the visible label and names the subject. The names of a disagreement row also carry the first 40 characters of each Summary (`textCut`), because Items often share a title and two rows would otherwise read the same.
- **The failed-merge note.** The note ("Applying this merge failed once…", `applyFailedNote`) has no live role, because the count rises about once a minute and each rise would be announced again. Polling updates the count silently.
- **Empty state.** The date is the most recent claim time of the weekly runs. A claim time does not say that a check finished, so the last line says no more than the page knows. The list is empty because the check found nothing, is still running, or failed, or because the owner rejected every row. The page shows no failure of the weekly run.
- **No "applying" state for a disagreement or overview row.** Accept answers 200 for these rows, and the overview run belongs to the Topic page. A 409 `no-provider` or `merge-busy` shows a note beside the buttons and keeps the row with its buttons on (`BUSY_NOTES` in `web/src/ProposalActions.tsx`). A 409 `not-current` reads the list again, where the row is gone, and shows the existing notice that the Proposal was already decided or is no longer in the list.
- **Reload after a press.** `useProposalsPage` (`web/src/use-proposals-page.ts`) reloads the first page once after an Accept or a Reject that changes the list, and announces one result. It keeps one busy id. While a Proposal is being applied, `usePolling` reads the first page again every few seconds and folds back any later pages that were loaded. A refused or failed press keeps the loaded list, its row note, and focus. The page does not announce changes made elsewhere. A reload returns to the first page, because keeping later pages adds machinery for a single owner before the first release.

## The reads of the run

`usedSubjects` reads the Tags, or the Topics, that have an Item. It reads them in pages of 1,000 by id, as a recursion that asks for the page after the last id, because D1 caps one result at 50 MB. `knownPairs` reads every `proposals` row of the run's kind in one query. A row is under 100 bytes and at most 20 rows are added a week, so 50 MB takes about 480 years of weeks (guess).

## Identity

Every `proposals` and `pins` row has a generated id that is never reused (`AUTOINCREMENT`). A `topic_checks` row is keyed by its Topic id. The weekly claims in `scheduled_runs` are keyed by the task name. They survive a restart and a deploy, and they stay out of the export as working tables. The rows below break only where the table says.

| Record | Identity | Breaks |
|---|---|---|
| A merge row | a generated id, and the unordered pair of two generated Tag or Topic ids, one row in any state | deleting either Tag or Topic. The cascade removes every merge row that names it, and an accepted merge's last unit deletes the merged-away side, so it also removes the other rows that name that side. No row is ever repointed to another pair. |
| A `highlight-lost` row | a generated id, and `highlight_id` | removing the Highlight, deleting its Item, a Highlight that becomes `attached` (the weekly stage deletes the open row) |
| An `overview-gap` row | a generated id, and `topic_id` | deleting the Topic (a Topic merge, by cascade), Accept (the row is deleted with the run it starts), a gap that closes (the weekly stage deletes the open row) |
| An `items-disagree` row | a generated id, and the unordered pair of two Item ids (`proposals_item_pair`), with the two Digest task ids as version tokens | deleting either Item (cascade), a refreshed Digest of either Item (the row is hidden at once and the weekly stage deletes it while it is `open`, and a `rejected` row stays), and a row whose Items sit in two Topics is kept and listed again when they sit in one |
| A disagreement Pin | the kind and the pair key `<low>:<high>`, with the two Digest task ids | deleting either Item (cascade), a new Digest of either Item (hidden, and a later Accept replaces the Pin), and the Items leaving one Topic (hidden) |
| A Tag or Topic Pin | the kind and the merged-away `from_key` | a Pin removed by hand. A target delete is refused until the Pin is repointed. |
| `topic_checks` row | the Topic id, the membership text the last run read, the time | deleting the Topic (cascade). A run that stores nothing keeps the text of the last run that stored. |
| The `accepting` state and its counters | the row's own id | the last unit's delete of the Tag or Topic, which removes the row. A restart, a deploy, a closed tab (the sweep continues it) do not break it. |
| A `merge` or `merge-topic` Log entry | a generated id, snapshot names, no reference | nothing |

An Item delete changes no merge Pin and no merge row, because a Pin of a merge, a `merge` or `merge-topic` entry, and a merge Proposal name no Item.

A disagreement Pin and an `items-disagree` row name two Items and go with either of them. The cascade on both Pin columns deletes the Pin. `deleteItem` deletes the row before the Item (`goneWithItem`), and the cascade on both columns would delete it too. The `highlight-lost` rows that name a Highlight of the Item go in any state in the same way, because the quote the row showed is the owner's own text, kept nowhere else.

The reason on a disagreement Pin is the agent's own sentence and cites no Item text beyond what the agent wrote. That claim is not verified (`docs/architecture/open-items-and-unverified-claims.md`). The Summaries a disagreement row showed stay in the Digests and in no row. The AI task's `inputs` keep the Item titles and Summaries of the Topics that were sent, until the owner Item or the task goes.

The weekly model runs open their jobs on the same owner Item. Deleting that Item while the jobs are open loses that week's check for all of them.

## Probes

Each probe ran on `node:sqlite` (Node 26.12.1, SQLite 3.53.3) and on local D1 (`wrangler d1 execute --local`, wrangler 4.158.0) with the schema applied. The output was identical unless a line says otherwise. The scripts are not in the repository, so the probes cannot be repeated from it. Each probe shows something the migration files and tests do not.

- **Unordered pair index and claim.** A row for the pair `(2, 1)` after `(1, 2)` was ignored by `INSERT OR IGNORE` and by `ON CONFLICT DO NOTHING`. A pair of one Tag with itself failed `proposals_distinct`. A claim followed by `INSERT ... SELECT ... WHERE changes() > 0` opened one job, a second claim in the same week opened none, and a claim of a row 7 days old opened one. That is why the claim must be the statement right before the insert that reads `changes()`.
- **Accept of a Tag merge.** The seed held thousands of Items with stored Digests, 30 of them naming `ml`, and two `open` Proposals, one of them `ml` into `machine learning`. The Tags, links, stored Digest names, Pin, `merge` Log entry, remaining Proposal row, `catalog_version`, and `tags` search part came out equal on `node:sqlite` and on local D1 in every dumped table. Local D1 ran each unit's batch without error.
- **Lease guard, `merge-topic` triggers and address lookup.** A batch that starts with the two-lease guard released both leases when the guard held. The batch was refused with `CHECK constraint failed` when a lease generation had moved. A release placed before a failing guard rolled back with the batch, so both leases kept their expiry. A Topic with the key was found before a `topic-merge` Pin, and a Tag Pin of the same key was not read.
- **Lost-Highlight claim.** `foreign_key_list` named `highlights` with `ON DELETE CASCADE` for `highlight_id`. Deleting a Highlight deleted its row, and the next insert took an id above the old high-water mark. A claim inserted one row for each of three `gone` or `ambiguous` Highlights and none for an `attached` one. A claim 8 days later inserted for a Highlight lost since. An `open` row whose Highlight was `attached` again went with the next claim, and a rejected row was never inserted again.
- **Overview-gap stage.** The stage's three statements, run in order on a seed of 5 Topics, stored rows for the Topics with uncovered Items and none for a Topic whose open `topic_overview` job closes its gap. A second run in the same week stored nothing, because the claim's `changes()` was 0. After the claim moved back 7 days, the run deleted the row of a Topic that was covered and stored the row of the Topic whose job was gone. A second row for one Topic failed `UNIQUE constraint failed: proposals.topic_id` with the same text on both. D1 also printed the claim's `RETURNING` row, which the `node:sqlite` runner did not read, and that is the only difference.

The Proposal state constraints are covered by `test/consistency-triggers-lifecycle.test.ts`.

## Runs

The Proposal kinds and Pins were run on 2026-11-11 to 2026-11-13 on both targets. The container ran Claude Code 2.1.319 with `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`. The Worker ran as `wrangler dev --local --test-scheduled` (wrangler 4.158.0) with no model. The storage statements ran on `node:sqlite` (Node 26.12.1) and on local D1, with identical output once the suffix D1 adds to an error message is removed (Probes). The runs covered the weekly claim, and Reject and Accept in the browser. The runs are scratch runs that are not in the repository, so they cannot be rerun from it.

These findings shaped the code:

- No model run returned a pair with a current Pin in three weekly runs, so the store clause that ignores such a pair has no real-model run. `test/disagreement-pin-store.test.ts` covers the clause and fails when the clause is removed.
- On the container on 2026-11-11, a Tag with 5,100 Items showed "Applying…" after the press. With the tab closed, the sweep finished the merge 35 seconds after the press (the request had moved 5,000 Items).
- On the container on 2026-11-12, a Topic of 25,001 Items answered 202 after 2,671 ms with 25,000 Items moved. With the tab closed, the sweep finished the merge 30.4 s after the request.
- On the Worker (`wrangler dev --local --test-scheduled`, 2026-11-11), a Tag with 5,100 Items answered 202 in 646 ms. The merge finished at the last of 6 scheduled events sent 2 seconds apart. The sweep runs at most once every 30 seconds (`TICK_SPACING_MS` in `src/core/compose/tick.ts`).
- Accept of an overview update on a Topic of 45 Items ran 2 `topic_overview` tasks (executor `cli`, Claude Code 2.1.319), which equals ceil(45 / 40), and left 0 Items out of the overview (2026-11-12).
- With `fillDisagreementInput` and every pair of every Topic decided (60 Topics of 12 Items), the input stayed within the 14,000-byte bound. Short Items gave 47 Items of 4 Topics and 253 pairs in 13,743 bytes. Long Items gave 10 Items of 1 Topic and 45 pairs in 13,860 bytes.

These were not run:

- A Try again button on the old address of a merged-away Topic (the survivor's page had an overview).
- A deployed Worker.
- A real Cron Trigger.
- A Provider other than Claude Code.
- The first scheduled weekly run on a live Instance.
- A real phone.
- The Worker's model path.
- The CPU time of a unit on a deployed D1.
- The quality and cost of the Proposals on a real library. The real runs used planted contradictions in libraries of 8 to 715 Items.
- Grok Bot.
- A refusal by the vendor.
- The stale and lost-claim orderings of a store batch in a live run. `test/disagreement-store.test.ts` and `test/topic-pins-guard.test.ts` run those conditions against a real database.
