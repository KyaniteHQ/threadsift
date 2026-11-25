import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { runJob } from "../src/core/compose/jobs.ts";
import { acceptedByBot, botInstance } from "./bot-task-fixtures.ts";
import { applied } from "./bot-task-lifecycle.ts";
import { insertedTask, jobRow, taskRow, taskRows } from "./bot-task-rows.ts";
import { until, exec } from "./related-fixtures.ts";
import { answerOf, contentOf, digestOf } from "./x-intake-bodies.ts";
import {
  advancedContent,
  closedJob,
  failedIntake,
  intakeTo,
  sentIntake,
  stepOf,
  type IntakeTask,
  waitingIntake,
} from "./x-intake-fixtures.ts";
import { PUBLISHED_TABLES, refusalsIn, stored } from "./x-intake-rows.ts";

const UNREADABLE = { content: "this is not a thread" };

const WRONG_TYPE = { content: 5 };

const THIRTY_SECONDS_MS = 30_000;

const SECRET_KEY_NAME = "tst_secret_key_name";

const SECRET_VALUE = "an answer text that must not be logged";

const OTHER_POST = "987654321987654321";

const SECRET_NESTED = "tst_secret_nested_key";

function warned(calls: readonly Readonly<{ arguments: readonly unknown[] }>[]): readonly string[] {
  return calls.map(({ arguments: args }) => String(args[0]));
}

