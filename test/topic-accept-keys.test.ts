import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { count } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { dump, rerunSteps, script, seedTopicItems } from "./pin-fixtures.ts";
import { exec } from "./related-fixtures.ts";
import { heldLeases, topicMergeLines } from "./topic-accept-fixtures.ts";

const SURVIVOR_ITEMS = 2;

const LOSER_ITEMS = 5;

const seed = (instance: Instance, extra: string): void => {
  script(
    instance,
    `
    insert into topics (id, key, name) values
      (1, 'machine learning', 'Machine Learning'),
      (2, 'stored-b', 'machine learning'),
      (3, 'artificial intelligence', 'Artificial intelligence');
    ${extra}`,
  );
  seedTopicItems(instance, {
    topicId: 1,
    name: "Machine Learning",
    from: 100,
    items: SURVIVOR_ITEMS,
  });
  seedTopicItems(instance, { topicId: 2, name: "machine learning", from: 200, items: LOSER_ITEMS });
  seedTopicItems(instance, { topicId: 3, name: "Artificial intelligence", from: 300, items: 1 });
};

const sweep = async (instance: Instance): Promise<void> => {
  exec(instance, "delete from scheduled_runs where task = 'sweep'");
  await instance.tick();
};

const withInstance = async (run: (instance: Instance) => Promise<void>): Promise<void> => {
  const instance = await Instance.start();

  try {
    await instance.setUp();
    await run(instance);
  } finally {
    await instance.close();
  }
};

describe("a topic-keys merge between two accept units", () => {
  it("repoints the accepting row to the survivor of the key merge and the merge finishes onto the target with one Log entry", () =>
    withInstance(async (instance) => {
      seed(
        instance,
        `insert into proposals (id, kind, from_topic_id, into_topic_id, reason, state, created_at, moved, unit_revision)
           values (7, 'topic-merge', 2, 3, 'Same.', 'accepting', 1, 0, 1);
         insert into pins (kind, from_key, from_name, into_topic_id, created_at)
           values ('topic-merge', 'machine learning', 'machine learning', 3, 1);`,
      );
      await rerunSteps(instance, "topic-keys", "pin-keys");

      assert.equal(
        dump(instance, "select id, from_topic_id, into_topic_id, state from proposals"),
        JSON.stringify([{ id: 7, from_topic_id: 1, into_topic_id: 3, state: "accepting" }]),
      );
      await sweep(instance);

      assert.equal(count(instance, "select count(*) as n from proposals"), 0);
      assert.equal(count(instance, "select count(*) as n from topics where id in (1, 2)"), 0);
      assert.equal(
        count(instance, "select count(*) as n from items where topic_id = 3"),
        SURVIVOR_ITEMS + LOSER_ITEMS + 1,
      );
      assert.deepEqual(await topicMergeLines(instance), [
        `Machine Learning into Artificial intelligence | ${String(SURVIVOR_ITEMS + LOSER_ITEMS)} Items`,
      ]);
      assert.equal(
        dump(instance, "select from_key, into_topic_id from pins order by id"),
        JSON.stringify([{ from_key: "machine learning", into_topic_id: 3 }]),
      );
      assert.equal(heldLeases(instance), 0);
    }));

  it("keeps the accepting row over an older rejected row that reaches the same pair, and the merge finishes", () =>
    withInstance(async (instance) => {
      seed(
        instance,
        `insert into proposals (id, kind, from_topic_id, into_topic_id, reason, state, created_at, moved, unit_revision)
           values (1, 'topic-merge', 1, 3, 'Older decision.', 'rejected', 1, null, null),
                  (2, 'topic-merge', 2, 3, 'Newer merge.', 'accepting', 1, 0, 1);
         insert into pins (kind, from_key, from_name, into_topic_id, created_at)
           values ('topic-merge', 'machine learning', 'machine learning', 3, 1);`,
      );
      await rerunSteps(instance, "topic-keys", "pin-keys");

      assert.equal(
        dump(instance, "select id, from_topic_id, into_topic_id, state, reason from proposals"),
        JSON.stringify([
          { id: 2, from_topic_id: 1, into_topic_id: 3, state: "accepting", reason: "Newer merge." },
        ]),
      );
      await sweep(instance);

      assert.equal(count(instance, "select count(*) as n from proposals"), 0);
      assert.equal(count(instance, "select count(*) as n from topics where id in (1, 2)"), 0);
      assert.equal((await topicMergeLines(instance)).length, 1);
    }));

  it("deletes the row and writes no merge-topic entry when the key merge makes its two Topics one", () =>
    withInstance(async (instance) => {
      seed(
        instance,
        `insert into proposals (id, kind, from_topic_id, into_topic_id, reason, state, created_at, moved, unit_revision)
           values (7, 'topic-merge', 2, 1, 'Same.', 'accepting', 1, 0, 1);
         insert into pins (kind, from_key, from_name, into_topic_id, created_at)
           values ('topic-merge', 'machine learning', 'machine learning', 1, 1);`,
      );
      await rerunSteps(instance, "topic-keys", "pin-keys");
      await sweep(instance);

      assert.equal(count(instance, "select count(*) as n from proposals"), 0);
      assert.deepEqual(await topicMergeLines(instance), []);
      assert.equal(
        count(instance, "select count(*) as n from items where topic_id = 1"),
        SURVIVOR_ITEMS + LOSER_ITEMS,
      );
      assert.equal(count(instance, "select count(*) as n from topics where id = 2"), 0);
      assert.equal(
        dump(instance, "select from_key, into_topic_id from pins"),
        JSON.stringify([{ from_key: "machine learning", into_topic_id: 1 }]),
      );
    }));
});
