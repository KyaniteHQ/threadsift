import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { applyOutcome } from "../src/core/job-finish.ts";
import { dueIds, claimNextDue } from "../src/core/jobs.ts";
import {
  type BotLibrary,
  SECRET_KEY,
  answerOf,
  picksFor,
  relatedLibrary,
  retireTasks,
  saveBot,
  unblock,
} from "./bot-task-fixtures.ts";
import { answered } from "./bot-task-http.ts";
import { step, taskAfterStart } from "./bot-task-lifecycle.ts";
import { insertedTask, jobRow, taskRow } from "./bot-task-rows.ts";
import { Instance } from "./instance.ts";
import { exec, pairsOf } from "./related-fixtures.ts";

const DAY_MS = 24 * 3_600_000;

describe("an answer reaches its job whichever happens first, the answer or the sender's deferral", () => {
  let instance: Instance;
  let library: BotLibrary;

  const candidate = () => {
    const [first] = library.candidates;

    assert.ok(first !== undefined);

    return first;
  };

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

    assert.equal((await answered(instance, task, answerOf(picksFor(candidate())))).status, 204);

    const committed = Date.now();

    await applyOutcome(instance.core, task.job, deferral);

    const job = jobRow(instance, task.job.id);

    assert.equal(job.state, "queued");
    assert.ok(job.next_attempt_at <= committed + 1000);
    assert.ok(job.next_attempt_at < deferral.deferredUntil);
  });

  it("defers to the deadline when no answer came", async () => {
    const task = await taskAfterStart(instance, library.source);

    const deferral = {
      deferredUntil: taskRow(instance, task.id).deadline,
      wait: "grok-bot",
      countsAttempt: false,
      unlessOpen: task.id,
    } as const;

    await applyOutcome(instance.core, task.job, deferral);

    assert.equal(jobRow(instance, task.job.id).next_attempt_at, deferral.deferredUntil);
  });

  it("finds the answered job through the sweep's due query when the wake reached no claimable job, and a claim applies the answer", async () => {
    const task = await taskAfterStart(instance, library.source);

    await applyOutcome(instance.core, task.job, {
      deferredUntil: taskRow(instance, task.id).deadline,
      wait: "grok-bot",
      countsAttempt: false,
      unlessOpen: task.id,
    });
    assert.equal(jobRow(instance, task.job.id).state, "queued");
    assert.equal((await answered(instance, task, answerOf(picksFor(candidate())))).status, 204);

    unblock(instance, library.source);

    const due = await dueIds(instance.core.db, Date.now(), 100);
    const claimed = await claimNextDue(instance.core.db);

    assert.ok(due.some(({ id }) => id === task.job.id));
    assert.ok(claimed !== null);
    assert.equal(claimed.id, task.job.id);

    await applyOutcome(instance.core, claimed, await step(instance, claimed));

    assert.deepEqual(
      pairsOf(instance, library.source).map(({ related_id: id }) => id),
      [candidate()],
    );
    assert.equal(jobRow(instance, task.job.id).state, "done");
  });
});

describe("the sweep fails an unclaimed task and leaves an answer and an owned task to their job", () => {
  let instance: Instance;
  let library: BotLibrary;

  const state = (id: number) => taskRow(instance, id).state;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await saveBot(instance);
    library = await relatedLibrary(instance);
  });

  after(() => instance.close());

  const sweep = async () => {
    exec(instance, "delete from scheduled_runs where task = 'sweep'");
    await instance.tick();
  };

  it("keeps an answered task, and an unanswered task with a job, past the deadline, and still expires a task with no job", async () => {
    retireTasks(instance);

    const answeredTask = await taskAfterStart(instance, library.source);

    assert.equal(
      (await answered(instance, answeredTask, answerOf(picksFor(library.candidates[0] ?? 0))))
        .status,
      204,
    );

    const owned = await taskAfterStart(instance, library.candidates[0] ?? 0);

    const plain = insertedTask(instance, {
      kind: "digest",
      executor: "caller",
      token: "tst_plain",
    });

    exec(instance, "update ai_tasks set job_id = null where id = ?", plain);

    const past = Date.now() - 1000;

    exec(
      instance,
      "update ai_tasks set deadline = ? where id in (?, ?, ?)",
      past,
      answeredTask.id,
      owned.id,
      plain,
    );
    await sweep();

    assert.deepEqual(
      [answeredTask.id, owned.id, plain].map((id) => state(id)),
      ["running", "running", "failed"],
    );
    assert.notEqual(taskRow(instance, answeredTask.id).result, null);
    assert.equal(taskRow(instance, plain).refusal, "timeout");
  });

  it("fails an answered task and an owned task that nothing claimed one day after their deadline", async () => {
    retireTasks(instance);

    const answeredTask = await taskAfterStart(instance, library.source);
    const owned = await taskAfterStart(instance, library.candidates[1] ?? 0);

    assert.equal(
      (await answered(instance, answeredTask, answerOf(picksFor(library.candidates[0] ?? 0))))
        .status,
      204,
    );
    exec(
      instance,
      "update ai_tasks set deadline = ? where id in (?, ?)",
      Date.now() - DAY_MS - 1000,
      answeredTask.id,
      owned.id,
    );
    await sweep();

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
