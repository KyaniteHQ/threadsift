import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { applyOutcome } from "../src/core/job-finish.ts";
import { caseOf } from "./bot-kinds-cases.ts";
import {
  answeredAs,
  botInstance,
  claimedAndReleased,
  holdTopic,
  leasesRunOut,
  openJobOf,
  sentTask,
} from "./bot-kinds-fixtures.ts";
import { outcomeOf } from "./bot-kinds-steps.ts";
import { pastDeadline, retireTasks } from "./bot-task-fixtures.ts";
import { insertedTask, jobRow, rowCount, taskRow, topicLeaseFree } from "./bot-task-rows.ts";
import type { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";

const SEND_FAILED = /send failed: unreachable/u;

const FILL = 10;

const overview = caseOf("topic_overview");

describe("a Topic overview holds the Topic's lease for the read and the send only", () => {
  let instance: Instance;

  const newJob = () => openJobOf(instance, { kind: "topic_overview", itemId: 101 });

  before(async () => {
    instance = await botInstance();
    await overview.library(instance);
  });

  beforeEach(() => {
    retireTasks(instance);
    exec(instance, "update topic_leases set expires_at = 0");
    exec(instance, "delete from topic_pages");
  });

  after(() => instance.close());

  it("frees the lease in the same batch that records the deferral when the cap is full", async () => {
    for (const index of Array.from({ length: FILL }, (_, position) => position)) {
      insertedTask(instance, {
        kind: "related_pick",
        executor: "grok-bot",
        token: `fill-${String(index)}`,
      });
    }

    const job = await newJob();
    const outcome = await outcomeOf(instance, "topic_overview", job);

    assert.equal(topicLeaseFree(instance, 1), false);

    await applyOutcome(instance.core, job, outcome);

    const deferred = jobRow(instance, job.id);

    assert.equal(topicLeaseFree(instance, 1), true);
    assert.deepEqual(
      [deferred.state, deferred.wait_reason, deferred.attempts],
      ["queued", "grok-bot", 0],
    );
  });

  it("frees the lease when the send fails and the step throws", async () => {
    const job = await newJob();

    await assert.rejects(outcomeOf(instance, "topic_overview", job), SEND_FAILED);

    assert.equal(topicLeaseFree(instance, 1), true);
  });

  it("frees a lease an earlier attempt left held when the job finds its task still waiting", async () => {
    const job = await newJob();

    await sentTask(instance, "topic_overview", job);

    assert.equal(topicLeaseFree(instance, 1), false);

    await applyOutcome(instance.core, job, await outcomeOf(instance, "topic_overview", job));

    const deferred = jobRow(instance, job.id);

    assert.equal(topicLeaseFree(instance, 1), true);
    assert.deepEqual(
      [deferred.state, deferred.wait_reason, deferred.attempts],
      ["queued", "grok-bot", 0],
    );
  });

  it("frees a lease an earlier attempt left held when the resend fails", async () => {
    const job = await newJob();
    const sent = await sentTask(instance, "topic_overview", job);

    exec(instance, "update ai_tasks set sent_at = null where id = ?", sent.id);

    await assert.rejects(outcomeOf(instance, "topic_overview", job), SEND_FAILED);

    assert.equal(topicLeaseFree(instance, 1), true);
  });

  it("leaves the Topic to another claimer while the bot works, and takes the lease again to apply", async () => {
    const job = await newJob();
    const sent = await answeredAs(instance, { kindCase: overview, job });

    leasesRunOut(instance);

    await claimedAndReleased(instance, 1, "overview:another");

    await applyOutcome(instance.core, job, await outcomeOf(instance, "topic_overview", job));

    assert.equal(taskRow(instance, sent.id).state, "done");
    assert.equal(topicLeaseFree(instance, 1), true);
    assert.equal(rowCount(instance, "topic_pages", "topic_id = 1"), 1);
  });

  it("defers topic-busy without an attempt while another holder has the lease, and keeps the answered task past its deadline", async () => {
    const job = await newJob();
    const sent = await answeredAs(instance, { kindCase: overview, job });

    leasesRunOut(instance);
    await holdTopic(instance, 1, "overview:foreign");

    await applyOutcome(instance.core, job, await outcomeOf(instance, "topic_overview", job));

    const deferred = jobRow(instance, job.id);

    assert.deepEqual(
      [deferred.state, deferred.wait_reason, deferred.attempts],
      ["queued", "topic-busy", 0],
    );

    pastDeadline(instance, sent.id);
    exec(instance, "delete from scheduled_runs where task = 'sweep'");
    await instance.tick();

    const task = taskRow(instance, sent.id);

    assert.deepEqual([task.state, task.answered_at === null], ["running", false]);
  });

  it("frees the lease when the job lost its claim before the task could start", async () => {
    const job = await newJob();

    exec(instance, "update jobs set attempts = attempts + 1 where id = ?", job.id);

    await applyOutcome(instance.core, job, await outcomeOf(instance, "topic_overview", job));

    assert.equal(topicLeaseFree(instance, 1), true);
    assert.equal(rowCount(instance, "ai_tasks", `job_id = ${String(job.id)}`), 0);
  });

  it("fails the task stale, without an error, when the Topic was deleted while the bot worked", async () => {
    const job = await newJob();
    const sent = await answeredAs(instance, { kindCase: overview, job });

    exec(instance, "update items set topic_id = null where topic_id = 1");
    exec(instance, "delete from log_entries where topic_id = 1");
    exec(instance, "delete from topic_leases where topic_id = 1");
    exec(instance, "delete from topics where id = 1");

    await applyOutcome(instance.core, job, await outcomeOf(instance, "topic_overview", job));

    const task = taskRow(instance, sent.id);

    assert.deepEqual(
      [task.state, task.refusal, jobRow(instance, job.id).attempts],
      ["failed", "stale", 0],
    );
  });
});
