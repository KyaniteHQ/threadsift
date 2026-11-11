# Proposals

The agent's weekly suggestions to merge two Tags, the page that lists them and Reject. Accept, Pins and the other Proposal kinds are not built. `docs/architecture.md` holds the run, its input and its freshness rule under Jobs, leases and the schedule and AI tasks and Providers; this file holds the rest.

## Code map

- `src/core/proposal-week.ts`: the weekly claim and the job it opens.
- `src/core/proposal-candidates.ts`: the plain check.
- `src/core/proposal-input.ts`: the reads and the prompt.
- `src/core/proposal-task.ts`: instructions, result schema and budgets.
- `src/core/proposal-job.ts`: the run and its guarded batches.
- `src/core/proposal-tables.ts`: the table, re-exported by `schema.ts`.
- `src/core/proposal-relink.ts`: what a Tag key merge does to the rows.
- `src/core/proposal-page.ts`: the read and Reject for `src/http/proposal-routes.ts`.
- `src/core/proposal-contract.ts`: the schemas the core, the routes and the page share.

## The value guard

`proposals.kind` and `proposals.state` have no `CHECK`. `proposals_values_insert` and `proposals_values_update` refuse a kind or state outside `PROPOSAL_KINDS` and `PROPOSAL_STATES`, as `jobs_values` does (`docs/architecture.md`, Database and search, Consistency triggers), so a later kind is a replaced trigger pair and no table rebuild. `test/consistency-triggers.test.ts` stores and updates each listed value and refuses an unlisted one.

## The read

`GET /api/proposals?cursor=` answers `{ proposals, checkedAt, provider, next }` to the owner's session and to an agent token, and the MCP endpoint gets no tool. It lists `open` rows, 50 to a page, newest first by `id`, with the Log's cursor rule (the last `id`, a decimal integer of 1 to 16 digits, 400 otherwise). Each row holds `id`, `kind`, `state`, `reason` and `from` and `into`, each `{ id, name, items }` with `items` counted when the call is made. `checkedAt` is the claim time in milliseconds or null, and `provider` is whether a Provider is saved. A later slice widens the list to `accepting` rows.

## Reject

`POST /api/proposals/{id}/reject` is owner-only (Access). It runs one `UPDATE ... WHERE state = 'open' RETURNING` that moves the row to `rejected`, answers 200 `{ state: "rejected" }`, and reads the row again only when nothing changed: 404 for an unknown id and 409 `not-open` for a row in another state. A rejected row never reaches a later run's input, because the plain check skips every pair that has a row, in either order. There is no undo and no flip of direction.

## The page

`/proposals` is the `proposals` screen (`web/src/screens.ts`), reached from a link in the settings panel beside the Log (`PageLinks`), drawn by `ProposalsPage` through `ListPage` with `ProposalRow` for a row and `proposals-page.css` for the row's own styles (the list, rows, head and states are the Index's `rl-` classes).

- **Row.** A row says the effect in one sentence, shows each Tag's live Item count and the agent's reason, and has Reject. It has no Accept control and no hint of one, and the head text says a Reject is final for that pair. The button's accessible name is "Reject merging X into Y", and "Try again to reject merging X into Y" after a failed Reject, so it begins with the visible label.
- **States.** Loading, failed with Try again, Load more, and an empty state with three lines read from `provider` and `checkedAt`: no Provider saved, not checked yet, and "The last check started on {date}. No proposals are open now." The date is the claim time, which does not say that a check finished, so the last line says no more than the page knows: the list is empty because the check found nothing, is still running or failed, or because the owner rejected every row. The page shows no failure of the weekly run.
- **Shared hook.** `usePagedRead` (`web/src/use-paged-read.ts`) offers `edit` (replace the loaded page, which also drops any read in flight, so a late answer cannot bring a rejected row back) and `reread(through)` (read from the first page until `through` is true for a page, so a row that moved to a later page when newer rows arrived is still read). A reread that a newer edit or read overtakes starts again, at most 3 times, and a reread that fails ends a stuck Load more with its failed state.
- **Reject flow.** Each row has its own pending state, so a press on one row does not enable another row's button. A rejected row leaves the list; focus moves to the next row's Reject button, else to the previous row's, else to the heading, and a live region says what happened. When the rejected row was the only one loaded and more pages exist, the page reads again from the first page instead of showing the empty state. When the outcome is unknown (a network failure, or a 404 or 409, which a Reject whose answer was lost also gets when it is sent again), the page reads again through the last loaded row and shows the row as the server has it: a row that is gone leaves with a note, and a row that is still open stays with an error and Try again.
- **Routing.** The path has no `.`, so neither target needs a document-routing change. A pull request preview has no Provider, no Cron Trigger and no Proposal (`docs/pr-previews.md`).

