import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { fetchHandler } from "../src/core/fetch-job.ts";
import type { JobOutcome } from "../src/core/job-outcome.ts";
import { botInstance, pastDeadline } from "./bot-task-fixtures.ts";
import { taskRow, taskRows } from "./bot-task-rows.ts";
import type { Instance } from "./instance.ts";
import { answerOf } from "./x-intake-bodies.ts";
import { intakeTo, sentIntakeForContent } from "./x-intake-fixtures.ts";
import { itemRow } from "./x-intake-rows.ts";

const waitsOnTheBot = (outcome: JobOutcome) => "wait" in outcome && outcome.wait === "grok-bot";

describe("a fetch with an open Grok Bot task stays on the bot whatever the reader setting says, and the task ends in a final state", () => {
  let instance: Instance;

  before(async () => {
    instance = await botInstance();
    await instance.send("PUT", "/api/settings/x", { reader: "grok-cli" });
  });

  after(() => instance.close());

  it("keeps waiting for the bot after the owner chooses the grok CLI, and stores the bot's answer", async () => {
    const task = await sentIntakeForContent(instance);

    assert.ok(waitsOnTheBot(await fetchHandler.attempt(instance.core, task.job)));
    assert.equal(taskRow(instance, task.id).state, "running");
    assert.equal(itemRow(instance, task.itemId).fetch_result, null);

    const answer = await intakeTo(instance, task, answerOf(task.statusId));

    assert.equal(answer.status, 204);
    assert.equal(taskRow(instance, task.id).state, "done");
  });

  it("ends a task that passed its deadline as failed on the bot route, and takes the chosen reader for the next attempt", async () => {
    const task = await sentIntakeForContent(instance);

    pastDeadline(instance, task.id);

    await assert.rejects(fetchHandler.attempt(instance.core, task.job));

    assert.deepEqual(
      [taskRow(instance, task.id).state, taskRow(instance, task.id).refusal],
      ["failed", "timeout"],
    );

    const next = await fetchHandler.attempt(instance.core, task.job);

    assert.equal(waitsOnTheBot(next), false);
    assert.equal(taskRows(instance, "item_id = ?", task.itemId).length, 1);
  });
});
