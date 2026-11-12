import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import {
  OverviewRetryResponseSchema,
  TopicPageSchema,
} from "../src/core/topic-overview-contract.ts";
import { accept, count } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { SECRET_KEY, exec, paste, rows, saveProvider } from "./related-fixtures.ts";
import { proposeTopics, topicId } from "./topic-accept-fixtures.ts";

const OwnerSchema = z.object({ item_id: z.number() });

describe("the address of a merged-away Topic opens the Topic it was merged into", () => {
  let instance: Instance;
  let gamma = 0;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await paste(instance, "a", { title: "A", topic: "ML" });
    await paste(instance, "b", { title: "B", topic: "Machine learning" });
    await paste(instance, "c", { title: "C", topic: "Artificial intelligence" });
    gamma = topicId(instance, "Artificial intelligence");
    assert.equal(
      (await accept(instance, proposeTopics(instance, ["ML", "Machine learning"]))).status,
      200,
    );
  });

  after(() => instance.close());

  it("answers the survivor's page with the survivor's key for the old key in any spelling", async () => {
    const pages = await Promise.all(
      ["ml", "ML", "Ml"].map((spelling) =>
        instance.read("GET", `/api/topics/${spelling}`, TopicPageSchema),
      ),
    );

    assert.deepEqual(
      pages.map((page) => [page.topic.key, page.topic.name, page.items.length]),
      Array.from({ length: 3 }, () => ["machine learning", "Machine learning", 2]),
    );
  });

  it("answers 404 on both routes for a key that no Topic and no Pin has", async () => {
    assert.equal((await instance.send("GET", "/api/topics/nothing")).status, 404);
    assert.equal((await instance.send("POST", "/api/topics/nothing/overview")).status, 404);
  });

  it("lets a Topic that has the key win over a Pin for the same key", async () => {
    exec(instance, "insert into topics (key, name) values ('ml', 'ML again')");

    const page = await instance.read("GET", "/api/topics/ml", TopicPageSchema);

    assert.deepEqual([page.topic.key, page.topic.name], ["ml", "ML again"]);
    exec(instance, "delete from topics where key = 'ml'");
  });

  it("resolves a chain of merges from the first merged-away key to the last survivor", async () => {
    assert.equal(
      (
        await accept(
          instance,
          proposeTopics(instance, ["Machine learning", "Artificial intelligence"]),
        )
      ).status,
      200,
    );

    const page = await instance.read("GET", "/api/topics/ml", TopicPageSchema);

    assert.deepEqual([page.topic.key, page.items.length], ["artificial intelligence", 3]);
  });

  it("runs Try again on the survivor for the old key", async () => {
    await saveProvider(instance);

    const answer = await instance.send("POST", "/api/topics/ml/overview");

    assert.equal(answer.status, 202);
    assert.equal(
      OverviewRetryResponseSchema.parse(JSON.parse(answer.body)).overview.provider,
      true,
    );
    assert.equal(
      rows(
        instance,
        OwnerSchema,
        "select jobs.item_id from jobs join items on items.id = jobs.item_id where jobs.kind = 'topic_overview' and items.topic_id = ?",
        gamma,
      ).length > 0,
      true,
    );
    assert.equal(count(instance, "select count(*) as n from topics where key = 'ml'"), 0);
  });
});
