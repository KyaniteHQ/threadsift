import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { count } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import {
  LOSER_FIRST_ITEM,
  LOSER_ITEMS,
  dump,
  jobsOf,
  rerunSteps,
  script,
  seedLibrary,
  seedLogEntries,
  seedTopicItems,
  stepOneUnit,
} from "./pin-fixtures.ts";

describe("pin-keys merges a Topic recreated under a pinned key through the shared Topic rewrite", () => {
  let instance: Instance;
  let entriesBefore = 0;

  before(async () => {
    instance = await Instance.start();
    seedLibrary(instance);
    entriesBefore = count(instance, "select count(*) as n from log_entries");
    await rerunSteps(instance, "pin-keys");
  });

  after(() => instance.close());

  it("links every Item to the target and removes the loser, its page and its lease", () => {
    assert.equal(
      count(instance, "select count(*) as n from items where topic_id = 1"),
      2 + LOSER_ITEMS + 1,
    );
    assert.equal(count(instance, "select count(*) as n from items where topic_id = 2"), 0);
    assert.equal(count(instance, "select count(*) as n from topics where id = 2"), 0);
    assert.equal(count(instance, "select count(*) as n from topic_pages where topic_id = 2"), 0);
    assert.equal(count(instance, "select count(*) as n from topic_leases where topic_id = 2"), 0);
    assert.equal(count(instance, "select count(*) as n from topic_pages where topic_id = 1"), 1);
  });

  it("writes the target's name into digests.topic and the Digest JSON of every moved Item, read from digests", () => {
    assert.equal(
      count(instance, "select count(*) as n from digests where topic <> 'Machine Learning'"),
      0,
    );
    assert.equal(
      count(
        instance,
        "select count(*) as n from digests where json_valid(digest) and json_extract(digest, '$.topic') <> 'Machine Learning'",
      ),
      0,
    );
    assert.equal(
      dump(instance, "select digest, topic from digests where item_id = 9000"),
      JSON.stringify([{ digest: "not json", topic: "Machine Learning" }]),
    );
    assert.equal(
      dump(
        instance,
        `select json_extract(digest, '$.title') as title, json_extract(digest, '$.summary') as summary from digests where item_id = ${String(LOSER_FIRST_ITEM)}`,
      ),
      JSON.stringify([{ title: "T", summary: "S" }]),
    );
  });

  it("opens the Log lines of the loser on the target and writes no Log entry", () => {
    assert.equal(count(instance, "select count(*) as n from log_entries where topic_id = 1"), 3);
    assert.equal(count(instance, "select count(*) as n from log_entries where topic_id = 2"), 0);
    assert.equal(count(instance, "select count(*) as n from log_entries"), entriesBefore);
    assert.equal(
      count(instance, "select count(*) as n from log_entries where action = 'merge'"),
      0,
    );
  });

  it("repoints the Proposals and Pins that named the loser by the collision priority and deletes none else", () => {
    assert.equal(
      dump(
        instance,
        "select id, from_topic_id as a, into_topic_id as b, state from proposals order by id",
      ),
      JSON.stringify([
        { id: 1, a: 1, b: 3, state: "open" },
        { id: 4, a: 1, b: 4, state: "open" },
        { id: 5, a: 1, b: 5, state: "rejected" },
      ]),
    );
    assert.equal(
      dump(instance, "select id, into_topic_id from pins order by id"),
      JSON.stringify([
        { id: 1, into_topic_id: 1 },
        { id: 2, into_topic_id: 1 },
      ]),
    );
  });

  it("moves catalog_version by one and drops the topic-keys rows that staged the loser", () => {
    assert.equal(
      dump(instance, "select version from catalog_version"),
      JSON.stringify([{ version: 6 }]),
    );
    assert.equal(
      dump(instance, "select subject from data_step_renames order by subject"),
      JSON.stringify([{ subject: 1 }]),
    );
  });

  it("opens no overview job when no Provider is saved", () => {
    assert.equal(jobsOf(instance), "[]");
  });
});

describe("a Topic with more than one unit of Items or Log entries is removed only after its last unit", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
  });

  after(() => instance.close());

  it("takes 3 units for 1,100 Items and keeps the loser until the last", async () => {
    script(
      instance,
      `insert into topics (id, key, name) values (1, 'machine learning', 'Machine Learning'), (2, 'ml', 'ML');
       insert into pins (kind, from_key, from_name, into_topic_id, created_at) values ('topic-merge', 'ml', 'ML', 1, 1);`,
    );
    seedTopicItems(instance, { topicId: 2, name: "ML", from: 1, items: 1100 });

    const remaining: number[] = [];

    for (;;) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each unit reads what the previous one wrote.
      const cursor = await stepOneUnit(instance);

      remaining.push(count(instance, "select count(*) as n from items where topic_id = 2"));

      if (count(instance, "select count(*) as n from topics where id = 2") === 0) break;

      assert.equal(cursor, "topics");
    }

    assert.deepEqual(remaining, [600, 100, 0]);
  });

  it("takes 3 units for 1,001 Log entries on 3 Items and keeps the loser until the last", async () => {
    script(
      instance,
      `insert into topics (id, key, name) values (3, 'deep learning', 'Deep Learning'), (4, 'dl', 'DL');
       insert into pins (kind, from_key, from_name, into_topic_id, created_at) values ('topic-merge', 'dl', 'DL', 3, 1);`,
    );
    seedTopicItems(instance, { topicId: 4, name: "DL", from: 5000, items: 3 });
    seedLogEntries(instance, { topicId: 4, name: "DL", entries: 1001 });

    const remaining: number[] = [];

    for (;;) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each unit reads what the previous one wrote.
      await stepOneUnit(instance);
      remaining.push(count(instance, "select count(*) as n from log_entries where topic_id = 4"));

      if (count(instance, "select count(*) as n from topics where id = 4") === 0) break;
    }

    assert.deepEqual(remaining, [501, 1, 0]);
    assert.equal(count(instance, "select count(*) as n from log_entries where topic_id = 3"), 1001);
    assert.equal(count(instance, "select count(*) as n from items where topic_id = 3"), 3);
  });
});
