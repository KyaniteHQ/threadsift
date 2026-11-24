import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { botInstance } from "./bot-task-fixtures.ts";
import { applied } from "./bot-task-lifecycle.ts";
import { jobRow, taskRow } from "./bot-task-rows.ts";
import type { Instance } from "./instance.ts";
import { until } from "./related-fixtures.ts";
import { exec } from "./sqlite-fixtures.ts";
import { atClock } from "./token-budget-fixtures.ts";
import { intakeTo, sentIntake, stepOf, waitingIntake } from "./x-intake-fixtures.ts";

const UNREADABLE = { content: "this is not a thread" };

const SECOND_MS = 1000;

describe("a refusal that lands while the job's send is still being recorded or after the job moved on", () => {
  let instance: Instance;

  beforeEach(async () => {
    instance = await botInstance();
  });

  afterEach(() => instance.close());

  it("wakes the job at once when both refusals land before the deferral is written", async () => {
    const task = await sentIntake(instance);
    const outcome = await stepOf(instance, task.job);

    await intakeTo(instance, task, UNREADABLE);
    await intakeTo(instance, task, UNREADABLE);
    await applied(instance, task.job, outcome);

    const claimed = await until(
      () => jobRow(instance, task.job.id),
      ({ attempts }) => attempts === 1,
    );

    assert.equal(claimed.state, "queued");
  });

  it("sleeps no longer than the stored deadline when that deadline moved after the deferral was prepared", async () => {
    const task = await sentIntake(instance);
    const outcome = await stepOf(instance, task.job);

    const deadline = Date.now() + 5 * SECOND_MS;
    exec(instance, "update ai_tasks set deadline = ? where id = ?", deadline, task.id);
    await applied(instance, task.job, outcome);

    const row = jobRow(instance, task.job.id);
    assert.deepEqual([row.state, row.next_attempt_at], ["queued", deadline]);
  });

  it("queues the wake for the stored due time, not for the deadline the send knew", async (t) => {
    const queued = t.mock.method(instance.core.jobs, "enqueue");
    const task = await sentIntake(instance);
    const outcome = await stepOf(instance, task.job);

    await intakeTo(instance, task, UNREADABLE);
    await intakeTo(instance, task, UNREADABLE);
    queued.mock.resetCalls();
    await applied(instance, task.job, outcome);

    const delays = queued.mock.calls.map(({ arguments: args }) => args[1]);

    queued.mock.restore();
    assert.deepEqual(
      delays.map((delay) => delay < 5 * SECOND_MS),
      [true],
    );
  });

  it("preserves the retry delay when a late refusal shares the time that moved the deadline", async () => {
    const task = await waitingIntake(instance);
    await intakeTo(instance, task, UNREADABLE);
    await intakeTo(instance, task, UNREADABLE);
    const retry = await until(
      () => jobRow(instance, task.job.id),
      (job) => job.attempts === 1,
    );
    const moved = taskRow(instance, task.id).deadline;
    const response = await atClock(
      () => moved,
      () => intakeTo(instance, task, { content: 5 }),
    );
    assert.equal(response.status, 400);
    assert.equal(jobRow(instance, task.job.id).next_attempt_at, retry.next_attempt_at);
  });

  it("answers the refusal with its 400 when counting it fails", async () => {
    const task = await sentIntake(instance);

    exec(
      instance,
      "create trigger no_count before update of answer_refusals on ai_tasks begin select raise(abort, 'count refused'); end",
    );

    const response = await intakeTo(instance, task, UNREADABLE);

    assert.equal(response.status, 400);
    assert.match(await response.text(), /not readable JSON/u);
  });

  it("counts nothing for a valid answer that fails on the Instance's side", async () => {
    const task = await sentIntake(instance);
    const { deadline } = taskRow(instance, task.id);

    exec(
      instance,
      "create trigger no_settle before update on items begin select raise(abort, 'no'); end",
    );

    assert.equal((await intakeTo(instance, task, { unavailable: true })).status, 500);
    assert.equal((await intakeTo(instance, task, { unavailable: true })).status, 500);
    assert.equal(taskRow(instance, task.id).deadline, deadline);
  });
});