describe("refusing an X link answer records its reason and wakes the job after two refusals", () => {
  let instance: Awaited<ReturnType<typeof botInstance>>;

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
      `job ${String(task.job.id)} has spent one attempt`,
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

  async function refusesWithoutRescheduling(task: IntakeTask) {
    const due = jobRow(instance, task.job.id).next_attempt_at;
    const { state, deadline } = taskRow(instance, task.id);
    assert.equal((await intakeTo(instance, task, WRONG_TYPE)).status, 400);
    assert.equal((await intakeTo(instance, task, WRONG_TYPE)).status, 400);
    assert.equal(jobRow(instance, task.job.id).next_attempt_at, due);
    assert.equal(taskRow(instance, task.id).state, state);
    assert.equal(taskRow(instance, task.id).deadline, deadline);
  }

  it("preserves the task and job deadline when the task no longer takes an answer", async () => {
    const task = await failedIntake(instance);
    assert.equal(taskRow(instance, task.id).state, "failed");
    assert.equal(jobRow(instance, task.job.id).state, "running");
    assert.ok(taskRow(instance, task.id).deadline > Date.now());
    await refusesWithoutRescheduling(task);

    const late = await waitingIntake(instance);
    exec(instance, "update ai_tasks set deadline = ? where id = ?", Date.now() - 1000, late.id);
    await refusesWithoutRescheduling(late);

    const closed = await waitingIntake(instance);
    closedJob(instance, closed.job.id);
    await refusesWithoutRescheduling(closed);

    const changed = await waitingIntake(instance);
    advancedContent(instance, changed.itemId);
    await refusesWithoutRescheduling(changed);
  });

  it("preserves the task deadline and the retry delay after a third refusal", async () => {
    const task = await waitingIntake(instance);
    await intakeTo(instance, task, UNREADABLE);
    await intakeTo(instance, task, UNREADABLE);
    const moved = taskRow(instance, task.id).deadline;
    const retry = await until(
      `job ${String(task.job.id)} has spent one attempt`,
      () => jobRow(instance, task.job.id),
      (job) => job.attempts === 1,
    );
    assert.equal((await intakeTo(instance, task, WRONG_TYPE)).status, 400);
    assert.equal(taskRow(instance, task.id).deadline, moved);
    assert.equal(jobRow(instance, task.job.id).next_attempt_at, retry.next_attempt_at);
  });

  it("leaves another kind of task running and keeps its job scheduled after two refusals", async () => {
    const task = await waitingIntake(instance);
    const credential = { id: 0, token: "tst_not-an-intake-task" };

    const due = jobRow(instance, task.job.id).next_attempt_at;
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

    assert.equal((await intakeTo(instance, credential, WRONG_TYPE)).status, 400);
    assert.equal((await intakeTo(instance, credential, WRONG_TYPE)).status, 400);
    assert.equal(jobRow(instance, task.job.id).next_attempt_at, due);
    assert.equal(taskRow(instance, credential.id).state, "running");
  });

  it("waits for two fresh refusals before waking the job after a renewed send", async () => {
    const task = await sentIntake(instance);
    await intakeTo(instance, task, UNREADABLE);
    exec(instance, "update ai_tasks set sent_at = null where id = ?", task.id);
    await assert.rejects(stepOf(instance, task.job), /send failed/u);

    const renewed = acceptedByBot(instance, task.id);
    const deadline = taskRow(instance, task.id).deadline;
    await applied(instance, task.job, await stepOf(instance, task.job));
    assert.equal((await intakeTo(instance, renewed, UNREADABLE)).status, 400);
    assert.equal(jobRow(instance, task.job.id).next_attempt_at, deadline);
    assert.equal((await intakeTo(instance, renewed, UNREADABLE)).status, 400);
    await until(
      `job ${String(task.job.id)} has spent one attempt`,
      () => jobRow(instance, task.job.id),
      (job) => job.attempts === 1,
    );
    assert.equal(taskRow(instance, task.id).refusal, "timeout");
  });

  it("logs each refusal with the task, the Item, the count and issue codes, and no text the bot chose", async (t) => {
    const logged = t.mock.method(console, "warn");
    const task = await waitingIntake(instance);
    const keyed = await waitingIntake(instance);
    const nested = await waitingIntake(instance);

    await intakeTo(instance, task, { content: SECRET_VALUE });
    await intakeTo(instance, task, { content: SECRET_VALUE });
    await intakeTo(instance, keyed, { content: SECRET_VALUE, [SECRET_KEY_NAME]: 1 });

    await intakeTo(instance, nested, {
      content: JSON.stringify({
        post: {
          id: nested.statusId,
          author: "a",
          text: "t",
          postedAt: null,
          replies: null,
          [SECRET_NESTED]: SECRET_VALUE,
        },
        replies: [],
      }),
    });

    const other = await waitingIntake(instance);

    await intakeTo(instance, other, { content: contentOf(OTHER_POST) });

    const lines = warned(logged.mock.calls);

    logged.mock.restore();

    const refusals = refusalsIn(lines);

    assert.deepEqual(
      refusals
        .slice(0, 2)
        .map(({ event, taskId, itemId, refusals: count, issues }) => [
          event,
          taskId,
          itemId,
          count,
          issues,
        ]),
      [
        ["grok-bot-answer-refused", task.id, task.itemId, 1, "not-json"],
        ["grok-bot-answer-refused", task.id, task.itemId, 2, "not-json"],
      ],
    );
    assert.match(refusals[2]?.issues ?? "", /unrecognized_keys@/u);
    assert.match(refusals[3]?.issues ?? "", /unrecognized_keys@post/u);

    assert.match(refusals[4]?.issues ?? "", /^thread-rule the post id # is not the status id/u);

    const secrets = [SECRET_KEY_NAME, SECRET_VALUE, SECRET_NESTED, OTHER_POST, task.token];

    assert.ok(lines.every((line) => secrets.every((secret) => !line.includes(secret))));
  });

  it("keeps the full reasons in the 400 for the bot, which sent that text itself", async () => {
    const task = await waitingIntake(instance);

    const response = await intakeTo(instance, task, {
      content: contentOf(task.statusId),
      digest: { title: "" },
    });

    assert.equal(response.status, 400);
    assert.match(await response.text(), /digest\.title: Too small/u);
  });

  it("cuts the logged codes of a Digest with many bad kept comment ids below the length of the full list", async (t) => {
    const logged = t.mock.method(console, "warn");
    const task = await waitingIntake(instance);

    const response = await intakeTo(instance, task, {
      content: contentOf(task.statusId),
      digest: { ...digestOf(), keptComments: Array.from({ length: 100 }, () => "x".repeat(40)) },
    });

    const lines = warned(logged.mock.calls);

    logged.mock.restore();

    const [refusal] = refusalsIn(lines);

    assert.ok((await response.text()).length > 1000);
    assert.ok((refusal?.issues.length ?? 0) <= 1000);
    assert.ok((refusal?.issues.length ?? 0) > 900);
  });

  it("wakes the job after two refusals across body, Digest and thread validation", async () => {
    await Promise.all(
      [WRONG_TYPE, answerOf("1")].map(async (first) => {
        const task = await waitingIntake(instance);
        const { deadline } = taskRow(instance, task.id);
        assert.equal((await intakeTo(instance, task, first)).status, 400);
        assert.equal(jobRow(instance, task.job.id).next_attempt_at, deadline);
        assert.equal(
          (
            await intakeTo(instance, task, {
              content: contentOf(task.statusId),
              digest: { title: "" },
            })
          ).status,
          400,
        );
        await until(
          `job ${String(task.job.id)} has spent one attempt`,
          () => jobRow(instance, task.job.id),
          (job) => job.attempts === 1,
        );
        const failed = taskRow(instance, task.id);
        assert.deepEqual([failed.state, failed.refusal], ["failed", "timeout"]);
      }),
    );
  });
});
