import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { count } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { lines } from "./log-fixtures.ts";
import { item, script } from "./pin-fixtures.ts";
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

  it("keeps the Topic the caller sent in the AI task result", () => {
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
    script(instance, item(900, [], [], { topic: "ML" }));
    exec(instance, "delete from scheduled_runs where task = 'sweep'");
    await instance.tick();

    assert.equal(linkedTopic(instance, 900), TARGET);
    assert.deepEqual(stored(instance, 900), { topic: TARGET, json_topic: TARGET });
    assert.equal(count(instance, "select count(*) as n from topics where key = 'ml'"), 0);
  });
});
