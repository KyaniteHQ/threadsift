import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { LogPageSchema } from "../src/core/log-contract.ts";
import { count } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { dump, holdSweep, item, rerunSteps, script } from "./pin-fixtures.ts";
import { exec } from "./related-fixtures.ts";

describe("the pin-keys step recomputes Pin keys and merges a Tag that holds a Pin's key", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    script(
      instance,
      `
      insert into tags (id, key, name) values
        (1, 'machine learning', 'machine learning'), (2, 'ai', 'ai'), (3, 'ml', 'ML'), (4, 'self', 'self'),
        (5, 'stored-a', 'Foo'), (6, 'stored-b', 'foo'), (7, 'bar', 'bar');
      insert into pins (id, kind, from_key, from_name, into_tag_id, created_at) values
        (1, 'tag-merge', 'old-one', 'ML', 1, 1),
        (2, 'tag-merge', 'old-two', 'ml', 2, 2),
        (3, 'tag-merge', 'self', 'self', 4, 3),
        (4, 'tag-merge', 'bar', 'bar', 6, 4),
        (5, 'tag-merge', 'stale-x', 'X', 7, 5);
      ${item(1, [3, 2], ["ML", "ai"])}
      ${item(2, [3, 1], ["ml", "machine learning"])}
      ${item(3, [4], ["self"])}`,
    );
    exec(instance, "delete from data_steps");
    holdSweep(instance);
    await instance.tick();
  });

  after(() => instance.close());

  it("keeps the smaller id of two Pins that reach one key and recomputes the others", () => {
    assert.equal(
      dump(instance, "select id, from_key, into_tag_id from pins order by id"),
      JSON.stringify([
        { id: 1, from_key: "ml", into_tag_id: 1 },
        { id: 3, from_key: "self", into_tag_id: 4 },
        { id: 4, from_key: "bar", into_tag_id: 5 },
        { id: 5, from_key: "x", into_tag_id: 5 },
      ]),
    );
  });

  it("merges a Tag that holds a Pin's key into the Pin's target, with its links and stored Digests", () => {
    assert.equal(count(instance, "select count(*) as n from tags where key = 'ml'"), 0);
    assert.equal(
      dump(
        instance,
        "select item_id, tag_id from item_tags where item_id in (1, 2) order by item_id, tag_id",
      ),
      JSON.stringify([
        { item_id: 1, tag_id: 1 },
        { item_id: 1, tag_id: 2 },
        { item_id: 2, tag_id: 1 },
      ]),
    );
    assert.equal(
      dump(
        instance,
        "select json_extract(digest, '$.tags') as tags from digests where item_id in (1, 2) order by item_id",
      ),
      JSON.stringify([
        { tags: JSON.stringify(["machine learning", "ai"]) },
        { tags: JSON.stringify(["machine learning"]) },
      ]),
    );
  });

  it("leaves the Tag that is the Pin's own target alone", () => {
    assert.equal(count(instance, "select count(*) as n from tags where id = 4"), 1);
    assert.equal(count(instance, "select count(*) as n from item_tags where tag_id = 4"), 1);
  });

  it("repoints a Pin whose target a key merge or a Pin merge removed, and the delete does not fail", () => {
    assert.equal(count(instance, "select count(*) as n from tags where id in (5, 6)"), 1);
    assert.equal(count(instance, "select count(*) as n from tags where id = 7"), 0);
    assert.equal(count(instance, "select count(*) as n from pins where into_tag_id in (6, 7)"), 0);
  });

  it("records its version once and a second tick changes nothing", async () => {
    const earlier =
      dump(instance, "select * from pins order by id") +
      dump(instance, "select * from data_steps order by name");

    holdSweep(instance);
    await instance.tick();

    assert.equal(
      dump(instance, "select * from pins order by id") +
        dump(instance, "select * from data_steps order by name"),
      earlier,
    );
    assert.equal(
      count(
        instance,
        "select count(*) as n from data_steps where name = 'pin-keys' and cursor is null and version > 0",
      ),
      1,
    );
  });
});

