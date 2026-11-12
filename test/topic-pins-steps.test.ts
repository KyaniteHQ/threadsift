import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { CATALOG_KEY_VERSION } from "../src/core/catalog-key.ts";
import { count } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { dump, holdSweep, item, rerunSteps, script } from "./pin-fixtures.ts";

describe("the pin-keys step recomputes Topic Pin keys and merges a Topic that holds a Pin's key", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    script(
      instance,
      `
      insert into tags (id, key, name) values (1, 'ml', 'ML');
      insert into topics (id, key, name) values
        (1, 'machine learning', 'Machine Learning'), (2, 'ml', 'ML'), (3, 'self', 'self'),
        (4, 'ai', 'AI'), (5, 'accepting', 'Accepting'), (6, 'accepted', 'Accepted');
      insert into pins (id, kind, from_key, from_name, into_tag_id, into_topic_id, created_at) values
        (1, 'topic-merge', 'old-one', 'ML', null, 1, 1),
        (2, 'topic-merge', 'old-two', 'ml', null, 4, 2),
        (3, 'topic-merge', 'self', 'self', null, 3, 3),
        (4, 'topic-merge', 'stale-x', 'X', null, 4, 4),
        (5, 'tag-merge', 'ml', 'ML', 1, null, 5),
        (6, 'topic-merge', 'accepting', 'Accepting', null, 6, 6);
      ${item(1, [], [], { topic: "ML", topicId: 2 })}
      ${item(2, [], [], { topic: "self", topicId: 3 })}
      ${item(3, [], [], { topic: "Accepting", topicId: 5 })}
      insert into proposals (id, kind, from_topic_id, into_topic_id, reason, state, created_at, cursor, moved, unit_revision)
        values (1, 'topic-merge', 5, 6, 'Same.', 'accepting', 1, 0, 0, 1);`,
    );
    await rerunSteps(instance, "pin-keys");
  });

  after(() => instance.close());

  it("keeps the smaller id of two Topic Pins that reach one key, and recomputes the others", () => {
    assert.equal(
      dump(instance, "select id, kind, from_key from pins order by id"),
      JSON.stringify([
        { id: 1, kind: "topic-merge", from_key: "ml" },
        { id: 3, kind: "topic-merge", from_key: "self" },
        { id: 4, kind: "topic-merge", from_key: "x" },
        { id: 5, kind: "tag-merge", from_key: "ml" },
        { id: 6, kind: "topic-merge", from_key: "accepting" },
      ]),
    );
  });

  it("lets a Tag Pin and a Topic Pin share a key", () => {
    assert.equal(count(instance, "select count(*) as n from pins where from_key = 'ml'"), 2);
  });

  it("merges the Topic that holds a Pin's key into the Pin's target", () => {
    assert.equal(count(instance, "select count(*) as n from topics where id = 2"), 0);
    assert.equal(
      dump(instance, "select topic_id from items where id = 1"),
      JSON.stringify([{ topic_id: 1 }]),
    );
    assert.equal(
      dump(
        instance,
        "select topic, json_extract(digest, '$.topic') as json from digests where item_id = 1",
      ),
      JSON.stringify([{ topic: "Machine Learning", json: "Machine Learning" }]),
    );
  });

  it("leaves the Topic that is a Pin's own target alone", () => {
    assert.equal(count(instance, "select count(*) as n from topics where id = 3"), 1);
    assert.equal(count(instance, "select count(*) as n from items where topic_id = 3"), 1);
  });

  it("skips the merged-away Topic of an accepting Proposal and still records its version", () => {
    assert.equal(count(instance, "select count(*) as n from topics where id = 5"), 1);
    assert.equal(count(instance, "select count(*) as n from items where topic_id = 5"), 1);
    assert.equal(count(instance, "select count(*) as n from proposals where id = 1"), 1);
    assert.equal(
      dump(instance, "select version, cursor from data_steps where name = 'pin-keys'"),
      JSON.stringify([{ version: CATALOG_KEY_VERSION, cursor: null }]),
    );
  });

  it("changes nothing on a second tick", async () => {
    const earlier =
      dump(instance, "select * from pins order by id") +
      dump(instance, "select * from topics order by id") +
      dump(instance, "select * from data_steps order by name");

    holdSweep(instance);
    await instance.tick();

    assert.equal(
      dump(instance, "select * from pins order by id") +
        dump(instance, "select * from topics order by id") +
        dump(instance, "select * from data_steps order by name"),
      earlier,
    );
  });
});

