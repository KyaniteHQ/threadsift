import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { acceptBotAnswer } from "../src/core/bot-answer.ts";
import { latestTask, renewedCredential, timedOutTask } from "../src/core/bot-task-states.ts";
import {
  type BotLibrary,
  SECRET_KEY,
  answerOf,
  pastDeadline,
  picksFor,
  relatedLibrary,
  retireTasks,
  saveBot,
} from "./bot-task-fixtures.ts";
import { answered } from "./bot-task-http.ts";
import { sendFor, settle, step, taskAfterStart } from "./bot-task-lifecycle.ts";
import { jobRow, taskRow, taskRows } from "./bot-task-rows.ts";
import { Instance } from "./instance.ts";
import { exec, pairsOf } from "./related-fixtures.ts";

describe("an accepted answer survives a lost claim, a failing send, a timeout check and a resend", () => {
  let instance: Instance;
  let library: BotLibrary;

  const firstCandidate = () => {
    const [candidate] = library.candidates;

    assert.ok(candidate !== undefined);

    return candidate;
  };

  const tasksOf = (jobId: number) => taskRows(instance, "job_id = ?", jobId);

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

  it("leaves the credential and the task alone when the claim is gone", async () => {
    const task = await taskAfterStart(instance, library.source);
    const issued = taskRow(instance, task.id);

    const outcome = await step(instance, { ...task.job, attempts: task.job.attempts + 1 });

    assert.ok("deferredUntil" in outcome);
    assert.deepEqual(taskRow(instance, task.id), issued);
  });

  it("applies the answer that arrived while the send was failing instead of failing the task", async () => {
    const task = await taskAfterStart(instance, library.source);
    const sent = await latestTask(instance.core.db, task.job.id);

    assert.ok(sent !== null);
    assert.equal(
      (await answered(instance, task, answerOf(picksFor(firstCandidate())))).status,
      204,
    );

    const send = await sendFor(instance, { job: task.job, task: sent, token: task.token });

    const row = taskRow(instance, task.id);

    assert.equal(send.kind, "unchanged");
    assert.deepEqual([row.state, row.refusal], ["running", null]);
    assert.notEqual(row.result, null);

    await settle(instance, task.job);

    assert.deepEqual(
      pairsOf(instance, library.source).map(({ related_id: id }) => id),
      [firstCandidate()],
    );
    assert.equal(taskRow(instance, task.id).state, "done");
    assert.equal(jobRow(instance, task.job.id).attempts, 0);
  });

  it("leaves the task running when a send fails after the claim was taken over", async () => {
    const task = await taskAfterStart(instance, library.source);
    const sent = await latestTask(instance.core.db, task.job.id);

    assert.ok(sent !== null);

    const send = await sendFor(instance, {
      job: { ...task.job, attempts: task.job.attempts + 1 },
      task: sent,
      token: task.token,
    });

    assert.equal(send.kind, "unchanged");
    assert.deepEqual(
      [taskRow(instance, task.id).state, taskRow(instance, task.id).refusal],
      ["running", null],
    );
  });

  it("keeps an accepted answer when the runner that applies it lost its claim", async () => {
    const task = await taskAfterStart(instance, library.source);

    exec(instance, "update ai_tasks set sent_at = ? where id = ?", Date.now(), task.id);
    assert.equal(
      (await answered(instance, task, answerOf(picksFor(firstCandidate())))).status,
      204,
    );

    await settle(instance, task.job, { ...task.job, attempts: task.job.attempts + 1 });

    const row = taskRow(instance, task.id);

    assert.deepEqual([row.state, row.refusal], ["running", null]);
    assert.notEqual(row.result, null);

    await settle(instance, task.job);

    assert.equal(taskRow(instance, task.id).state, "done");
    assert.deepEqual(
      pairsOf(instance, library.source).map(({ related_id: id }) => id),
      [firstCandidate()],
    );
  });

  it("does not time out a task that got an answer, and leaves a lost claim alone", async () => {
    const task = await taskAfterStart(instance, library.source);

    exec(instance, "update ai_tasks set sent_at = ? where id = ?", Date.now(), task.id);
    assert.equal(
      (await answered(instance, task, answerOf(picksFor(firstCandidate())))).status,
      204,
    );
    pastDeadline(instance, task.id);

    const change = { taskId: task.id, now: Date.now() };

    assert.equal(await timedOutTask(instance.core.db, task.job, change), "changed");
    assert.equal(
      await timedOutTask(instance.core.db, { ...task.job, attempts: 9 }, change),
      "claim-lost",
    );
    assert.deepEqual(
      [taskRow(instance, task.id).state, taskRow(instance, task.id).refusal],
      ["running", null],
    );
    assert.equal(tasksOf(task.job.id).length, 1);
  });

  it("refuses an answer from a request that authenticated before a resend replaced the credential", async () => {
    const { job, id } = await taskAfterStart(instance, library.source);
    const snapshot = await latestTask(instance.core.db, job.id);

    assert.ok(snapshot !== null);
    assert.equal(
      await renewedCredential(instance.core.db, job, { taskId: id, callbackHash: "renewed" }),
      true,
    );

    const outcome = await acceptBotAnswer(instance.core, snapshot, {
      kind: "result",
      resultText: JSON.stringify(picksFor(firstCandidate())),
    });

    assert.equal(outcome.kind, "closed");
    assert.equal(taskRow(instance, id).answered_at, null);
  });
});
