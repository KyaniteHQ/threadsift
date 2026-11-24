import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { accept, propose } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { pasteTopics } from "./overview-gap-fixtures.ts";
import { dump } from "./pin-fixtures.ts";
import { paste, catalogVersion, count, exec, rows } from "./related-fixtures.ts";
import {
  answerOf,
  itemsOf,
  proposeTopics,
  removeProposals,
  topicId,
  topicMergeLines,
} from "./topic-accept-fixtures.ts";

const PinSchema = z.object({
  from_key: z.string(),
  from_name: z.string(),
  into_topic_id: z.number(),
});

const DigestSchema = z.object({ topic: z.string(), json: z.string() });

const JsonTopicSchema = z.object({ topic: z.string() });

const byNumber = (first: number, second: number): number => first - second;

const ItemIdsSchema = z.object({ items: z.array(z.object({ id: z.number() })) });

const itemsWithTopic = async (instance: Instance, name: string) =>
  (
    await instance.read("GET", `/api/items?topic=${encodeURIComponent(name)}`, ItemIdsSchema)
  ).items.map(({ id }) => id);

describe("only one Topic or Tag merge can run at a time", () => {
  it("refuses a Topic Accept while a Tag merge runs and a Tag Accept while a Topic merge runs", async () => {
    const instance = await Instance.start();

    try {
      await instance.setUp();
      await paste(instance, "alpha", { title: "Alpha", topic: "Alpha", tags: ["Alpha", "Gamma"] });
      await pasteTopics(instance, { Beta: ["beta"], Gamma: ["gamma"] });
      propose(instance, ["Alpha", "Gamma"], "accepting");
      const topic = proposeTopics(instance, ["Alpha", "Gamma"]);

      assert.deepEqual(await answerOf(instance, topic), [409, { error: "merge-busy" }]);
      removeProposals(instance);
      proposeTopics(instance, ["Alpha", "Beta"], "accepting");
      const tag = propose(instance, ["Alpha", "Gamma"]);

      assert.deepEqual(await answerOf(instance, tag), [409, { error: "merge-busy" }]);
    } finally {
      await instance.close();
    }
  });
});

describe("Accept of a Topic row moves everything the Topic owns in one batch", () => {
  let instance: Instance;
  let ids: readonly number[];
  let loser = 0;
  let survivor = 0;
  let versionBefore = 0;
  let linkedLogCount = 0;
  let decision: Awaited<ReturnType<typeof accept>>;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    ids = [
      await paste(instance, "one", { title: "One", topic: "ML", tags: ["ml"] }),
      await paste(instance, "two", { title: "Two", topic: "ML", tags: ["ml"] }),
      await paste(instance, "three", { title: "Three", topic: "Machine learning" }),
      await paste(instance, "four", { title: "Four", topic: "Games" }),
    ];
    loser = topicId(instance, "ML");
    survivor = topicId(instance, "Machine learning");
    exec(instance, "update digests set digest = 'not json' where item_id = ?", ids[1] ?? 0);
    proposeTopics(instance, ["ML", "Games"], "open", "Other.");
    proposeTopics(instance, ["Machine learning", "Games"], "open", "Kept.");
    exec(
      instance,
      "insert into topic_pages (topic_id, overview, revision, built_from, updated_at) values (?, 'About ML.', 1, '[]', 1)",
      loser,
    );
    versionBefore = catalogVersion(instance);
    linkedLogCount = count(
      instance,
      "select count(*) as n from log_entries where topic_id in (?, ?)",
      loser,
      survivor,
    );
    decision = await accept(instance, proposeTopics(instance, ["ML", "Machine learning"]));
  });

  after(() => instance.close());

  it("answers 200 done for the accepted merge", () => {
    assert.deepEqual([decision.status, JSON.parse(decision.body)], [200, { state: "done" }]);
  });

  it("links every Item to the survivor and finds them by its name and none by the merged-away name", async () => {
    assert.equal(itemsOf(instance, survivor), 3);
    assert.equal(itemsOf(instance, loser), 0);
    assert.deepEqual(
      [...(await itemsWithTopic(instance, "Machine learning"))].toSorted(byNumber),
      ids.slice(0, 3).toSorted(byNumber),
    );
    assert.deepEqual(await itemsWithTopic(instance, "ML"), []);
  });

  it("writes the survivor's name into digests.topic and the Digest JSON read from digests, and keeps the text of one that is not JSON", () => {
    assert.deepEqual(
      rows(
        instance,
        DigestSchema,
        "select topic, digest as json from digests where item_id in (?, ?) order by item_id",
        ids[0] ?? 0,
        ids[1] ?? 0,
      ).map(({ topic, json }) => [
        topic,
        json.startsWith("{") ? JsonTopicSchema.parse(JSON.parse(json)).topic : json,
      ]),
      [
        ["Machine learning", "Machine learning"],
        ["Machine learning", "not json"],
      ],
    );
    assert.equal(count(instance, "select count(*) as n from digests where topic = 'ML'"), 0);
  });

  it("moves the Log lines that named the merged-away Topic and removes the Topic and its page", () => {
    assert.equal(
      count(
        instance,
        "select count(*) as n from log_entries where topic = 'ML' and topic_id is null",
      ),
      0,
    );
    assert.equal(
      count(instance, "select count(*) as n from log_entries where topic_id = ?", survivor),
      linkedLogCount,
    );
    assert.equal(count(instance, "select count(*) as n from topics where id = ?", loser), 0);
    assert.equal(
      count(instance, "select count(*) as n from topic_pages where topic_id = ?", loser),
      0,
    );
  });

  it("records the Pin, moves catalog_version by one and writes one merge-topic Log entry with the count", async () => {
    assert.deepEqual(
      rows(instance, PinSchema, "select from_key, from_name, into_topic_id from pins"),
      [{ from_key: "ml", from_name: "ML", into_topic_id: survivor }],
    );
    assert.equal(catalogVersion(instance), versionBefore + 1);
    assert.deepEqual(await topicMergeLines(instance), ["ML into Machine learning | 2 Items"]);
  });

  it("removes every other row that named the merged-away Topic and keeps the rest", () => {
    assert.deepEqual(
      rows(
        instance,
        z.object({ reason: z.string() }),
        "select reason from proposals order by id",
      ).map(({ reason }) => reason),
      ["Kept."],
    );
  });
});

