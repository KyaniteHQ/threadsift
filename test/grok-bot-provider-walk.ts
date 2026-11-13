import assert from "node:assert/strict";

import type { ClaimedJob } from "../src/core/job-outcome.ts";
import { claimNextDue } from "../src/core/jobs.ts";
import type { KindCase } from "./bot-kinds-cases.ts";
import { leasesRunOut, sentTask } from "./bot-kinds-fixtures.ts";
import { pastDeadline } from "./bot-task-fixtures.ts";
import { chooseGrokBot, unreadableBotKey } from "./grok-bot-provider-fixtures.ts";
import type { Instance } from "./instance.ts";
import { exec, saveProvider } from "./related-fixtures.ts";

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

  return claimed ?? job;
}

export async function unansweredClaim(
  instance: Instance,
  { kindCase, job }: Readonly<{ kindCase: KindCase; job: Readonly<ClaimedJob> }>,
) {
  const sent = await sentTask(instance, kindCase.kind, job);

  leasesRunOut(instance);
  pastDeadline(instance, sent.id);

  return sent;
}

export async function selectedWithUnreadableKey(
  instance: Instance,
  kindCase: KindCase,
): Promise<number> {
  const owner = await kindCase.library(instance);

  await saveProvider(instance);
  assert.equal((await chooseGrokBot(instance)).status, 200);
  unreadableBotKey(instance);

  return owner;
}
