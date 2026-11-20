import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TopicPageSchema } from "../src/core/contract/topic-overview-contract.ts";
import { accept, count } from "./accept-fixtures.ts";
import { caseOf } from "./bot-kinds-cases.ts";
import {
  BOT_TASK_KINDS,
  ownerOf,
  startBotTask,
  taskRow,
  answeredAs,
  botInstance,
  openJobOf,
  selectGrokBot,
} from "./bot-kinds-fixtures.ts";
import { settled } from "./bot-kinds-steps.ts";
import { claimedAgain } from "./grok-bot-provider-walk.ts";
import { paste } from "./related-fixtures.ts";
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
      await assert.doesNotReject(settled(instance, "topic_overview", job));

      assert.equal(taskRow(instance, sent.id).refusal, "stale");
      assert.equal(count(instance, "select count(*) as n from topic_pages"), 0);
      const fresh = await claimedAgain(instance, job);
      await answeredAs(instance, { kindCase: overview, job: fresh });
      await settled(instance, "topic_overview", fresh);

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

describe("overview jobs prepared together for one Topic", () => {
  it("starts only one bot task when both jobs prepared before either insert", async () => {
    const instance = await botInstance();

    try {
      await caseOf("topic_overview").library(instance);
      await selectGrokBot(instance);
      const first = await openJobOf(instance, { kind: "topic_overview", itemId: 101 });
      const second = await openJobOf(instance, { kind: "topic_overview", itemId: 102 });
      const one = await BOT_TASK_KINDS.topic_overview.prepare(instance.core, first);
      const two = await BOT_TASK_KINDS.topic_overview.prepare(instance.core, second);

      assert.equal(one.kind, "ask");
      assert.equal(two.kind, "ask");

      if (one.kind !== "ask" || two.kind !== "ask") return;

      const outcomes = await Promise.all([
        startBotTask(instance.core, ownerOf(first), one.start),
        startBotTask(instance.core, ownerOf(second), two.start),
      ]);

      assert.deepEqual(outcomes.map(({ kind }) => kind).toSorted(), ["lease-lost", "started"]);
      assert.equal(
        count(
          instance,
          "select count(*) as n from ai_tasks where kind = 'topic_overview' and state = 'running'",
        ),
        1,
      );
    } finally {
      await instance.close();
    }
  });
});
