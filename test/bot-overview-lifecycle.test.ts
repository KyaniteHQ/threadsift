import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { executeClaimed } from "../src/core/compose/jobs.ts";
import { caseOf } from "./bot-kinds-cases.ts";
import { answeredAs, botInstance, openJobOf, sentTask } from "./bot-kinds-fixtures.ts";
import { retireTasks, selectGrokBot } from "./bot-task-fixtures.ts";
import { insertedTask, jobRow, rowCount, taskRow } from "./bot-task-rows.ts";
import type { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";

const FILL = 10;

const overview = caseOf("topic_overview");

describe("a Topic overview keeps its task and job state across retries", () => {
  let instance: Instance;

  const newJob = () => openJobOf(instance, { kind: "topic_overview", itemId: 101 });

  before(async () => {
    instance = await botInstance();
    await overview.library(instance);
    await selectGrokBot(instance);
  });

  beforeEach(() => {
    retireTasks(instance);
    exec(instance, "delete from topic_pages");
  });

  after(() => instance.close());

  it("defers without an attempt when the bot cap is full", async () => {
    for (const index of Array.from({ length: FILL }, (_, position) => position)) {
      insertedTask(instance, {
        kind: "related_pick",
        executor: "grok-bot",
        token: `fill-${String(index)}`,
      });
    }

    const job = await newJob();

    await executeClaimed(instance.core, job);

    const deferred = jobRow(instance, job.id);

    assert.deepEqual(
      [deferred.state, deferred.wait_reason, deferred.attempts],
      ["queued", "grok-bot", 0],
    );
  });

  it("defers without an attempt when its task is still waiting", async () => {
    const { job } = await sentTask(instance, await newJob());

    await executeClaimed(instance.core, job);

    const deferred = jobRow(instance, job.id);

    assert.deepEqual(
      [deferred.state, deferred.wait_reason, deferred.attempts],
      ["queued", "grok-bot", 0],
    );
  });

  it("fails the task and charges an attempt when a resend fails", async () => {
    const { id, job } = await sentTask(instance, await newJob());

    exec(instance, "update ai_tasks set sent_at = null where id = ?", id);
    await executeClaimed(instance.core, job);

    const failed = jobRow(instance, job.id);

    assert.deepEqual(
      [taskRow(instance, id).state, taskRow(instance, id).refusal],
      ["failed", "unreachable"],
    );
    assert.deepEqual([failed.state, failed.attempts], ["queued", 1]);
  });

  it("starts no task when the job lost its claim", async () => {
    const job = await newJob();

    exec(instance, "update jobs set attempts = attempts + 1 where id = ?", job.id);

    await executeClaimed(instance.core, job);

    assert.equal(rowCount(instance, "ai_tasks", `job_id = ${String(job.id)}`), 0);
  });

  it("fails the task stale, without an error, when the Topic was deleted while the bot worked", async () => {
    const sent = await answeredAs(instance, { kindCase: overview, job: await newJob() });

    exec(instance, "update items set topic_id = null where topic_id = 1");
    exec(instance, "delete from log_entries where topic_id = 1");
    exec(instance, "delete from topics where id = 1");

    await executeClaimed(instance.core, sent.job);

    const task = taskRow(instance, sent.id);

    assert.deepEqual(
      [task.state, task.refusal, jobRow(instance, sent.job.id).attempts],
      ["failed", "stale", 0],
    );
  });
});
