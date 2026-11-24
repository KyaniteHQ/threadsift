# Jobs, leases and the schedule

This page describes how work that waits on the network runs: the `jobs` table, the claim on a row, deadlines and retries, the schedule that wakes the work, and the rules for Digests, Topics and the weekly checks.

## Contents

- [Jobs](#jobs)
- [One run per job](#one-run-per-job)
- [Deadlines, attempts and retries](#deadlines-attempts-and-retries)
- [Waiting for a vendor](#waiting-for-a-vendor)
- [One Item status rule](#one-item-status-rule)
- [One job close](#one-job-close)
- [The export and restore jobs](#the-export-and-restore-jobs)
- [Fetched Items and Digests](#fetched-items-and-digests)
- [Digest failures and retries](#digest-failures-and-retries)
- [Owed Digests](#owed-digests)
- [Caller-sent Digests](#caller-sent-digests)
- [New Topics and Tags](#new-topics-and-tags)
- [Topic overview writes](#topic-overview-writes)
- [The Reddit turn](#the-reddit-turn)
- [The weekly claims](#the-weekly-claims)
- [Schedule](#schedule)
- [Container restart](#container-restart)

## Jobs

Each step that waits on the network is a row in `jobs` with its state, attempts and next attempt time. The steps are a fetch, an AI task, a wiki step, a slice of an Export and a slice of a Restore. A Grok Bot send and wait is a step inside a fetch or AI-task job, not a job of its own.

Both targets run a claimed row through `executeClaimed`:

```text
Cloudflare   Queues message (job id, max_batch_size 1)  -> one invocation runs one job
container    in-process loop: wakes on enqueue and Provider save, checks for due rows every 5 s, runs 4 jobs at once, calls the tick every 60 s
both         the sweep re-queues due rows, so a lost message, a discarded retry or a restart loses no work
```

The row, not the message, is the source of truth. The Vault writer is not a job. The tick drains `mirror_notes` through the singleton lease in `vault_settings` after the sweep ([Vault mirror](vault-mirror.md)), because it is Instance-wide work and no Item owns it.

## One run per job

A runner starts a job only by claiming its row. `claim` is one `UPDATE ... RETURNING` that matches only a due row (`isDue`): a `queued` row whose next attempt time has come, or a `running` row whose claim expired. A second message for a finished job, or a sweep that finds it, claims nothing.

An attempt whose runner died counts when the next runner takes over its expired claim, so a job that always kills its runner still reaches `gave-up`.

A runner writes its result in one guarded batch ([Database and search](database-and-search.md), Guarded batches). The batch checks that the row is still `running` at the attempt count and the `attempt_generation` it claimed (`holding`). A runner whose claim was taken over writes nothing, even when the takeover restarted the count at 0 because the Item's content moved. The fetch result, the Item's status and the job's `done` state commit in that one batch, so a crash never leaves a `done` job with a `processing` Item.

The batches that publish a Digest, create a Topic, store an overview, store picks and finish a Tag or Topic merge also append their Log entry ([The library wiki](../wiki.md), The Log). An entry is therefore as atomic as the change. A stale publication, a lost claim or a duplicate delivery of a job that already committed appends nothing, and each run keeps its at-most-one-model-call rule.

## Deadlines, attempts and retries

Each job runs under a deadline below the 15 minutes of wall time a Queues consumer gets ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)).

| Job | Deadline | Constant |
|---|---|---|
| AI call | 10 minutes | `AI_DEADLINE_MS` |
| Fetch | 2 minutes | `FETCH_DEADLINE_MS` |
| Fetch of an X link through the grok CLI | up to 3 minutes for a CLI slot, then up to 3 minutes of run | `X_SLOT_WAIT_MS`, `X_RUN_DEADLINE_MS` |
| Digest job | 12 minutes (the AI call plus the fetch hop, each under its own signal) | `DIGEST_DEADLINE_MS` |
| Export slice, Restore unit | 10 minutes | `EXPORT_SLICE_DEADLINE_MS`, `RESTORE_UNIT_DEADLINE_MS` |

- Claim length. A claim lasts the deadline of the claimed kind plus 2 minutes (`CLAIM_MARGIN_MS`), so a Digest claim lasts 14 minutes, under the 15 minutes a Queues consumer gets. The fetch kind's claim covers the grok CLI route as well.
- Digest deadline. The 12 minutes are the sum of the two network and model phases, and one model call for each run keeps the job below the Queues limit.
- A fetch past its deadline is not retried. The fetch's signal aborts, and the guard turns an aborted signal into the `timeout` result. An Item with no title yet ends `failed` with `timeout`. An Item that already has a title is not marked failed. It keeps the fetch result `timeout`, and its status follows its other open jobs (`settle`).
- Every other job kind fails its attempt at the deadline and its row retries it, except `export` and `x_verify`. An export slice has no abort signal, so its deadline only sets the length of its claim. An `x_verify` attempt has no signal of its own either: its oEmbed slice and its settling step each get a 90 s signal, and the claim, the deadline plus `CLAIM_MARGIN_MS`, covers both ([Fetchers](fetchers.md)).
- CPU. The Worker sets `limits.cpu_ms` to 300,000, the Workers Paid maximum, because a Queues consumer gets 30 seconds of CPU by default ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)).
- Attempts. A job gets 3 attempts (`MAX_ATTEMPTS`). A failed attempt retries after 30 seconds, and a second one after 2 minutes (`RETRY_DELAYS_MS`). After the third, the Item is `failed` with `gave-up`. On Cloudflare the retry is a Queues message with `delaySeconds`.
- Declarations. A job kind is one `defineJob` or `defineUnownedJob` declaration listed in `HANDLERS`, so a new kind adds a declaration and one entry and no branch.
- Loop slots. A run that outlives its claim keeps its loop slot until its handler ends. An Export or Restore unit takes no abort signal and runs to completion.

## Waiting for a vendor

A handler that must wait returns a deferred outcome (`DeferredOutcome`): an absolute earliest time, a wait reason (`WAIT_REASONS`) and whether the attempt counts. It never throws for a vendor's delay and never sleeps.

- `queueLater` sets the job `queued` with `next_attempt_at` at that time and stores `jobs.wait_reason`, in the guarded batch that checks the claim. The due time and the Item-facing reason therefore commit together or not at all.
- A deferred outcome can also carry `writes`, extra statements that commit in the same guarded batch.
- The queue message is only a wake-up. `claim` takes a queued row only when `next_attempt_at <= now`, so an early or duplicate delivery claims nothing, and a restart keeps the stored time.
- `waitingFor` is the one definition of a waiting job (`queued` with a wait reason). The Item's wait view, the Reddit turn queue and the switch away from the Grok Bot Provider build on it, and `wokenJobs` makes the matching jobs due.
- The Worker clamps the message delay to 86,400 seconds, the Queues maximum ([JavaScript APIs](https://developers.cloudflare.com/queues/configuration/javascript-apis/): "Must be an integer between 0 and 86400"). The sweep delivers a row that is due later than that.
- A job that waits for the Grok Bot's answer defers the same way, with the reason `grok-bot`, until the task's deadline. The result route makes it due at once when the answer arrives ([AI tasks and Providers](ai-tasks-and-providers.md), Grok Bot). The fetch job of an X link is such a job, and a full in-flight cap defers it 60 seconds with the same reason.

## One Item status rule

An Item stores only whether it failed. `items.reason` is null or one of the failure reasons, and a non-null reason is the failure marker (`IS_FAILED`, `NOT_FAILED`). No column holds `processing` or `ready`. `STATUS_VIEW_COLUMNS` derives the status a reader sees in the query:

- `failed` with its reason, when the reason is set.
- `processing`, while a fetch, Digest or X check job is open.
- `ready`, when none is.

A job that opens or closes writes nothing to the Item. Only `fetch`, `digest` and `x_verify` jobs (`ITEM_JOB_KINDS`) count. A `topic_overview`, `related_pick` or weekly job leaves the status of the Item it hangs on alone.

## One job close

One module owns every write that closes a job row. `closeJob` closes the claimed job and its given-up AI tasks in one batch, and `finish` and `exhaust` call it.

- The `closing` of the Digest declaration (`owedDigest`) follows it in that batch. It opens the Digest that a pending caller-sent Digest still owes, when that Digest differs from the one the job claimed.
- `closeRunJobs` closes the open jobs of one Export or Restore by address.
- A save that supplies content closes the Item's open `fetch` and `x_verify` jobs and deletes its `x_verifications` row through `closeItemJobs`. It takes no `holding` guard, so a running fetch loses its claim and writes nothing.
- Give-up and exhaustion use the same path, so the paste card's Added state and the New marker wait until both jobs end.
- A Digest failure never discards fetched content or an earlier Digest.

## The export and restore jobs

The kinds `export` and `restore` are the only two with no Item. `item_id` is null, `address` is `exports/<id>` or `restores/<id>`, and `claimedRow` refuses such a row that has an Item.

- A slice. Each run does one slice and returns one checkpoint. A Restore slice is one unit of its `check`, `tables`, `files`, `search`, `highlights`, `finish` or `undoing` phase. The runner commits the checkpoint in a guarded batch together with the job's close and the next job of that kind.
- The guard. The batch holds only while this run still holds the claim and the Export or Restore is still `running` at the part, phase and cursor the slice read (`stillAt`). A cancelled Export, a runner that lost its claim and a repeated slice therefore write nothing. An Export slice that loses also deletes the objects it wrote. Their names carry the claim's attempt number, so they are never a committed slice's objects.
- Retries. A slice gets the 3 attempts every job gets, and the third failure ends the run `failed` with `gave-up`. A refusal in the Restore `check` phase is not retried: the unit ends the Restore `failed` with the refusal code and supersedes the parts in the same guarded batch.
- Restart. On the container, a start puts a running `restore` job back to queued. On the Worker, the sweep takes over an expired claim.
- Cleanup. The sweep stage `exports` (`cleanExports`) removes the objects of a `removing` Export, of a `failed` Export 12 minutes after its last update and of a `ready` Export 24 hours after it finished, at most 5 in a sweep. It then deletes every object of an `expired` Export, because a run that a pause held past its claim can write objects after the removal ([Export, backup and restore](export-backup-and-restore.md)).

## Fetched Items and Digests

`publishFetched`, which `settledFetch` calls, increments the content generation in the same guarded batch whenever a successful fetch replaces the content. The new text may be none (a repository without a README, an Article that ends without text, a Link-only result). A Digest that started on the old text then fails its generation check and does not publish over cleared text.

- A Paste alone leaves the generation alone. A supplied Reddit thread increments it in its own batch, even when it carries no post text.
- The same batch drops a pending caller-sent Digest when the Item has no post text and no eligible comment to publish over (`digestAfterFetch`, the one place both the fetch job and a supplied thread go through).
- `digestAfterFetch` then opens a Digest only when SQL finds a Digest source (`hasDigestSource`) and saved settings or a pending caller-sent Digest exist. It marks a kept Digest "not updated" when no Digest job opens (`keptNotUpdated`). Link-only Items open no Digest.
- `providerSet` is true when a `settings` row exists or Grok Bot is chosen as the Provider, so a Grok Bot Instance with no `settings` row opens its Digests like any other.
- With a saved key that no longer opens, the fetch still opens a Digest job, which gives up as `secret-missing` before any Provider call.
- A Digest job that finds no usable input left (no text, or a linked page that gave no text) marks the Item failed when a Provider is saved, so it shows Try again. Otherwise it marks it as not updated (`unusableInput`).
- The Digest's publishing guard checks the generation again. A moved generation discards the result, fails that AI task as `stale` and requeues the job under its held claim at the same attempt count, with the stale-input backoff below.

## Digest failures and retries

`retriesAi` decides which refusals retry, from the refusal reason and the HTTP status:

| Outcome | Reasons |
|---|---|
| Retries after 30 seconds and 2 minutes | `unreachable`, `timeout`, `provider-busy`, and `no-json` after a 2xx answer or no answer (a schema failure) |
| Gives up at once | `wrong-key`, `model-not-found`, `invalid-effort`, `declined`, `cut-off`, `refused`, `provider-unavailable`, `key-needed`, `not-configured`, `secret-missing`, and `no-json` after a non-2xx answer (HTTP 400 and 422 map to it) |

Each failed call ends its own AI task, and only the batch that stores a Digest marks its task `done`. The stored Provider and model come from that call's result, so a settings change during a call cannot change its provenance.

The scheduled sweep closes running AI tasks as `failed/timeout` through `expireAiTasks`. It closes a task after its deadline only when no job owns it and no answer has reached it, and it closes any other task 24 hours after its deadline (`mayExpire`). This covers calls abandoned by a crash or takeover.

### Stale input

Every ending that stores the failure marker from an attempt's own read of the Item writes it under the same generation and pending-value guard as a publication. The endings are a refusal, an input over the cap, an unreadable file and an empty input. When the Item's content or caller-sent Digest changed while the attempt ran, the guard fails and the job requeues without storing the marker. The next attempt reads the new input.

### Attempts belong to a generation

Every claim of a Digest job stores the Item's generation in `jobs.attempt_generation`. A claim that finds a different stored generation starts the count at 0, so content that moved since the last attempt gets its own 3 attempts. Content moves after a refresh, a supplied thread or a crashed claim. A job that runs out of attempts closes through `exhaust`, whose batch commits only while the Item still has that generation (the Digest declaration's `input`). When the Item moved in between, the job goes back to `queued` with its attempts, and the next claim starts the count again. The failure marker is never written for content that had no attempt.

### A caller-sent Digest that arrives mid-attempt

Every claim of a Digest job also stores the Item's caller-sent Digest in `jobs.attempt_pending`. The closing batch opens a new Digest job while the Item holds a caller-sent Digest that differs from `attempt_pending`. A Paste can send a Digest after the attempt read the Item without changing the generation, and only a Paste can send it again. The new job takes the caller path (`attemptCaller`). It calls no Provider and publishes the Digest that the Paste's schema already accepted.

The exhaust batch stores the marker exactly when the closing batch opens no Digest job for a held Digest (`markAttemptsSpent`). That happens when the Item:

- holds no caller-sent Digest,
- holds one that the job claimed (the job failed 3 times on it, so a repeat would fail the same way), or
- has no Digest source left, which the Item's pending Digest takes away from a Reddit link post whose only source is its linked page.

A Digest that arrived after the last claim stores no marker, because the job it opens publishes it. Every other failure that lasts, such as an unreachable Provider, still ends as `digestFailed` once the 3 attempts on one generation are spent, and the job does not reopen itself.

### Digest state and retry

Only the failure marker is stored. `pending` comes from an open Digest job.

- `markDigest` takes `cleared` (a Digest was stored or a retry opened a job) or `attempt-failed` (a refusal, an input over the cap, or a post text file that is still unreadable on the last attempt). Both act only while a Digest job is open. An empty input sets the marker at once through `unusableInput`.
- `keptNotUpdated` clears the marker, then sets it again when an earlier Digest is kept and its `when` holds. Either outcome can coexist with a stored Digest.
- The Item view carries its retry action (`paste`, `digest` or none), so the UI follows one server rule. `shownStatus` gives a ready Item with a failure marker `digest` when `hasDigestSource` holds for it, and `paste` when it does not.
- `POST /api/items/{id}/digest` opens one job over existing text at attempt 0. It leaves an already-open Digest or a failed Item unchanged, because the statements that clear the pending Digest and open the job both name `NOT_FAILED`, so an Item that fails between the read and the batch gets no job ([HTTP interfaces](http-interfaces.md), Digest, status and reads).
- A refresh that stores new text without opening a Digest job marks an older Digest as failed in the same batch.
- A Provider save and an active OpenRouter Connect use `saveWithDigests`. One `INSERT ... SELECT` opens Digest jobs for older Items with a Digest source, no stored Digest and no open Digest job, setting them to `processing`. An Item failure marker always excludes the Item. A Digest failure excludes it unless its latest Digest task was refused as `wrong-key`. The container wakes its loop after the batch commits. An eligible Item with usable text can incur a model call at the existing runner concurrency.

## Owed Digests

The sweep stage `digests` (`sweepDigests`) opens at most 20 Digest jobs in a sweep, oldest Item first. It picks Items that have a Digest source, no stored Digest, no failure marker and no open Digest job, while Grok Bot is chosen as the Provider. Items end in a Digest or the failure marker, so the rule needs no memory and repairs Items that an older release left without a job. The next sweep queues the jobs.

A model Provider is left out on purpose. An OpenRouter Connect whose key is not active yet saves its row and opens no job (`activation-pending`), and a Save of a model Provider opens the jobs through `requeuedDigests`.

## Caller-sent Digests

`items.pending_digest` stores the last Paste's validated Digest, or null.

- The fetch drops it when it stores no text. Otherwise the Digest job publishes it under the generation, pending-value and Pin guards, with every Tag name and the Topic name that a Pin covers written as the Pin's target. Then it clears the pending column.
- `startCallerTask` first creates a running AI task with executor `caller`, and publication then completes it. A failed publish leaves a failed task row, as for a model result. The sweep expires a stranded running row. Only a `running` task moves to `done` or `failed`, so a task the sweep expired stays failed.
- The publishing batch commits only while its task is still `running` (`aiTaskRunning`), so a Digest never links to a failed task. The run counts as stale input, and the job requeues with a new task.
- When the wake-up after the commit fails, `finish` logs `jobs-not-queued`. The committed work stays, and the sweep finds the queued job.
- The publication keeps only the `keptComments` ids that are eligible comments of the generation it publishes, once each (`eligibleAmong`). The stored Digest, the task result and the Kept flags therefore name the same comments, as for a model result.
- A later Paste without a Digest, and Try again, use the model path.

## New Topics and Tags

A Digest job reads `catalog_version` with the Topic and Tag lists it gives the model.

- Reused names only. The job publishes at once, so an Import is not serialized.
- A new Topic or Tag. The publishing batch is guarded on `catalog_version` still being the version the job read. When the guard fails, the job asks the model again with the new lists. The catalog code uses `ON CONFLICT(key) DO NOTHING` and links by key in that same batch, so names another job created are reused. Each inserted name increases `catalog_version` once, and reused keys leave it alone. The guard also allows a moved version when every named key already exists.
- Attempts. Only database errors consume an attempt at publish. Lease loss and stale inputs do not.
- Stale requeues. `jobs.stale_requeues` counts guarded stale requeues, including generation changes, up to `MAX_STALE_REQUEUES` (3). It resets on an error retry or a publish. `staleDelayMs` makes the first two stale requeues due immediately, and the third and later ones due 30 seconds later.
- Starvation. After 3 stale requeues, a model result bypasses the catalog-version guard and publishes by key. It accepts possible near-duplicate names, to avoid starvation under catalog churn. The weekly Tag-merge and Topic-merge Proposals can suggest merging such a name, and the owner accepts or rejects it ([Proposals](../proposals.md)).
- Grok Bot Digests skip the guard at the first answer (the Digest kind's `publish` gets a `basis` only when `executor` is `model`), because every requeue sends a new bot task that costs a full bot run.
- Other guards stay. The Item generation and pending-value guards still apply, so a refreshed Item cannot receive an obsolete Digest. Caller-sent Digests skip the catalog guard, because no model can revise them.
- Pins. Every publication carries a Pin guard on the Digest's Topic key and each of its Tag keys. No stale count lifts it ([Data model outline](data-model-outline.md), Catalog keys). An accepted Tag or Topic merge bumps `catalog_version` once in its last unit, so a model Digest that read the old Tag list asks again while it has fewer than 3 stale requeues.

## Topic overview writes

`inputsHold` guards the Topic, the overview revision, the included Digest versions and the removed membership. A result that loses the guard writes nothing and requeues over fresh inputs.

The `scope` of the overview kind (`overviewAtBot`) also guards each Grok Bot overview task insert, so at most one outstanding bot overview task exists for each Topic. A waiting job reads the Topic again and closes without a send when no coverage gap remains.

## The Reddit turn

The container runs 4 jobs at once, and two fills side by side would double the request rate of the owner's Reddit account. The account step of a fetch of a Reddit link is therefore a queue in the database. The Reddit account queue module writes its turn columns.

- Taking the turn. `takeTurn` is one conditional `UPDATE` that sets `busy_until` (the fill deadline plus `CLAIM_MARGIN_MS`), `busy_job` and `busy_attempt`. The attempt number grows by 1 each time a `running` row is claimed again, so a takeover run has a larger one. The update succeeds only when all of these hold:
  - the run still holds its claim,
  - the account is `connected`,
  - nobody holds the turn, or this job holds it,
  - `limited_until` and a used-up window have passed,
  - `queue_head` is empty or not older than this job.
- The head. `queue_head` is the oldest job that waits for the turn. A job that defers with `reddit-limit` writes the smaller of its id and the head in the same batch. The head stays until that job takes the turn or ends, so the order is the order the links were saved, even while the oldest job is being claimed and its wait reason is empty.
- Waiting. A job that does not win defers with `reddit-limit`, counts no attempt and sends no request, not even oEmbed, for at most 5 minutes (`WAIT_CHECK_MS`) or until the limit or the window reset. A deferral releases the turn and sets the head. A close makes the oldest waiting job due and releases the turn when this job held it. A batch of 100 links therefore makes about one check every 5 minutes for each waiting job, and no poll. A job that defers becomes due at once when the turn is already free for it, because the holder may have released between its refusal and its deferral.
- Losing the claim. A run that loses its claim releases the turn only when `busy_job` and `busy_attempt` are still its own, so the older run of a taken-over job leaves the takeover run's turn alone. Closing or deleting the job of a fill that is running does not free the turn.
- During the fill. The fill asks before each request, the first one and the `me.json` check included, whether its run still holds the turn (`holdsTurn`). It stops at the first request it may not send, and writes no window to the account row once it lost the turn, so a second fill never starts while the first still sends.
- Restart and crash. A restart expires the claim of every running job (`abandonRunning`), and the fill that was running takes its turn back through `busy_job`. A crash leaves `busy_until` to run out after at most the fill deadline plus the claim margin.
- Account changes. An `expired` account and Disconnect make every waiting job due in one batch, and those jobs run on the archive path.

## The weekly claims

The weekly Tag check and Topic check each claim their `scheduled_runs` row (`proposals`, `topic_proposals`) with `claimingWeek` and open one job in the same `db.batch` (`modelCheck`).

- One job. The job insert reads `changes() > 0` right after the claim, so two ticks that race open one job, and a batch that fails spends no week.
- Due. A check is due when there is no row, when `last_run_at` is at least 7 days old, or when it is more than 7 days ahead of the clock (the clock moved back).
- Provider. The claim holds only while a Provider is saved (`providerSet`) and at least one Item has a Digest. With no Provider, nothing is claimed, and the first check runs on the first tick after one is saved.
- Owner Item. The job is owned by the Item with the highest id that has a Digest, as a Topic overview is owned by an Item of its Topic, because every job kind except `export` and `restore` needs an owning Item (`ownedClaim`; [Data model outline](data-model-outline.md), Deleting an Item, says what deleting that Item costs). A job still open for that owner Item blocks the insert through the open-job index, so the claim is spent and no second job opens.
- Two claims. The Topic claim has a row and a batch of its own, because the job insert decides with `changes() > 0` right after its own claim, and a second insert after the Tag claim would read the first insert's count. Two claims also keep the weekly runs independent. Both jobs share the owner Item and have different kinds, so the open-job index allows both.
- Handlers. They have no `blockedBy`, because a Tag belongs to no Topic and the Topic check writes only `proposals` rows. The deadline is `AI_DEADLINE_MS`. The tick calls no model.
- Failures. When the stage throws before its batch commits, `sweep` logs `sweep-stage-failed` and the next tick tries again. When the batch commits and its answer is lost ([Database and search](database-and-search.md), Guarded batches), the next tick finds the week claimed and opens nothing, and the sweep's first stage queues the stored job.
- A failed job. A refusal of the saved settings or the address comes before any task row, so the job leaves a `proposals-run-failed` or `topic-proposals-run-failed` line and no `ai_tasks` row. A refusal after the task was created leaves the line and the task row with its refusal. The Proposals page shows neither, and its "last check" is the latest weekly claim, which does not say that a check finished.

The two weekly checks that call no model (lost Highlights, Topics whose overview leaves out Items) and the disagreement check are in [Proposals](../proposals.md).

## Schedule

One tick claims each due task in `scheduled_runs` and enqueues jobs. Cloudflare calls the tick from a Cron Trigger every minute, and the container calls it from a timer every 60 seconds. The tick calls no model, because a Cron Trigger under an hourly interval gets 30 seconds of CPU ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)).

- Spacing. The tick sweeps at most once in 30 seconds (`TICK_SPACING_MS`), claimed in `scheduled_runs` so two ticks do not both sweep. A stored time more than one spacing ahead of the clock counts as old, because the clock moved back, so a step back of an hour on the container's host does not stop the sweeps for that hour.
- Vault. After the sweep, the tick runs the Vault mirror, also when the sweep failed. A failure inside the mirror is logged as `vault-mirror-failed`, and one that escapes it as `vault-tick-failed`. Neither fails the tick.
- Limit. The sweep enqueues at most 100 due rows (`SWEEP_LIMIT`) in one `sendBatch` call, which takes up to 100 messages and one `delaySeconds` for the batch ([Queues docs, JavaScript APIs](https://developers.cloudflare.com/queues/configuration/javascript-apis/)).
- Failures. A stage that throws is logged as `sweep-stage-failed` with its name, and the later stages still run. The sweep then throws the first error. The tick rethrows it after the Vault mirror ran, so the Worker's scheduled handler rejects and the container's job loop logs `job-loop-failed`.

The sweep runs its stages one after another. The re-queue of due jobs comes first, so a later stage can fail without costing a lost Queue message or an expired claim its recovery.

| Stage | Does |
|---|---|
| `enqueue` | re-queues due job rows |
| `connect` | sweeps the OpenRouter Connect transactions |
| `digests` | expires AI tasks and opens owed Digests (above) |
| the weekly stages | `proposals` (Tags), `topic-proposals` (Topics), `disagreement-proposals` (Items), and the two checks that call no model, `highlight-proposals` and `overview-proposals`. The three model runs are Instance-wide: each opens one job, not one job for each Topic or Tag it touches. |
| `merges` | continues every `accepting` Tag or Topic merge ([Proposals](../proposals.md), Accept) |
| `exports` | cleans Exports (above) |
| `restores` | cleans Restore parts |
| `files` | runs one page of the file cleanup (`cleanFiles`; [Files](files.md)) |

While a Restore runs or has failed with `gave-up`, only `enqueue` and `restores` run.

## Container restart

When the container loop starts, it marks the claim of every `running` row as expired (`abandonRunning`), because the process that held those claims is gone. The loop then claims the rows again, counts the lost attempt and runs them. An Item that was `processing` at the restart leaves `processing` without a new Paste.

The two ways a container stops differ:

- A graceful stop (`SIGTERM` or `SIGINT`, as `podman stop` and `podman restart` send) stops the timers, aborts running CLI tasks, and waits up to `STOP_WAIT_MS` for running jobs, ticks and queue reads to finish before it closes the database. `STOP_WAIT_MS` is `HOP_DEADLINE_MS` plus 1 s, so 9 s: a fetch that was mid-hop when the stop began ends on its own 8 s deadline inside the wait. Those jobs finish in the stopping process and write their result, so the next start takes nothing over and counts no attempt. A stalled fetch ends as `timeout`, `attempts: 0`.
- A crash (`SIGKILL`, the out-of-memory killer, a lost host, or a job still running when the wait ends) closes nothing. The claim stays `running` until the next start runs `abandonRunning`, which counts the lost attempt.

Against a stalled fetch (2026-11-07), `podman restart` returned after 8.7 to 9.3 s (3 runs) with `attempts: 0`, and `podman kill --signal KILL` followed by `podman start` gave `attempts: 1` and `state: done`.

One container runs on a volume. A second container started on the same volume runs `abandonRunning` too, so it expires the claims of the first one's running jobs and takes them. The job runs in both, and each attempt counts. Only the second may write, because the first holds attempt 0 and the row is at attempt 1. A run on one database file (2026-11-10) showed the first container's `holding` false and the second's true. Nothing stops that start, and one volume is not a supported way to share one library between two containers.
