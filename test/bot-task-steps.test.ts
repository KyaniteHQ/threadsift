import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { applyOutcome } from "../src/core/job-finish.ts";
import { executeClaimed } from "../src/core/jobs.ts";
import {
  type BotLibrary,
  SECRET_KEY,
  answerOf,
  openJob,
  pastDeadline,
  picksFor,
  relatedLibrary,
  retireTasks,
  saveBot,
} from "./bot-task-fixtures.ts";
import { answered } from "./bot-task-http.ts";
import { reclaimed, startedTask, step, taskAfterStart } from "./bot-task-lifecycle.ts";
import { jobRow, taskRow, taskRows } from "./bot-task-rows.ts";
import { Instance } from "./instance.ts";
import { exec, pairsOf, paste } from "./related-fixtures.ts";

const SEND_FAILED = /send failed: unreachable/u;

describe("botStep takes the step the latest task of the job calls for and spends an attempt only on a failed send", () => {
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
      ["timeout", 1],
      ["stale", 1],
      ["no-json", 1],
      ["wrong-key", null],
    ] as const;

    for (const [reason, answeredAt] of failures) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each step reads the task the one before it left.
      await assert.rejects(step(instance, job), SEND_FAILED);
      exec(
        instance,
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
    const task = await taskAfterStart(instance, library.source);

    exec(instance, "update ai_tasks set sent_at = ? where id = ?", Date.now(), task.id);
    await applyOutcome(instance.core, task.job, await step(instance, task.job));

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
      (await answered(instance, task, answerOf(picksFor(firstCandidate())))).status,
      409,
    );
  });

  it("fails an unanswered task past its deadline timeout in one batch and throws", async () => {
    const task = await taskAfterStart(instance, library.source);

    exec(instance, "update ai_tasks set sent_at = ? where id = ?", Date.now(), task.id);
    pastDeadline(instance, task.id);

    await assert.rejects(step(instance, task.job), /deadline/u);

    assert.deepEqual(
      [taskRow(instance, task.id).state, taskRow(instance, task.id).refusal],
      ["failed", "timeout"],
    );
  });

  it("applies an answer to the job's third send, at attempts 2, and writes the picks", async () => {
    const task = await taskAfterStart(instance, library.source);
    const third = { ...task.job, attempts: 2 };

    exec(instance, "update jobs set attempts = 2 where id = ?", task.job.id);
    exec(instance, "update ai_tasks set sent_at = ? where id = ?", Date.now(), task.id);
    assert.equal(
      (await answered(instance, task, answerOf(picksFor(firstCandidate())))).status,
      204,
    );

    await applyOutcome(instance.core, third, await step(instance, third));

    assert.deepEqual(
      pairsOf(instance, library.source).map(({ related_id: id }) => id),
      [firstCandidate()],
    );
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

  const answeredTask = async (candidates: readonly number[]) => {
    retireTasks(instance);

    const task = await taskAfterStart(instance, library.source);
    const job = { ...task.job, attempts: 1 };

    exec(instance, "update jobs set attempts = 1 where id = ?", job.id);
    exec(instance, "update ai_tasks set sent_at = ? where id = ?", Date.now(), task.id);

    const [first] = candidates;

    assert.ok(first !== undefined);
    assert.equal((await answered(instance, task, answerOf(picksFor(first)))).status, 204);

    return { task, job };
  };

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await saveBot(instance);
    library = await relatedLibrary(instance);
  });

  after(() => instance.close());

  const settled = async (candidate: number, change: () => Promise<void>) => {
    const { task, job } = await answeredTask([candidate]);

    await change();
    await applyOutcome(instance.core, job, await step(instance, job));

    const row = jobRow(instance, job.id);

    assert.deepEqual(pairsOf(instance, library.source), []);
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

    assert.ok(candidate !== undefined);
    await settled(candidate, async () => {
      assert.equal((await instance.send("DELETE", `/api/items/${String(candidate)}`)).status, 204);
    });
  });

  it("when the stored answer no longer fits its kind", async () => {
    const { task, job } = await answeredTask([library.candidates[1] ?? 0]);

    exec(instance, "update ai_tasks set result = '\"x\"' where id = ?", task.id);
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

    assert.ok(candidate !== undefined);
    await settled(candidate, async () => {
      await paste(instance, "near-two", { title: "Quasar notes, revised", tags: ["quasar"] });
    });
  });
});
