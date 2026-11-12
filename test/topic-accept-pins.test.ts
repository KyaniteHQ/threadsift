import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { TopicPageSchema } from "../src/core/topic-overview-contract.ts";
import { accept, count } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { dump } from "./pin-fixtures.ts";
import { exec, paste, rows } from "./related-fixtures.ts";
import { itemsOf, proposeTopics, topicId } from "./topic-accept-fixtures.ts";

const NamesSchema = z.object({ topic: z.string(), json: z.string() });

const JsonTopicSchema = z.object({ topic: z.string() });

describe("the Topic Pin an Accept records keeps a merged Topic merged and follows a chain", () => {
  let instance: Instance;
  let alpha = 0;
  let beta = 0;
  let gamma = 0;
  let first = 0;
  let second = 0;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await paste(instance, "a", { title: "A", topic: "Alpha" });
    await paste(instance, "b", { title: "B", topic: "Beta" });
    await paste(instance, "c", { title: "C", topic: "Gamma" });
    alpha = topicId(instance, "Alpha");
    beta = topicId(instance, "Beta");
    gamma = topicId(instance, "Gamma");
    first = proposeTopics(instance, ["Alpha", "Beta"]);
    second = proposeTopics(instance, ["Beta", "Gamma"]);
  });

  after(() => instance.close());

  it("links a caller-sent Digest that names the merged-away Topic in another spelling to the survivor and creates no Topic", async () => {
    assert.equal((await accept(instance, first)).status, 200);

    const id = await paste(instance, "later", { title: "Later", topic: "ALPHA" });

    assert.equal(
      count(instance, "select count(*) as n from items where id = ? and topic_id = ?", id, beta),
      1,
    );
    assert.equal(count(instance, "select count(*) as n from topics where key = 'alpha'"), 0);
    assert.deepEqual(
      rows(
        instance,
        NamesSchema,
        "select topic, digest as json from digests where item_id = ?",
        id,
      ).map(({ topic, json }) => [topic, JsonTopicSchema.parse(JSON.parse(json)).topic]),
      [["Beta", "Beta"]],
    );
  });

  it("repoints the Pin when its target is merged away, so a chain of two accepts leaves no dangling Pin", async () => {
    assert.equal((await accept(instance, second)).status, 200);
    assert.equal(
      dump(instance, "select kind, from_key, into_topic_id from pins order by id"),
      JSON.stringify([
        { kind: "topic-merge", from_key: "alpha", into_topic_id: gamma },
        { kind: "topic-merge", from_key: "beta", into_topic_id: gamma },
      ]),
    );
    assert.equal(
      count(
        instance,
        "select count(*) as n from pins where into_topic_id not in (select id from topics)",
      ),
      0,
    );
    assert.equal(itemsOf(instance, gamma), 4);
    assert.equal(
      count(instance, "select count(*) as n from topics where id in (?, ?)", alpha, beta),
      0,
    );
  });

  it("links the Digest that names the first merged-away Topic to the last survivor", async () => {
    const id = await paste(instance, "again", { title: "Again", topic: "alpha" });

    assert.equal(
      count(instance, "select count(*) as n from items where id = ? and topic_id = ?", id, gamma),
      1,
    );
  });

  it("changes no Pin and no row when an Item is deleted", async () => {
    const digestsBefore = dump(instance, "select * from pins order by id");

    assert.equal((await instance.send("DELETE", "/api/items/1")).status, 204);
    assert.equal(dump(instance, "select * from pins order by id"), digestsBefore);
  });
});

describe("a Pin that already holds the merged-away key follows the Accept", () => {
  it("points the Pin at the survivor, so the old address and a later Digest reach the survivor", async () => {
    const instance = await Instance.start();

    try {
      await instance.setUp();
      await paste(instance, "a", { title: "A", topic: "Alpha" });
      await paste(instance, "b", { title: "B", topic: "Beta" });
      await paste(instance, "c", { title: "C", topic: "Gamma" });

      const beta = topicId(instance, "Beta");

      exec(
        instance,
        "insert into pins (kind, from_key, from_name, into_topic_id, created_at) values ('topic-merge', 'alpha', 'Alpha', ?, 0)",
        topicId(instance, "Gamma"),
      );

      assert.equal(
        (await accept(instance, proposeTopics(instance, ["Alpha", "Beta"]))).status,
        200,
      );
      assert.equal(
        dump(instance, "select from_key, into_topic_id from pins"),
        JSON.stringify([{ from_key: "alpha", into_topic_id: beta }]),
      );
      assert.equal(
        (await instance.read("GET", "/api/topics/alpha", TopicPageSchema)).topic.name,
        "Beta",
      );

      const later = await paste(instance, "later", { title: "Later", topic: "ALPHA" });

      assert.equal(
        count(
          instance,
          "select count(*) as n from items where id = ? and topic_id = ?",
          later,
          beta,
        ),
        1,
      );
    } finally {
      await instance.close();
    }
  });
});
