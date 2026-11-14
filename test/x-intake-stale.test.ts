import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { botInstance, pastDeadline } from "./bot-task-fixtures.ts";
import { jobRow, taskRow, taskRows } from "./bot-task-rows.ts";
import type { Instance } from "./instance.ts";
import { answerOf, suppliedContent } from "./x-intake-bodies.ts";
import {
  addressOf,
  advancedContent,
  closedJob,
  insertedFetchJob,
  intakeTo,
  openJobIds,
  sentIntake,
  stepOf,
} from "./x-intake-fixtures.ts";
import { PUBLISHED_TABLES, itemRow, stored } from "./x-intake-rows.ts";

describe("an answer the task no longer takes publishes nothing, and an unavailable post closes the task with no thread", () => {
  let instance: Instance;

  before(async () => {
    instance = await botInstance();
  });

  after(() => instance.close());

  it("fails the task stale and wakes its open job when the Item's content moved on", async () => {
    const task = await sentIntake(instance);
    const started = Date.now();

    advancedContent(instance, task.itemId);

    const unchanged = stored(instance, PUBLISHED_TABLES);
    const answer = await intakeTo(instance, task, answerOf(task.statusId));
    const row = taskRow(instance, task.id);
    const job = jobRow(instance, task.job.id);

    assert.equal(answer.status, 409);
    assert.deepEqual([row.state, row.refusal], ["failed", "stale"]);
    assert.notEqual(job.state, "done");
    assert.ok(job.next_attempt_at >= started && job.next_attempt_at <= Date.now());
    assert.equal(stored(instance, PUBLISHED_TABLES), unchanged);
  });

  it("keeps a replacement fetch job open when the bound job was closed, and fails the task stale", async () => {
    const task = await sentIntake(instance);

    closedJob(instance, task.job.id);
    insertedFetchJob(instance, task.itemId, addressOf(task.statusId));

    const [replacement] = openJobIds(instance, task.itemId);
    const unchanged = stored(instance, PUBLISHED_TABLES);
    const answer = await intakeTo(instance, task, answerOf(task.statusId));

    assert.equal(answer.status, 409);
    assert.deepEqual(openJobIds(instance, task.itemId), [replacement]);
    assert.equal(taskRow(instance, task.id).refusal, "stale");
    assert.equal(stored(instance, PUBLISHED_TABLES), unchanged);
  });

  it("keeps content that was supplied after the task was sent", async () => {
    const task = await sentIntake(instance);

    const supplied = await instance.send("POST", "/api/items", {
      url: addressOf(task.statusId),
      content: suppliedContent(task.statusId),
    });

    assert.ok([200, 201].includes(supplied.status), supplied.body);

    const unchanged = stored(instance, PUBLISHED_TABLES);
    const answer = await intakeTo(instance, task, answerOf(task.statusId));

    assert.equal(answer.status, 409);
    assert.equal(taskRow(instance, task.id).refusal, "timeout");
    assert.equal(stored(instance, PUBLISHED_TABLES), unchanged);
    assert.equal((await instance.detail(task.itemId)).comments.received, 1);
  });

  it("answers 409 after the deadline before any sweep and leaves the task as it was", async () => {
    const task = await sentIntake(instance);

    pastDeadline(instance, task.id);

    const unchanged = stored(instance);
    const answer = await intakeTo(instance, task, answerOf(task.statusId));

    assert.equal(answer.status, 409);
    assert.equal(stored(instance), unchanged);
  });

  it("fails the task at its deadline, so a late answer gets 409 and the Item stays as it was", async () => {
    const task = await sentIntake(instance);

    pastDeadline(instance, task.id);

    await assert.rejects(stepOf(instance, task.job), /did not answer/u);

    const unchanged = stored(instance, PUBLISHED_TABLES);
    const answer = await intakeTo(instance, task, answerOf(task.statusId));

    assert.equal(answer.status, 409);
    assert.equal(taskRow(instance, task.id).refusal, "timeout");
    assert.equal(stored(instance, PUBLISHED_TABLES), unchanged);
  });

  it("settles the Item Link-only with the fetch result status when the bot says the post cannot be read", async () => {
    const task = await sentIntake(instance);
    const answer = await intakeTo(instance, task, { unavailable: true });
    const item = itemRow(instance, task.itemId);
    const row = taskRow(instance, task.id);

    assert.equal(answer.status, 204);
    assert.deepEqual(
      [item.status, item.fetch_result, row.state, jobRow(instance, task.job.id).state],
      ["ready", "status", "done", "done"],
    );
    assert.equal((await intakeTo(instance, task, { unavailable: true })).status, 409);
  });

  it("publishes nothing for an unavailable answer once the content moved on", async () => {
    const task = await sentIntake(instance);

    advancedContent(instance, task.itemId);

    const unchanged = stored(instance, PUBLISHED_TABLES);
    const answer = await intakeTo(instance, task, { unavailable: true });

    assert.equal(answer.status, 409);
    assert.equal(itemRow(instance, task.itemId).fetch_result, null);
    assert.equal(stored(instance, PUBLISHED_TABLES), unchanged);
  });

  it("deletes the task and the job with the Item, so a late answer finds no task", async () => {
    const task = await sentIntake(instance);

    assert.equal((await instance.send("DELETE", `/api/items/${String(task.itemId)}`)).status, 204);
    assert.deepEqual(taskRows(instance, "id = ?", task.id), []);
    assert.equal((await intakeTo(instance, task, answerOf(task.statusId))).status, 401);
  });
});
