import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { applyOutcome } from "../src/core/job-finish.ts";
import { HANDLERS } from "../src/core/job-handlers.ts";
import { caseOf } from "./bot-kinds-cases.ts";
import { answeredAs, botInstance, openJobOf, sentTask } from "./bot-kinds-fixtures.ts";
import { outcomeOf } from "./bot-kinds-steps.ts";
import { retireTasks, selectGrokBot } from "./bot-task-fixtures.ts";
import { insertedTask, jobRow, rowCount, taskRow } from "./bot-task-rows.ts";
import type { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";

const SEND_FAILED = /send failed: unreachable/u;

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
    const outcome = await outcomeOf(instance, "topic_overview", job);

    await applyOutcome(instance.core, job, outcome, HANDLERS[job.kind]);

    const deferred = jobRow(instance, job.id);

    assert.deepEqual(
      [deferred.state, deferred.wait_reason, deferred.attempts],
      ["queued", "grok-bot", 0],
    );
  });

  it("throws when the send fails", async () => {
    const job = await newJob();

    await assert.rejects(outcomeOf(instance, "topic_overview", job), SEND_FAILED);
  });

  it("defers without an attempt when its task is still waiting", async () => {
    const job = await newJob();

    await sentTask(instance, "topic_overview", job);

    await applyOutcome(
      instance.core,
      job,
      await outcomeOf(instance, "topic_overview", job),
      HANDLERS[job.kind],
    );

    const deferred = jobRow(instance, job.id);

    assert.deepEqual(
      [deferred.state, deferred.wait_reason, deferred.attempts],
      ["queued", "grok-bot", 0],
    );
  });

  it("throws when a resend fails", async () => {
    const job = await newJob();
    const sent = await sentTask(instance, "topic_overview", job);

    exec(instance, "update ai_tasks set sent_at = null where id = ?", sent.id);

    await assert.rejects(outcomeOf(instance, "topic_overview", job), SEND_FAILED);
  });

  it("applies the answer and stores one page", async () => {
    const job = await newJob();
    const sent = await answeredAs(instance, { kindCase: overview, job });

    await applyOutcome(
      instance.core,
      job,
      await outcomeOf(instance, "topic_overview", job),
      HANDLERS[job.kind],
    );

    assert.equal(taskRow(instance, sent.id).state, "done");
    assert.equal(rowCount(instance, "topic_pages", "topic_id = 1"), 1);
  });

  it("starts no task when the job lost its claim", async () => {
    const job = await newJob();

    exec(instance, "update jobs set attempts = attempts + 1 where id = ?", job.id);

    await applyOutcome(
      instance.core,
      job,
      await outcomeOf(instance, "topic_overview", job),
      HANDLERS[job.kind],
    );

    assert.equal(rowCount(instance, "ai_tasks", `job_id = ${String(job.id)}`), 0);
  });

  it("fails the task stale, without an error, when the Topic was deleted while the bot worked", async () => {
    const job = await newJob();
    const sent = await answeredAs(instance, { kindCase: overview, job });

    exec(instance, "update items set topic_id = null where topic_id = 1");
    exec(instance, "delete from log_entries where topic_id = 1");
    exec(instance, "delete from topics where id = 1");

    await applyOutcome(
      instance.core,
      job,
      await outcomeOf(instance, "topic_overview", job),
      HANDLERS[job.kind],
    );

    const task = taskRow(instance, sent.id);

    assert.deepEqual(
      [task.state, task.refusal, jobRow(instance, job.id).attempts],
      ["failed", "stale", 0],
    );
  });
});
