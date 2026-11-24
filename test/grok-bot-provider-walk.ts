import assert from "node:assert/strict";

import { claimNextDue, executeClaimed } from "../src/core/compose/jobs.ts";
import type { ClaimedJob } from "../src/core/kernel/job-outcome.ts";
import { sentTask } from "./bot-kinds-fixtures.ts";
import { pastDeadline } from "./bot-task-fixtures.ts";
import { jobRow } from "./bot-task-rows.ts";
import { atClock } from "./clock-fixtures.ts";
import type { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";

export async function claimedAgain(
  instance: Instance,
  job: Readonly<ClaimedJob>,
): Promise<Readonly<ClaimedJob>> {
  exec(
    instance,
    "update jobs set state = 'done', claim_expires = null where id <> ? and state <> 'done'",
    job.id,
  );
  exec(
    instance,
    "update jobs set next_attempt_at = ?, claim_expires = null where id = ?",
    Date.now(),
    job.id,
  );

  const claimed = await claimNextDue(instance.core.db);

  assert.equal(claimed?.id, job.id);

  assert.ok(
    claimed !== null && claimed.kind !== "export" && claimed.kind !== "restore",
    `Job ${String(job.id)} claimed as ${claimed?.kind}`,
  );

  return claimed;
}

export async function unansweredClaim(instance: Instance, job: Readonly<ClaimedJob>) {
  const sent = await sentTask(instance, job);

  pastDeadline(instance, sent.id);

  return sent;
}

export async function retryAfterTimeout(instance: Instance, job: Readonly<ClaimedJob>) {
  const now = Date.now();

  await atClock(
    () => now,
    () => executeClaimed(instance.core, job),
  );

  const retry = jobRow(instance, job.id);

  return { state: retry.state, attempts: retry.attempts, delay: retry.next_attempt_at - now };
}