describe("a key merge between two accept units", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    script(
      instance,
      `
      insert into tags (id, key, name) values (1, 'stored-a', 'Machine Learning'), (2, 'stored-b', 'machine learning'), (3, 'ai', 'ai');
      begin;
      ${Array.from({ length: 150 }, (_, at) => item(at + 1, [at < 100 ? 3 : 2], [at < 100 ? "ai" : "machine learning"])).join("\n")}
      commit;
      insert into proposals (id, kind, from_tag_id, into_tag_id, reason, state, created_at, cursor, moved, unit_revision)
        values (1, 'tag-merge', 2, 3, 'Same.', 'accepting', 1, 100, 100, 1);`,
    );
  });

  after(() => instance.close());

  it("repoints the row, and the merge finishes onto the survivor with one Log entry", async () => {
    await rerunSteps(instance, "tag-keys");

    assert.equal(
      dump(instance, "select from_tag_id as a, into_tag_id as b, cursor, moved from proposals"),
      JSON.stringify([{ a: 1, b: 3, cursor: 100, moved: 100 }]),
    );

    exec(instance, "delete from scheduled_runs where task = 'sweep'");
    await instance.tick();

    assert.equal(count(instance, "select count(*) as n from proposals"), 0);
    assert.equal(count(instance, "select count(*) as n from tags where id in (1, 2)"), 0);
    assert.equal(count(instance, "select count(*) as n from item_tags where tag_id = 3"), 150);

    const { entries } = await instance.read("GET", "/api/log", LogPageSchema);

    assert.deepEqual(
      entries.flatMap((entry) =>
        entry.action === "merge" ? [[entry.from, entry.into, entry.items]] : [],
      ),
      [["Machine Learning", "ai", 150]],
    );
  });

  it("deletes the row and writes no merge entry when the key merge makes its two Tags one", async () => {
    script(
      instance,
      `
      delete from log_entries;
      insert into tags (id, key, name) values (11, 'stored-c', 'Deep Learning'), (12, 'stored-d', 'deep learning');
      insert into proposals (id, kind, from_tag_id, into_tag_id, reason, state, created_at, cursor, moved, unit_revision)
        values (2, 'tag-merge', 12, 11, 'Same.', 'accepting', 1, 0, 0, 1);
      insert into pins (kind, from_key, from_name, into_tag_id, created_at) values ('tag-merge', 'stored-d', 'deep learning', 11, 1);`,
    );

    await rerunSteps(instance, "tag-keys");

    assert.equal(count(instance, "select count(*) as n from proposals"), 0);
    assert.equal(
      count(instance, "select count(*) as n from log_entries where action = 'merge'"),
      0,
    );
    assert.equal(
      dump(instance, "select into_tag_id from pins where from_key = 'stored-d'"),
      JSON.stringify([{ into_tag_id: 11 }]),
    );
  });
});

describe("the pin-keys step leaves the merged-away Tag of an accepting Proposal to the Accept", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    script(
      instance,
      `
      insert into tags (id, key, name) values (1, 'ml', 'ml'), (2, 'machine learning', 'machine learning');
      ${item(1, [1], ["ml"])}
      insert into proposals (id, kind, from_tag_id, into_tag_id, reason, state, created_at, cursor, moved, unit_revision)
        values (7, 'tag-merge', 1, 2, 'Same.', 'accepting', 1, 0, 0, 1);
      insert into pins (kind, from_key, from_name, into_tag_id, created_at) values ('tag-merge', 'ml', 'ml', 2, 1);`,
    );
  });

  after(() => instance.close());

  it("keeps the Proposal and the Tag while the step runs, and the sweep then finishes the merge with one Log entry", async () => {
    await rerunSteps(instance, "pin-keys");

    assert.equal(count(instance, "select count(*) as n from proposals"), 1);
    assert.equal(count(instance, "select count(*) as n from tags where id = 1"), 1);
    assert.equal(
      count(instance, "select count(*) as n from log_entries where action = 'merge'"),
      0,
    );

    exec(instance, "delete from scheduled_runs where task = 'sweep'");
    await instance.tick();

    assert.equal(count(instance, "select count(*) as n from proposals"), 0);
    assert.equal(count(instance, "select count(*) as n from tags where id = 1"), 0);
    assert.equal(count(instance, "select count(*) as n from item_tags where tag_id = 2"), 1);
    assert.equal(
      count(instance, "select count(*) as n from log_entries where action = 'merge'"),
      1,
    );
  });
});
