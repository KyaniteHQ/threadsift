import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { runJob } from "../src/core/compose/jobs.ts";
import { botInstance, pastDeadline } from "./bot-task-fixtures.ts";
import { taskRow, taskRows, dueNow, requeued } from "./bot-task-rows.ts";
import type { Instance } from "./instance.ts";
import { answerOf } from "./x-intake-bodies.ts";
import { intakeTo, sentIntake } from "./x-intake-fixtures.ts";
import { itemRow } from "./x-intake-rows.ts";

const JobStateSchema = z.object({
  state: z.string(),
  wait_reason: z.string().nullable(),
  attempts: z.number(),
});

const jobState = (instance: Instance, id: number) =>
  instance.database.rows(
    JobStateSchema,
    "select state, wait_reason, attempts from jobs where id = ?",
    id,
  )[0];

describe("a fetch with an open Grok Bot task stays on the bot whatever the reader setting says, and the task ends in a final state", () => {
  let instance: Instance;

  before(async () => {
    instance = await botInstance();
    await instance.send("PUT", "/api/settings/x", { reader: "grok-cli" });
  });

  after(() => instance.close());

  it("keeps waiting for the bot after the owner chooses the grok CLI, and stores the bot's answer", async () => {
    const task = await sentIntake(instance);

    requeued(instance, task.job.id);
    await runJob(instance.core, task.job.id);

    assert.deepEqual(jobState(instance, task.job.id), {
      state: "queued",
      wait_reason: "grok-bot",
      attempts: 0,
    });
    assert.equal(taskRow(instance, task.id).state, "running");
    assert.equal(itemRow(instance, task.itemId).fetch_result, null);

    const answer = await intakeTo(instance, task, answerOf(task.statusId));

    assert.equal(answer.status, 204);
    assert.equal(taskRow(instance, task.id).state, "done");
  });

  it("ends a task that passed its deadline as failed on the bot route, and takes the chosen reader for the next attempt", async () => {
    const task = await sentIntake(instance);

    pastDeadline(instance, task.id);
    requeued(instance, task.job.id);
    await runJob(instance.core, task.job.id);

    assert.deepEqual(
      [taskRow(instance, task.id).state, taskRow(instance, task.id).refusal],
      ["failed", "timeout"],
    );
    assert.deepEqual(jobState(instance, task.job.id), {
      state: "queued",
      wait_reason: null,
      attempts: 1,
    });

    dueNow(instance, task.job.id);
    await runJob(instance.core, task.job.id);

    assert.equal(jobState(instance, task.job.id)?.state, "done");
    assert.equal(itemRow(instance, task.itemId).fetch_result, "not-requested");
    assert.equal(taskRows(instance, "item_id = ?", task.itemId).length, 1);
  });
});