## The reads of the run

`usedTags` reads the Tags that have an Item in pages of 1,000 by id, as a recursion that asks for the page after the last id, because D1 caps one result at 50 MB. `knownPairs` reads every `proposals` row in one query: a row is under 100 bytes and at most 20 rows are added a week, so 50 MB takes about 480 years of weeks (guess).

## Identity

| Record or reference | Identity | Survives | Breaks |
|---|---|---|---|
| A `proposals` row | a generated id, never reused | a refresh, a re-Paste or a re-import of any Item, a new Digest, a restart, a deploy, an Item delete (no Item reference, counts read live), a `tag-keys` merge (repointed), an export and restore that keeps the ids and the Tags they name (not built) | deleting either Tag outside a key merge (an accepted merge, a later slice), which removes it by cascade; a key merge that makes its two Tags one, or brings it onto a pair that already has a row it loses to |
| The pair of a row | the unordered pair of two generated Tag ids, one row in any state | the same | the same |
| The weekly claim, `scheduled_runs` row `proposals` | the task name | a restart, a deploy | nothing; the export leaves it out as a working table |
| The `proposals` job and its AI task | the job's generated id and the task's, both owned by one Item | a restart, a lost queue message, a stale requeue | deleting the owner Item |
| The names on the page | read live from the Tags, which never change their first spelling | a refresh | a merge (a later slice) |

## Probes

The unordered-pair index and the claim's `changes()` placement were run on `node:sqlite` (Node 26.12.1) and on local D1 (`wrangler d1 execute --local`, wrangler 4.158.0) on 2026-11-11, with the migration applied: a row for the pair `(2, 1)` after `(1, 2)` was ignored by `INSERT OR IGNORE` and by `ON CONFLICT DO NOTHING` on both, a pair of one Tag with itself failed `proposals_distinct`, and a claim followed by `INSERT ... SELECT ... WHERE changes() > 0` opened one job, a second claim in the same week opened none, and a claim of a row 7 days old opened one, with identical rows on both.

## Runs

On 2026-11-11 the branch ran on both targets. On the container, with Claude Code 2.1.319 and `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, a fresh volume held 69 Items and 206 Tag links made by caller-sent Digests with no Provider saved. After the Provider was saved, the next minute's tick claimed the week and opened the job, and one `proposals` task (executor `cli`, provider `claude-code`, 850 input bytes, 7 disjoint pairs) stored 6 `open` rows and 1 `declined` row (`c` and `c++`, no reason). The page showed the 6 rows and a Reject in the browser moved a row to `rejected`. After the claim was moved back 8 days, the second run sent 3 pairs, none of the 7 already decided, and stored 1 `open` and 2 `declined` rows. On the Worker, with an OpenAI-compatible Provider whose address refuses, the scheduled event claimed the week and opened the job, and the task ended `failed` with `unreachable`. The container then ran this branch on a volume made by c6875ce, with a running job whose claim had expired, a queued job and a job waiting on a busy Topic: every job finished, a caller-sent Digest published, the trigger took a `proposals` job and the Item, Tag and Digest counts did not change. Rolled back to c6875ce on that volume, it served the Items, left the queued `proposals` job unclaimed, published a Digest and deleted the Item that the job names with no error. The same upgrade, with the final migration and its value triggers, ran on the container, and on a local D1 holding migrations 0000 to 0038 in an independent run; both triggers fired there. The scheduled event ran again on the Worker after the last change to the claim. Not run: the Worker's rollback, any other Provider, the stale and lost-claim outcomes of the run, and the first scheduled run on a live Instance.