describe("the Topic Pin an Accept records keeps a merged Topic merged and follows a chain", () => {
  let instance: Instance;
  let original: number | undefined;
  let alpha = 0;
  let beta = 0;
  let gamma = 0;
  let later = 0;
  let second = 0;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    const library = await pasteTopics(instance, {
      Alpha: ["alpha"],
      Beta: ["beta"],
      Gamma: ["gamma"],
    });
    original = library["Alpha"]?.[0];
    alpha = topicId(instance, "Alpha");
    beta = topicId(instance, "Beta");
    gamma = topicId(instance, "Gamma");
    const first = proposeTopics(instance, ["Alpha", "Beta"]);
    second = proposeTopics(instance, ["Beta", "Gamma"]);
    assert.equal((await accept(instance, first)).status, 200);
    later = await paste(instance, "later", { title: "Later", topic: "ALPHA" });
  });

  after(() => instance.close());

  it("links a caller-sent Digest that names the merged-away Topic in another spelling to the survivor and creates no Topic", () => {
    assert.equal(
      count(instance, "select count(*) as n from items where id = ? and topic_id = ?", later, beta),
      1,
    );
    assert.equal(count(instance, "select count(*) as n from topics where key = 'alpha'"), 0);
    assert.deepEqual(
      rows(
        instance,
        DigestSchema,
        "select topic, digest as json from digests where item_id = ?",
        later,
      ).map(({ topic, json }) => [topic, JsonTopicSchema.parse(JSON.parse(json)).topic]),
      [["Beta", "Beta"]],
    );
  });

  describe("after the second Accept", () => {
    before(async () => {
      assert.equal((await accept(instance, second)).status, 200);
    });

    it("repoints the Pin when its target is merged away, so a chain of two accepts leaves no dangling Pin", () => {
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

    it("keeps every Topic Pin when an Item is deleted", async () => {
      assert.ok(original !== undefined);
      assert.deepEqual(
        rows(
          instance,
          PinSchema,
          "select from_key, from_name, into_topic_id from pins order by id",
        ),
        [
          { from_key: "alpha", from_name: "Alpha", into_topic_id: gamma },
          { from_key: "beta", from_name: "Beta", into_topic_id: gamma },
        ],
      );
      const pinsBefore = dump(instance, "select * from pins order by id");

      assert.equal((await instance.send("DELETE", `/api/items/${String(original)}`)).status, 204);
      assert.equal(dump(instance, "select * from pins order by id"), pinsBefore);
    });
  });
});
