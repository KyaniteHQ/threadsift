import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { count } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { lines } from "./log-fixtures.ts";
import { dump, holdSweep, item, rerunSteps, script } from "./pin-fixtures.ts";
import { exec, paste, rows, until } from "./related-fixtures.ts";

const TARGET = "Machine Learning";

const StoredSchema = z.object({ topic: z.string(), json_topic: z.string().nullable() });

const stored = (instance: Instance, itemId: number) =>
  rows(
    instance,
    StoredSchema,
    "select topic, json_extract(digest, '$.topic') as json_topic from digests where item_id = ?",
    itemId,
  )[0];

const linkedTopic = (instance: Instance, itemId: number): string | undefined =>
  rows(
    instance,
    z.object({ name: z.string() }),
    "select topics.name as name from items join topics on topics.id = items.topic_id where items.id = ?",
    itemId,
  )[0]?.name;

const seedPin = (instance: Instance): number => {
  const [target] = rows(
    instance,
    z.object({ id: z.number() }),
    "select id from topics where name = ?",
    TARGET,
  );

  assert.ok(target);
  exec(
    instance,
    "insert into pins (kind, from_key, from_name, into_topic_id, created_at) values ('topic-merge', 'ml', 'ML', ?, 1)",
    target.id,
  );

  return target.id;
};

describe("a Topic Pin steers every path that turns a Digest's names into links", () => {
  let instance: Instance;
  let target: number;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await paste(instance, "target", { title: "Target", topic: TARGET, tags: ["ai"] });
    target = seedPin(instance);
  });

  after(() => instance.close());

  it("links a caller-sent Digest that names the merged-away Topic in another spelling to the target, stores the target's name and logs it", async () => {
    const id = await paste(instance, "caller", { title: "Caller", topic: "ML", tags: ["ai"] });

    assert.equal(linkedTopic(instance, id), TARGET);
    assert.deepEqual(stored(instance, id), { topic: TARGET, json_topic: TARGET });
    assert.equal(count(instance, "select count(*) as n from topics where key = 'ml'"), 0);
    assert.equal(count(instance, "select count(*) as n from topics"), 1);
    assert.ok((await lines(instance)).includes(`ingest | Caller | topic: ${TARGET} | tags: ai`));
    assert.equal(
      count(
        instance,
        "select count(*) as n from log_entries where topic_id = ? and action = 'ingest' and item_id = ?",
        target,
        id,
      ),
      1,
    );
  });

  it("keeps the names the model returned in the AI task", () => {
    const [{ topic } = { topic: "" }] = rows(
      instance,
      z.object({ topic: z.string() }),
      "select json_extract(result, '$.topic') as topic from ai_tasks where kind = 'digest' and json_extract(result, '$.title') = 'Caller'",
    );

    assert.equal(topic, "ML");
  });

  it("links the Digest that items.pending_digest holds to the target", async () => {
    const id = await paste(instance, "pending", { title: "Pending", noDigest: true });

    exec(
      instance,
      "update items set pending_digest = ? where id = ?",
      JSON.stringify({
        title: "Pending",
        topic: "ml",
        tags: [],
        summary: "S",
        keyPoints: ["K"],
      }),
      id,
    );
    exec(
      instance,
      "insert into jobs (kind, item_id, address, state, attempts, stale_requeues, next_attempt_at) select 'digest', id, original_url, 'queued', 0, 0, 0 from items where id = ?",
      id,
    );
    exec(instance, "delete from scheduled_runs where task = 'sweep'");
    await instance.tick();
    await until(
      () => stored(instance, id),
      (row) => row !== undefined,
    );

    assert.equal(linkedTopic(instance, id), TARGET);
    assert.deepEqual(stored(instance, id), { topic: TARGET, json_topic: TARGET });
    assert.equal(count(instance, "select count(*) as n from topics where key = 'ml'"), 0);
  });

  it("links an unlinked stored Digest in the older-Digest linking and writes the target's name into it", async () => {
    script(
      instance,
      item(900, [], [], { topic: "ML" }) +
        "\ninsert into items (id, source, kind, normalized_url, original_url, saved_at) values (901, 'other', 'link', 'https://example.com/901', 'https://example.com/901', 901);",
    );
    holdSweep(instance);
    exec(instance, "delete from scheduled_runs where task = 'sweep'");
    await instance.tick();

    assert.equal(linkedTopic(instance, 900), TARGET);
    assert.deepEqual(stored(instance, 900), { topic: TARGET, json_topic: TARGET });
    assert.equal(count(instance, "select count(*) as n from topics where key = 'ml'"), 0);
  });

  it("changes no Pin when an Item is deleted", async () => {
    const earlier = dump(instance, "select * from pins order by id");

    assert.equal((await instance.send("DELETE", "/api/items/900")).status, 204);
    assert.equal(dump(instance, "select * from pins order by id"), earlier);
  });
});

describe("a Pin whose target a key merge removes follows the survivor", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    script(
      instance,
      `
      insert into topics (id, key, name) values (1, 'stored-a', 'Machine Learning'), (2, 'stored-b', 'machine learning'), (3, 'stored-c', 'AI');
      ${item(1, [], [], { topic: "Machine Learning", topicId: 1 })}
      ${item(2, [], [], { topic: "machine learning", topicId: 2 })}
      insert into pins (id, kind, from_key, from_name, into_topic_id, created_at) values
        (1, 'topic-merge', 'ml', 'ML', 2, 1),
        (2, 'topic-merge', 'artificial intelligence', 'artificial intelligence', 3, 2);`,
    );
    await rerunSteps(instance, "topic-keys");
  });

  after(() => instance.close());

  it("repoints the Pin, and the delete of the merged Topic does not fail", () => {
    assert.equal(count(instance, "select count(*) as n from topics where id = 2"), 0);
    assert.equal(
      dump(instance, "select id, into_topic_id from pins order by id"),
      JSON.stringify([
        { id: 1, into_topic_id: 1 },
        { id: 2, into_topic_id: 3 },
      ]),
    );
  });

  it("rewrites the stored Digest of every moved Item to the survivor's name", () => {
    assert.equal(
      dump(
        instance,
        "select item_id, topic, json_extract(digest, '$.topic') as json from digests order by item_id",
      ),
      JSON.stringify([
        { item_id: 1, topic: "Machine Learning", json: "Machine Learning" },
        { item_id: 2, topic: "Machine Learning", json: "Machine Learning" },
      ]),
    );
  });

  it("resolves a Digest that names the first merged-away Topic to the last target", async () => {
    const id = await paste(instance, "later", { title: "Later", topic: "ML" });

    assert.equal(linkedTopic(instance, id), "Machine Learning");
    assert.equal(count(instance, "select count(*) as n from topics where key = 'ml'"), 0);
  });
});
