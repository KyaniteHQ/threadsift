import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import { latestTask } from "../src/core/bot-task-states.ts";
import { applyOutcome } from "../src/core/job-finish.ts";
import { refusedAnswer } from "../src/core/x-intake-writes.ts";
import { botInstance } from "./bot-task-fixtures.ts";
import { jobRow, taskRow } from "./bot-task-rows.ts";
import type { Instance } from "./instance.ts";
import { exec, until } from "./related-fixtures.ts";
import { intakeTo, sentIntake, waitingIntake } from "./x-intake-fixtures.ts";

const UNREADABLE = { content: "this is not a thread" };

const SECOND_MS = 1000;

describe("a refusal that lands while the job's send is still being recorded or after the job moved on", () => {
  let instance: Instance;

  beforeEach(async () => {
    instance = await botInstance();
  });

  afterEach(() => instance.close());

  function deferredTo(
    deferredUntil: number,
    taskId: number,
    job: Awaited<ReturnType<typeof sentIntake>>["job"],
  ) {
    return applyOutcome(instance.core, job, {
      deferredUntil,
      wait: "grok-bot",
      countsAttempt: false,
      unlessOpen: taskId,
      writes: [],
    });
  }

  it("wakes the job at once when both refusals land before the deferral is written", async () => {
    const task = await sentIntake(instance);
    const { deadline } = taskRow(instance, task.id);

    await intakeTo(instance, task, UNREADABLE);
    await intakeTo(instance, task, UNREADABLE);
    await deferredTo(deadline, task.id, task.job);

    const claimed = await until(
      () => jobRow(instance, task.job.id),
      ({ attempts }) => attempts === 1,
    );

    assert.equal(claimed.state, "queued");
  });

  it("sleeps no longer than the stored deadline when that deadline moved after the deferral was prepared", async () => {
    const task = await sentIntake(instance);
    const { deadline } = taskRow(instance, task.id);

    exec(
      instance,
      "update ai_tasks set deadline = ?, answer_refusals = 2 where id = ?",
      Date.now() + 5 * SECOND_MS,
      task.id,
    );
    await deferredTo(deadline, task.id, task.job);

    assert.ok(jobRow(instance, task.job.id).next_attempt_at <= Date.now() + 6 * SECOND_MS);
  });

  it("queues the wake for the stored due time, not for the deadline the send knew", async () => {
    const queued = mock.method(instance.core.jobs, "enqueue");
    const task = await sentIntake(instance);
    const { deadline } = taskRow(instance, task.id);

    await intakeTo(instance, task, UNREADABLE);
    await intakeTo(instance, task, UNREADABLE);
    queued.mock.resetCalls();
    await deferredTo(deadline, task.id, task.job);

    const delays = queued.mock.calls.map(({ arguments: args }) => args[1]);

    queued.mock.restore();
    assert.deepEqual(
      delays.map((delay) => delay < 5 * SECOND_MS),
      [true],
    );
  });

  it("does not pull a retry delay forward when a late refusal carries the moment that moved the deadline", async () => {
    const task = await waitingIntake(instance);

    await intakeTo(instance, task, UNREADABLE);
    await intakeTo(instance, task, UNREADABLE);

    const claimed = await until(
      () => jobRow(instance, task.job.id),
      ({ attempts }) => attempts === 1,
    );

    const row = await latestTask(instance.core.db, task.job.id);

    assert.ok(row !== null && row.jobId !== null && row.itemId !== null);
    assert.equal(
      await refusedAnswer(
        instance.core.db,
        { ...row, jobId: row.jobId, itemId: row.itemId },
        taskRow(instance, task.id).deadline,
      ),
      null,
    );
    assert.equal(jobRow(instance, task.job.id).next_attempt_at, claimed.next_attempt_at);
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
