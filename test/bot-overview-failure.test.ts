import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { exhaust } from "../src/core/job-finish.ts";
import { topicOverviewHandler } from "../src/core/topic-overview-job.ts";
import { caseOf } from "./bot-kinds-cases.ts";
import { botInstance, holdTopic, leasesRunOut, openJobOf, sentTask } from "./bot-kinds-fixtures.ts";
import { insertedTask, taskRow, topicFailures } from "./bot-task-rows.ts";
import { seedTopics } from "./disagreement-fixtures.ts";
import type { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";

const THIRD_SEND = 2;

describe("a Topic overview that gave up after the third unanswered send marks the Topic it asked about", () => {
  let instance: Instance;

  before(async () => {
    instance = await botInstance();
    await caseOf("topic_overview").library(instance);
    seedTopics(instance, { 2: "Beta" });
  });

  after(() => instance.close());

  it("writes the marker by the Topic id of the task while another holder owns the released lease and the owner Item sits in another Topic", async () => {
    const job = await openJobOf(instance, {
      kind: "topic_overview",
      itemId: 101,
      attempts: THIRD_SEND,
    });

    const earlier = insertedTask(instance, {
      kind: "topic_overview",
      executor: "grok-bot",
      token: "earlier",
    });

    exec(
      instance,
      "update ai_tasks set job_id = ?, state = 'failed', refusal = 'stale', context = '{\"topicId\":2,\"revision\":0}' where id = ?",
      job.id,
      earlier,
    );

    const sent = await sentTask(instance, "topic_overview", job);
    leasesRunOut(instance);
    await holdTopic(instance, 1, "overview:foreign");
    exec(instance, "update items set topic_id = 2 where id = 101");

    await exhaust(instance.core, job, topicOverviewHandler, THIRD_SEND + 1);

    assert.deepEqual(topicFailures(instance), [{ topic_id: 1, failure: "gave-up" }]);
    assert.equal(taskRow(instance, sent.id).state, "failed");
  });

  it("still marks the Topic of the owner Item when the job never sent a bot task", async () => {
    exec(instance, "delete from topic_pages");

    const job = await openJobOf(instance, {
      kind: "topic_overview",
      itemId: 102,
      attempts: THIRD_SEND,
    });

    await exhaust(instance.core, job, topicOverviewHandler, THIRD_SEND + 1);

    assert.deepEqual(topicFailures(instance), [{ topic_id: 1, failure: "gave-up" }]);
  });

  it("leaves a page that a newer overview stored since the task was sent unmarked", async () => {
    leasesRunOut(instance);
    exec(instance, "delete from topic_pages");
    exec(instance, "update items set topic_id = 1 where id = 101");

    const job = await openJobOf(instance, {
      kind: "topic_overview",
      itemId: 101,
      attempts: THIRD_SEND,
    });

    await sentTask(instance, "topic_overview", job);
    exec(
      instance,
      "insert into topic_pages (topic_id, overview, revision, built_from, updated_at) values (1, 'Newer text', 3, '[]', 1)",
    );

    await exhaust(instance.core, job, topicOverviewHandler, THIRD_SEND + 1);

    assert.deepEqual(topicFailures(instance), [{ topic_id: 1, failure: null }]);
  });
});
