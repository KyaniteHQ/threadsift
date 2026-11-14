import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { runJob } from "../src/core/jobs.ts";
import { botInstance } from "./bot-task-fixtures.ts";
import { insertedTask, jobRow, taskRow, taskRows } from "./bot-task-rows.ts";
import type { Instance } from "./instance.ts";
import { exec, until } from "./related-fixtures.ts";
import {
  advancedContent,
  closedJob,
  intakeTo,
  sentIntake,
  stepOf,
  waitingIntake,
} from "./x-intake-fixtures.ts";
import { PUBLISHED_TABLES, refusalsOf, stored } from "./x-intake-rows.ts";

const UNREADABLE = { content: "this is not a thread" };

const WRONG_TYPE = { content: 5 };

const THIRTY_SECONDS_MS = 30_000;

describe("an X link answer that the intake refuses twice makes the task's job due at once", () => {
  let instance: Instance;

  beforeEach(async () => {
    instance = await botInstance();
  });

  afterEach(() => instance.close());

  it("leaves the task and its job alone after the first refusal, and after the second sends the task again without waiting for the deadline", async () => {
    const task = await waitingIntake(instance);
    const { deadline } = taskRow(instance, task.id);
    const published = stored(instance, PUBLISHED_TABLES);

    assert.equal((await intakeTo(instance, task, UNREADABLE)).status, 400);
    assert.deepEqual(
      [taskRow(instance, task.id).deadline, jobRow(instance, task.job.id).next_attempt_at],
      [deadline, deadline],
    );

    assert.equal((await intakeTo(instance, task, UNREADABLE)).status, 400);

    const claimed = await until(
      () => jobRow(instance, task.job.id),
      ({ attempts }) => attempts === 1,
    );

    assert.equal(claimed.state, "queued");
    assert.ok(claimed.next_attempt_at - Date.now() <= THIRTY_SECONDS_MS);
    assert.deepEqual(
      [taskRow(instance, task.id).state, taskRow(instance, task.id).refusal],
      ["failed", "timeout"],
    );
    assert.equal(stored(instance, PUBLISHED_TABLES), published);

    exec(instance, "update jobs set next_attempt_at = 0 where id = ?", task.job.id);
    await runJob(instance.core, task.job.id);

    assert.equal(taskRows(instance, "job_id = ?", task.job.id).length, 2);
    assert.ok(Date.now() < deadline);
    assert.equal(jobRow(instance, task.job.id).attempts, 2);
  });

  it("counts nothing for a task that no longer takes an answer", async () => {
    const task = await waitingIntake(instance);

    assert.equal((await intakeTo(instance, task, { unavailable: true })).status, 204);
    assert.equal((await intakeTo(instance, task, WRONG_TYPE)).status, 400);
    assert.equal(refusalsOf(instance, task.id), 0);

    const late = await waitingIntake(instance);

    exec(instance, "update ai_tasks set deadline = ? where id = ?", Date.now() - 1000, late.id);
    assert.equal((await intakeTo(instance, late, WRONG_TYPE)).status, 400);
    assert.equal(refusalsOf(instance, late.id), 0);

    const closed = await waitingIntake(instance);

    closedJob(instance, closed.job.id);
    assert.equal((await intakeTo(instance, closed, WRONG_TYPE)).status, 400);
    assert.equal(refusalsOf(instance, closed.id), 0);

    const changed = await waitingIntake(instance);

    advancedContent(instance, changed.itemId);
    assert.equal((await intakeTo(instance, changed, WRONG_TYPE)).status, 400);
    assert.equal(refusalsOf(instance, changed.id), 0);
  });

  it("counts nothing after the second refusal and leaves the moved deadline as it was", async () => {
    const task = await waitingIntake(instance);

    await intakeTo(instance, task, UNREADABLE);
    await intakeTo(instance, task, UNREADABLE);

    const moved = taskRow(instance, task.id).deadline;

    assert.equal((await intakeTo(instance, task, WRONG_TYPE)).status, 400);
    assert.equal(refusalsOf(instance, task.id), 2);
    assert.equal(taskRow(instance, task.id).deadline, moved);
  });

  it("counts nothing for a task of another kind, even one that has a job and an Item", async () => {
    const task = await waitingIntake(instance);
    const credential = { id: 0, token: "tst_not-an-intake-task" };

    credential.id = insertedTask(instance, {
      kind: "digest",
      executor: "grok-bot",
      token: credential.token,
    });

    exec(
      instance,
      "update ai_tasks set job_id = ?, item_id = ? where id = ?",
      task.job.id,
      task.itemId,
      credential.id,
    );

    assert.equal((await intakeTo(instance, credential, UNREADABLE)).status, 400);
    assert.equal((await intakeTo(instance, credential, UNREADABLE)).status, 400);
    assert.equal(refusalsOf(instance, credential.id), 0);
    assert.equal(taskRow(instance, credential.id).state, "running");
  });

  it("counts the refusals of one send only: a send that renews the credential starts again at zero", async () => {
    const task = await sentIntake(instance);

    await intakeTo(instance, task, UNREADABLE);
    assert.equal(refusalsOf(instance, task.id), 1);

    exec(instance, "update ai_tasks set sent_at = null where id = ?", task.id);
    await assert.rejects(stepOf(instance, task.job), /send failed/u);

    assert.equal(refusalsOf(instance, task.id), 0);
  });
});
