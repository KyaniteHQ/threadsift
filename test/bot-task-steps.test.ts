import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { executeClaimed } from "../src/core/compose/jobs.ts";
import {
  type BotLibrary,
  answerOf,
  openJob,
  pastDeadline,
  picksFor,
  relatedLibrary,
  retireTasks,
  saveBot,
  selectGrokBot,
  pickedFor,
} from "./bot-task-fixtures.ts";
import { answered } from "./bot-task-http.ts";
import {
  applied,
  startedTask,
  sentRelatedTask,
  step,
  taskAfterStart,
} from "./bot-task-lifecycle.ts";
import { jobRow, reclaimed, taskRow, taskRows } from "./bot-task-rows.ts";
import { Instance, SECRET_KEY } from "./instance.ts";
import { paste } from "./library-fixtures.ts";

const SEND_FAILED = /send failed: unreachable/u;

describe("botStep takes the step the latest task of the job calls for and spends an attempt only on a failed send", () => {
  let instance: Instance;
  let library: BotLibrary;

  const tasksOf = (jobId: number) => taskRows(instance, "job_id = ?", jobId);

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await saveBot(instance);
    library = await relatedLibrary(instance);
    await selectGrokBot(instance);
  });

  beforeEach(() => {
    retireTasks(instance);
  });

  after(() => instance.close());

  it("starts a task for a job with none, fails the send, throws, and stores the task as failed", async () => {
    const job = await openJob(instance, library.source);

    await assert.rejects(step(instance, job), SEND_FAILED);

    const [task, ...rest] = tasksOf(job.id);

    assert.deepEqual(rest, []);
    assert.equal(task?.state, "failed");
    assert.equal(task?.refusal, "unreachable");
    assert.equal(task?.executor, "grok-bot");
    assert.equal(task?.sent_at, null);
    assert.equal(jobRow(instance, job.id).attempts, 0);
  });

  it("starts a new task when the latest one failed, whatever the reason and whatever mark the answer left", async () => {
    const job = await openJob(instance, library.source);

    const failures = [
      ["unreachable", null],
      ["timeout", 1],
      ["stale", 1],
      ["no-json", 1],
      ["wrong-key", null],
    ] as const;

    for (const [reason, answeredAt] of failures) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each step reads the task the one before it left.
      await assert.rejects(step(instance, job), SEND_FAILED);
      instance.database.exec(
        "update ai_tasks set refusal = ?, answered_at = ? where id = (select max(id) from ai_tasks where job_id = ?)",
        reason,
        answeredAt,
        job.id,
      );
    }

    assert.deepEqual(
      tasksOf(job.id).map(({ refusal }) => refusal),
      failures.map(([reason]) => reason),
    );
    assert.equal(jobRow(instance, job.id).attempts, 0);
  });

  it("spends no attempt on a stray wake and holds the job until the deadline", async () => {
    const task = await sentRelatedTask(instance, library.source);

    await applied(instance, task.job, await step(instance, task.job));

    const job = jobRow(instance, task.job.id);

    assert.deepEqual(
      [job.state, job.attempts, job.wait_reason, job.next_attempt_at],
      ["queued", 0, "grok-bot", taskRow(instance, task.id).deadline],
    );
  });

  it("sends the same task id again, with a new credential, when a crash fell between the insert and the 2xx", async () => {
    const task = await taskAfterStart(instance, library.source);
    const issued = taskRow(instance, task.id);

    await assert.rejects(step(instance, task.job), SEND_FAILED);

    const renewed = taskRow(instance, task.id);

    assert.equal(tasksOf(task.job.id).length, 1);
    assert.notEqual(renewed.callback_hash, issued.callback_hash);
    assert.deepEqual([renewed.state, renewed.refusal], ["failed", "unreachable"]);
  });

  it("fails the job's running task when the job gives up", async () => {
    const job = await openJob(instance, library.source, 3);
    const task = await startedTask(instance, job);

    await executeClaimed(instance.core, job);

    const row = taskRow(instance, task.id);

    assert.deepEqual([row.state, row.refusal], ["failed", "timeout"]);
    assert.equal(jobRow(instance, job.id).state, "done");
    assert.equal(
      (await answered(instance, task, answerOf(picksFor(library.candidates[0])))).status,
      409,
    );
  });

  it("fails an unanswered task past its deadline timeout in one batch and throws", async () => {
    const task = await sentRelatedTask(instance, library.source);

    pastDeadline(instance, task.id);

    await assert.rejects(step(instance, task.job), /deadline/u);

    assert.deepEqual(
      [taskRow(instance, task.id).state, taskRow(instance, task.id).refusal],
      ["failed", "timeout"],
    );
  });

  it("applies an answer to the job's third send, at attempts 2, and writes the picks", async () => {
    const task = await sentRelatedTask(instance, library.source);
    const third = { ...task.job, attempts: 2 };

    instance.database.exec("update jobs set attempts = 2 where id = ?", task.job.id);
    assert.equal(
      (await answered(instance, task, answerOf(picksFor(library.candidates[0])))).status,
      204,
    );

    await applied(instance, third, await step(instance, third));

    assert.deepEqual(pickedFor(instance, library), [library.candidates[0]]);
    assert.deepEqual(
      [taskRow(instance, task.id).state, jobRow(instance, task.job.id).state],
      ["done", "done"],
    );
    assert.equal(jobRow(instance, task.job.id).attempts, 2);
  });

  it("charges a bot error to the job once: the first claim throws, the next starts a new task", async () => {
    const task = await taskAfterStart(instance, library.source);

    assert.equal((await answered(instance, task, { error: "No." })).status, 204);
    assert.notEqual(taskRow(instance, task.id).answered_at, null);

    await assert.rejects(step(instance, task.job), /reported an error/u);
    assert.equal(taskRow(instance, task.id).answered_at, null);
    assert.equal(tasksOf(task.job.id).length, 1);

    await assert.rejects(step(instance, task.job), SEND_FAILED);
    assert.equal(tasksOf(task.job.id).length, 2);
    assert.equal(jobRow(instance, task.job.id).attempts, 0);
  });
});

