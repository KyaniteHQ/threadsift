import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { executeClaimed } from "../src/core/compose/jobs.ts";
import { TopicPageSchema } from "../src/core/contract/topic-overview-contract.ts";
import { accept } from "./accept-fixtures.ts";
import { caseOf } from "./bot-kinds-cases.ts";
import { answeredAs, botInstance, jobRow, openJobOf, taskRow } from "./bot-kinds-fixtures.ts";
import { claimedAgain } from "./grok-bot-provider-walk.ts";
import { paste } from "./related-fixtures.ts";
import { count } from "./sqlite-fixtures.ts";
import { proposeTopics } from "./topic-accept-fixtures.ts";

describe("Accept while the merged-away Topic has an overview answer in flight", () => {
  it("refuses the stale overview store and publishes one overview for the merged Topic", async () => {
    const instance = await botInstance();

    try {
      const overview = caseOf("topic_overview");
      await overview.library(instance);
      await paste(instance, "beta", { title: "Beta", topic: "Beta" });

      const job = await openJobOf(instance, {
        kind: "topic_overview",
        itemId: 101,
        staleRequeues: 2,
      });

      const sent = await answeredAs(instance, { kindCase: overview, job });

      assert.equal(taskRow(instance, sent.id).state, "running");
      assert.equal(
        (await accept(instance, proposeTopics(instance, ["Alpha", "Beta"]))).status,
        200,
      );
      await executeClaimed(instance.core, sent.job);

      assert.equal(taskRow(instance, sent.id).refusal, "stale");
      assert.equal(jobRow(instance, job.id).attempts, 0);
      assert.equal(count(instance, "select count(*) as n from topic_pages"), 0);
      const fresh = await claimedAgain(instance, job);
      const answeredFresh = await answeredAs(instance, { kindCase: overview, job: fresh });
      await executeClaimed(instance.core, answeredFresh.job);

      const page = await instance.read("GET", "/api/topics/beta", TopicPageSchema);
      assert.equal(page.topic.name, "Beta");
      assert.equal(page.items.length, 3);
      assert.equal(count(instance, "select count(*) as n from topic_pages"), 1);
      assert.equal(
        count(instance, "select count(*) as n from log_entries where action = 'overview'"),
        1,
      );
      assert.equal(count(instance, "select count(*) as n from topics where name = 'Alpha'"), 0);
    } finally {
      await instance.close();
    }
  });
});
