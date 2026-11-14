import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { caseOf } from "./bot-kinds-cases.ts";
import {
  answeredAs,
  botInstance,
  leasesRunOut,
  openJobOf,
  sentTask,
} from "./bot-kinds-fixtures.ts";
import { settled } from "./bot-kinds-steps.ts";
import { pastDeadline, retireTasks } from "./bot-task-fixtures.ts";
import { reclaimed } from "./bot-task-lifecycle.ts";
import { jobRow, rowCount, taskRow, topicLeaseFree } from "./bot-task-rows.ts";
import type { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";

const SEND_FAILED = /send failed: unreachable/u;

const overview = caseOf("topic_overview");

describe("one Topic overview is at the bot at a time", () => {
  let instance: Instance;

  const jobOf = (itemId: number) => openJobOf(instance, { kind: "topic_overview", itemId });

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

  it("defers topic-busy with no send and no attempt while another job's task for the Topic waits for an answer", async () => {
    const first = await jobOf(101);

    await sentTask(instance, "topic_overview", first);
    leasesRunOut(instance);

    const second = await jobOf(102);

    await settled(instance, "topic_overview", second);

    const deferred = jobRow(instance, second.id);

    assert.deepEqual(
      [deferred.state, deferred.wait_reason, deferred.attempts],
      ["queued", "topic-busy", 0],
    );
    assert.equal(rowCount(instance, "ai_tasks", `job_id = ${String(second.id)}`), 0);
    assert.equal(topicLeaseFree(instance, 1), true);
  });

  it("closes the waiting job with no send once the answer is applied and no Item is left out", async () => {
    const first = await jobOf(101);
    const sent = await answeredAs(instance, { kindCase: overview, job: first });

    leasesRunOut(instance);

    const second = await jobOf(102);

    await settled(instance, "topic_overview", second);

    assert.equal(jobRow(instance, second.id).wait_reason, "topic-busy");

    await settled(instance, "topic_overview", first);

    assert.equal(taskRow(instance, sent.id).state, "done");

    reclaimed(instance, second);

    await settled(instance, "topic_overview", second);

    assert.equal(jobRow(instance, second.id).state, "done");
    assert.equal(rowCount(instance, "ai_tasks", `job_id = ${String(second.id)}`), 0);
  });

  it("sends once the earlier task passed its deadline unanswered", async () => {
    const first = await jobOf(101);
    const sent = await sentTask(instance, "topic_overview", first);

    pastDeadline(instance, sent.id);
    leasesRunOut(instance);

    const second = await jobOf(102);

    await assert.rejects(settled(instance, "topic_overview", second), SEND_FAILED);

    assert.equal(rowCount(instance, "ai_tasks", `job_id = ${String(second.id)}`), 1);
  });
});
