import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { dueIds, claimNextDue } from "../src/core/compose/jobs.ts";
import { DAY_MS } from "../src/core/contract/time-units.ts";
import {
  type BotLibrary,
  SECRET_KEY,
  answerOf,
  picksFor,
  relatedLibrary,
  retireTasks,
  saveBot,
  unblock,
  pickedFor,
} from "./bot-task-fixtures.ts";
import { answered } from "./bot-task-http.ts";
import { applied, step, taskAfterStart } from "./bot-task-lifecycle.ts";
import { insertedTask, jobRow, taskRow } from "./bot-task-rows.ts";
import { Instance } from "./instance.ts";
import { sweptWith } from "./weekly-claim-fixtures.ts";

describe("an answer reaches its job whichever happens first, the answer or the sender's deferral", () => {
  let instance: Instance;
  let library: BotLibrary;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await saveBot(instance);
    library = await relatedLibrary(instance);
  });

  beforeEach(() => {
    retireTasks(instance);
  });

  after(() => instance.close());

  it("makes the deferral read the answer: an answer that committed first leaves the job due now, not at the deadline", async () => {
    const task = await taskAfterStart(instance, library.source);

    const deferral = {
      deferredUntil: taskRow(instance, task.id).deadline,
      wait: "grok-bot",
      countsAttempt: false,
      unlessOpen: task.id,
    } as const;

    assert.equal(
      (await answered(instance, task, answerOf(picksFor(library.candidates[0])))).status,
      204,
    );

    const committed = Date.now();

    await applied(instance, task.job, deferral);

    const job = jobRow(instance, task.job.id);

    assert.equal(job.state, "queued");
    assert.ok(job.next_attempt_at <= committed + 1000);
    assert.ok(job.next_attempt_at < deferral.deferredUntil);
  });

  it("finds the answered job through the sweep's due query when the wake reached no claimable job, and a claim applies the answer", async () => {
    const task = await taskAfterStart(instance, library.source);

    await applied(instance, task.job, {
      deferredUntil: taskRow(instance, task.id).deadline,
      wait: "grok-bot",
      countsAttempt: false,
      unlessOpen: task.id,
    });
    assert.equal(jobRow(instance, task.job.id).state, "queued");
    assert.equal(
      (await answered(instance, task, answerOf(picksFor(library.candidates[0])))).status,
      204,
    );

    unblock(instance, library.source);

    const due = await dueIds(instance.core.db, Date.now(), 100);
    const claimed = await claimNextDue(instance.core.db);

    assert.ok(due.some(({ id }) => id === task.job.id));
    assert.ok(claimed !== null && claimed.kind !== "export" && claimed.kind !== "restore");
    assert.equal(claimed.id, task.job.id);

    await applied(instance, claimed, await step(instance, claimed));

    assert.deepEqual(pickedFor(instance, library), [library.candidates[0]]);
    assert.equal(jobRow(instance, task.job.id).state, "done");
  });
});

describe("the sweep fails an unclaimed task and leaves an answer and an owned task to their job", () => {
  let instance: Instance;
  let library: BotLibrary;

  const state = (id: number) => taskRow(instance, id).state;

  const sweptAfterDeadline = (ids: readonly number[], ageMs: number) =>
    sweptWith(instance, (now) => {
      instance.database.exec(
        `update ai_tasks set deadline = ? where id in (${ids.map(() => "?").join(", ")})`,
        now - ageMs,
        ...ids,
      );
    });

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await saveBot(instance);
    library = await relatedLibrary(instance);
  });

  after(() => instance.close());

  it("keeps an answered task, and an unanswered task with a job, past the deadline, and still expires a task with no job", async () => {
    retireTasks(instance);

    const answeredTask = await taskAfterStart(instance, library.source);

    assert.equal(
      (await answered(instance, answeredTask, answerOf(picksFor(library.candidates[0])))).status,
      204,
    );

    const owned = await taskAfterStart(instance, library.candidates[0]);

    const plain = insertedTask(instance, {
      kind: "digest",
      executor: "caller",
      token: "tst_plain",
    });

    instance.database.exec("update ai_tasks set job_id = null where id = ?", plain);

    const states = () => [answeredTask.id, owned.id, plain].map((id) => state(id));

    await sweptAfterDeadline([answeredTask.id, owned.id, plain], 0);
    assert.deepEqual(states(), ["running", "running", "running"]);

    await sweptAfterDeadline([answeredTask.id, owned.id, plain], 1);
    assert.deepEqual(states(), ["running", "running", "failed"]);
    assert.notEqual(taskRow(instance, answeredTask.id).result, null);
    assert.equal(taskRow(instance, plain).refusal, "timeout");
  });

  it("fails an answered task and an owned task that nothing claimed one day after their deadline", async () => {
    retireTasks(instance);

    const answeredTask = await taskAfterStart(instance, library.source);
    const owned = await taskAfterStart(instance, library.candidates[1]);

    assert.equal(
      (await answered(instance, answeredTask, answerOf(picksFor(library.candidates[0])))).status,
      204,
    );
    await sweptAfterDeadline([answeredTask.id, owned.id], DAY_MS);
    assert.deepEqual(
      [answeredTask.id, owned.id].map((id) => state(id)),
      ["running", "running"],
    );

    await sweptAfterDeadline([answeredTask.id, owned.id], DAY_MS + 1);
    assert.deepEqual(
      [answeredTask.id, owned.id].map((id) => state(id)),
      ["failed", "failed"],
    );
    assert.deepEqual(
      [answeredTask.id, owned.id].map((id) => [
        taskRow(instance, id).refusal,
        taskRow(instance, id).result,
      ]),
      [
        ["timeout", null],
        ["timeout", null],
      ],
    );
  });
});