describe("the pin-keys step merges a Topic that appears under a Pin's key after a run recorded its version", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    script(
      instance,
      `
      insert into topics (id, key, name) values (1, 'machine learning', 'Machine Learning'), (2, 'ml', 'ML');
      insert into pins (id, kind, from_key, from_name, into_topic_id, created_at) values (1, 'topic-merge', 'ml', 'ML', 1, 1);
      ${item(1, [], [], { topic: "ML", topicId: 2 })}`,
    );
  });

  after(() => instance.close());

  it("merges a Topic that appeared under the key after an earlier run recorded the version", async () => {
    await rerunSteps(instance, "pin-keys");

    assert.equal(count(instance, "select count(*) as n from topics where id = 2"), 0);

    script(
      instance,
      `insert into topics (id, key, name) values (3, 'ml', 'ml');
       ${item(2, [], [], { topic: "ml", topicId: 3 })}`,
    );
    await rerunSteps(instance, "pin-keys");

    assert.equal(count(instance, "select count(*) as n from topics where key = 'ml'"), 0);
    assert.equal(
      dump(instance, "select topic_id from items order by id"),
      JSON.stringify([{ topic_id: 1 }, { topic_id: 1 }]),
    );
    assert.equal(
      count(
        instance,
        "select count(*) as n from data_steps where name = 'pin-keys' and cursor is null",
      ),
      1,
    );
  });
});

describe("the pin-keys completion check", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    script(
      instance,
      `
      insert into topics (id, key, name) values (1, 'machine learning', 'Machine Learning'), (2, 'ml', 'ML');
      insert into pins (id, kind, from_key, from_name, into_topic_id, created_at) values (1, 'topic-merge', 'ml', 'ML', 1, 1);
      ${item(1, [], [], { topic: "ML", topicId: 2 })}
      insert or replace into data_steps (name, version, cursor) values ('pin-keys', 0, '${String(CATALOG_KEY_VERSION)}|finish');`,
    );
    holdSweep(instance);
    await instance.tick();
  });

  after(() => instance.close());

  it("does not record the step done while a Topic holds a Pin's key, and merges that Topic first", () => {
    assert.equal(count(instance, "select count(*) as n from topics where id = 2"), 0);
    assert.equal(
      dump(instance, "select topic_id from items where id = 1"),
      JSON.stringify([{ topic_id: 1 }]),
    );
  });

  it("records the step done once no Topic but a Pin's target holds a Pin's key", () => {
    assert.equal(
      count(
        instance,
        "select count(*) as n from data_steps where name = 'pin-keys' and cursor is null and version = " +
          String(CATALOG_KEY_VERSION),
      ),
      1,
    );
  });
});

describe("deleting Items changes no Topic Pin", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    script(
      instance,
      `
      insert into topics (id, key, name) values (1, 'machine learning', 'Machine Learning');
      insert into pins (id, kind, from_key, from_name, into_topic_id, created_at) values (1, 'topic-merge', 'ml', 'ML', 1, 1);
      ${item(1, [], [], { topic: "Machine Learning", topicId: 1 })}`,
    );
  });

  after(() => instance.close());

  it("keeps the Pin when the Item of its target is deleted", async () => {
    const earlier = dump(instance, "select * from pins order by id");

    assert.equal((await instance.send("DELETE", "/api/items/1")).status, 204);
    assert.equal(dump(instance, "select * from pins order by id"), earlier);
  });
});
