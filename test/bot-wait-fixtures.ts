import assert from "node:assert/strict";

import { executeClaimed } from "../src/core/compose/jobs.ts";
import { HOUR_MS } from "../src/core/contract/time-units.ts";
import type { ClaimedJob } from "../src/core/kernel/job-outcome.ts";
import { botInstance } from "./bot-task-fixtures.ts";
import { jobRow, taskRow } from "./bot-task-rows.ts";
import type { Instance } from "./instance.ts";
import { until } from "./library-fixtures.ts";

const WAITS_PAST_MS = HOUR_MS / 2;

type JobState = ReturnType<typeof jobRow>;

export function waitsForBot(job: Readonly<JobState>): boolean {
  return (
    job.state === "queued" &&
    job.wait_reason === "grok-bot" &&
    job.next_attempt_at > Date.now() + WAITS_PAST_MS
  );
}

export async function inInstance(body: (instance: Instance) => Promise<void>): Promise<void> {
  const instance = await botInstance();

  try {
    await body(instance);
  } finally {
    await instance.close();
  }
}

export async function waitingOn(instance: Instance, job: Readonly<ClaimedJob>): Promise<void> {
  await executeClaimed(instance.core, job);

  const row = jobRow(instance, job.id);

  assert.ok(
    waitsForBot(row),
    `job ${String(job.id)} does not wait for its task: ${JSON.stringify(row)}`,
  );
}

export async function endsStale(instance: Instance, taskId: number): Promise<void> {
  const task = await until(
    `the Grok Bot task ${String(taskId)} ends`,
    () => taskRow(instance, taskId),
    ({ state }) => state !== "running",
  );

  assert.equal(task.state, "failed");
  assert.equal(task.refusal, "stale");
}
