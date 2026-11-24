import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { executeClaimed } from "../src/core/compose/jobs.ts";
import { caseOf } from "./bot-kinds-cases.ts";
import { botInstance, jobRow, openJobOf, selectGrokBot, sentTask } from "./bot-kinds-fixtures.ts";
import { digestOfToken, taskRows } from "./bot-task-rows.ts";
import { lockedWriter } from "./locked-writer.ts";
import { count } from "./sqlite-fixtures.ts";

describe("a second overview job for a Topic that has a task at the bot", () => {
  it("waits for the Topic without starting a task when the first job's task is at the bot", async () => {
    const instance = await botInstance();

    try {
      await caseOf("topic_overview").library(instance);
      await selectGrokBot(instance);
      const first = await openJobOf(instance, { kind: "topic_overview", itemId: 101 });
      const second = await openJobOf(instance, { kind: "topic_overview", itemId: 102 });

      await sentTask(instance, first);
      await executeClaimed(instance.core, second);

      assert.equal(
        count(instance, "select count(*) as n from ai_tasks where kind = 'topic_overview'"),
        1,
      );
      assert.equal(jobRow(instance, second.id).wait_reason, "topic-busy");
    } finally {
      await instance.close();
    }
  });

  it("starts no task when the first job started its own between the second job's prepare and its insert", async () => {
    const instance = await botInstance();

    try {
      await caseOf("topic_overview").library(instance);
      await selectGrokBot(instance);
      const second = await openJobOf(instance, { kind: "topic_overview", itemId: 102 });

      const writer = await lockedWriter(instance, [
        `insert into ai_tasks (kind, inputs, input_revision, executor, attempts, deadline, state, callback_hash, context) values ('topic_overview', '{}', 0, 'grok-bot', 1, ${String(Date.now() + 3_600_000)}, 'running', '${digestOfToken("first-job")}', json_object('topicId', (select topic_id from items where id = 102)))`,
      ]);

      await executeClaimed(instance.core, second);
      await writer.committed;

      assert.equal(
        count(instance, "select count(*) as n from ai_tasks where kind = 'topic_overview'"),
        1,
      );
      assert.equal(taskRows(instance, "job_id = ?", second.id).length, 0);
      assert.notEqual(jobRow(instance, second.id).state, "done");
    } finally {
      await instance.close();
    }
  });
});
