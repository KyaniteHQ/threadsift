import assert from "node:assert/strict";

import { executeClaimed } from "../src/core/compose/jobs.ts";
import type { ClaimedJob } from "../src/core/kernel/job-outcome.ts";
import { isLastAttempt } from "../src/core/kernel/job-retry.ts";
import type { BotKindName, KindCase } from "./bot-kinds-cases.ts";
import {
  acceptedByBot,
  claimedJob,
  openJobOfKind,
  reclaimedJob,
  selectGrokBot,
} from "./bot-task-fixtures.ts";
import { answered } from "./bot-task-http.ts";
import { jobRow, taskRow, taskRows } from "./bot-task-rows.ts";
import type { Instance, Json } from "./instance.ts";
import { exec } from "./related-fixtures.ts";

export { botInstance, selectGrokBot } from "./bot-task-fixtures.ts";

export { jobRow, taskRow };

export interface Sent {
  readonly id: number;
  readonly token: string;
  readonly context: string;
  readonly job: ClaimedJob;
}

interface Counters {
  readonly staleRequeues: number;
}

export function openJobOf(
  instance: Instance,
  options: Readonly<Parameters<typeof openJobOfKind>[1] & { kind: BotKindName }>,
): Promise<ClaimedJob> {
  return openJobOfKind(instance, options);
}

export async function sentTask(
  instance: Instance,
  job: Readonly<ClaimedJob>,
  counters: Readonly<Partial<Counters>> = {},
): Promise<Sent> {
  const lastAttempt = isLastAttempt(job.attempts);

  await selectGrokBot(instance);
  exec(
    instance,
    "update jobs set state = 'queued', attempts = ?, next_attempt_at = 0, claim_expires = null where id = ?",
    lastAttempt ? 0 : job.attempts,
    job.id,
  );
  await executeClaimed(instance.core, await claimedJob(instance, job.id));

  const task = taskRows(instance, "job_id = ?", job.id).at(-1);

  assert.ok(task !== undefined, `the run of job ${String(job.id)} started no task`);

  const { token } = acceptedByBot(instance, task.id);

  if (lastAttempt) {
    exec(instance, "update ai_tasks set attempts = ? where id = ?", job.attempts + 1, task.id);
  }

  exec(
    instance,
    "update jobs set attempts = ?, stale_requeues = ? where id = ?",
    job.attempts,
    counters.staleRequeues ?? job.staleRequeues,
    job.id,
  );

  return {
    id: task.id,
    token,
    context: task.context ?? "",
    job: await reclaimedJob(instance, job),
  };
}

export async function answeredAs(
  instance: Instance,
  {
    kindCase,
    job,
    counters,
    empty = false,
    between,
  }: Readonly<{
    kindCase: KindCase;
    job: Readonly<ClaimedJob>;
    counters?: Readonly<Partial<Counters>>;
    empty?: boolean;
    between?: (context: string) => void;
  }>,
): Promise<Sent> {
  const sent = await sentTask(instance, job, counters);

  between?.(sent.context);

  const result = empty ? kindCase.empty?.(sent.context) : kindCase.fits(sent.context);

  await postResult(instance, sent, result ?? null);
  return sent;
}

async function postResult(instance: Instance, sent: Readonly<Sent>, result: Json): Promise<void> {
  const response = await answered(instance, sent, { result });
  assert.equal(response.status, 204, response.text);
}

export async function applyBotResult(
  instance: Instance,
  sent: Readonly<Sent>,
  result: Json,
): Promise<void> {
  await postResult(instance, sent, result);
  await executeClaimed(instance.core, sent.job);
}
