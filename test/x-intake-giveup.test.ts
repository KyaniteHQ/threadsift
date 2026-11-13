import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { fetchHandler } from "../src/core/fetch-job.ts";
import { exhaust } from "../src/core/job-finish.ts";
import { botInstance } from "./bot-task-fixtures.ts";
import { taskRow } from "./bot-task-rows.ts";
import type { Instance } from "./instance.ts";
import { sentIntake } from "./x-intake-fixtures.ts";

describe("an X link task that the bot did not answer ends with its fetch job", () => {
  let instance: Instance;

  before(async () => {
    instance = await botInstance();
  });

  after(() => instance.close());

  it("fails the running task as a timeout when the fetch job gives up, and ends the Item as gave-up", async () => {
    const task = await sentIntake(instance);

    await exhaust(instance.core, task.job, fetchHandler, task.job.attempts + 1);

    const row = taskRow(instance, task.id);

    assert.deepEqual([row.state, row.refusal], ["failed", "timeout"]);

    const detail = await instance.detail(task.itemId);

    assert.deepEqual([detail.status, detail.reason], ["failed", "gave-up"]);
  });
});