describe("an answer that no longer fits fails the task, and the job starts a new one without spending an attempt", () => {
  let instance: Instance;
  let library: BotLibrary;

  const answeredTask = async (candidate: number) => {
    retireTasks(instance);

    const task = await sentRelatedTask(instance, library.source);
    const job = { ...task.job, attempts: 1 };

    instance.database.exec("update jobs set attempts = 1 where id = ?", job.id);

    assert.equal((await answered(instance, task, answerOf(picksFor(candidate)))).status, 204);

    return { task, job };
  };

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await saveBot(instance);
    library = await relatedLibrary(instance);
    await selectGrokBot(instance);
  });

  after(() => instance.close());

  const settled = async (candidate: number, change: () => Promise<void>) => {
    const { task, job } = await answeredTask(candidate);

    await change();
    await applied(instance, job, await step(instance, job));

    const row = jobRow(instance, job.id);

    assert.deepEqual(pickedFor(instance, library), []);
    assert.deepEqual(
      [taskRow(instance, task.id).state, taskRow(instance, task.id).refusal],
      ["failed", "stale"],
    );
    assert.deepEqual([row.state, row.attempts, row.stale_requeues], ["queued", 1, 1]);

    reclaimed(instance, job);

    await assert.rejects(step(instance, job), SEND_FAILED);
    assert.deepEqual(
      taskRows(instance, "job_id = ?", job.id).map(({ state, refusal }) => [state, refusal]),
      [
        ["failed", "stale"],
        ["failed", "unreachable"],
      ],
    );
    assert.equal(jobRow(instance, job.id).attempts, 1);
  };

  it("when a sent candidate was deleted", async () => {
    const [candidate] = library.candidates;

    await settled(candidate, async () => {
      assert.equal((await instance.send("DELETE", `/api/items/${String(candidate)}`)).status, 204);
    });
  });

  it("when the stored answer no longer fits its kind", async () => {
    const candidate = library.candidates[1];
    const { task, job } = await answeredTask(candidate);

    instance.database.exec("update ai_tasks set result = '\"x\"' where id = ?", task.id);
    await assert.rejects(step(instance, job), /no longer fits/u);
    assert.deepEqual(
      [taskRow(instance, task.id).state, taskRow(instance, task.id).refusal],
      ["failed", "no-json"],
    );
    await assert.rejects(step(instance, job), SEND_FAILED);
    assert.equal(taskRows(instance, "job_id = ?", job.id).length, 2);
  });

  it("when a sent candidate got a new Digest", async () => {
    const candidate = library.candidates[1];

    await settled(candidate, async () => {
      await paste(instance, "near-two", { title: "Quasar notes, revised", tags: ["quasar"] });
    });
  });
});
