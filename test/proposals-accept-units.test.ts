import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import {
  accept,
  count,
  linkVolume,
  mergeLines,
  seedVolume,
  tagNames,
  tagsOfDigest,
} from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { exec, rows } from "./related-fixtures.ts";

const DigestTagsSchema = z.object({ tags: z.string() });

describe("Accept on a Tag with more Items than one unit holds", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    exec(
      instance,
      "insert into tags (id, key, name) values (1, 'big', 'big'), (2, 'bigger', 'bigger'), (3, 'other', 'other')",
    );
    seedVolume(instance, { tags: ["big", "other"], items: 230, from: 1 });
    linkVolume(instance, { tag: "big", items: 230, from: 1 });
    linkVolume(instance, { tag: "bigger", items: 40, from: 191 });
    linkVolume(instance, { tag: "other", items: 5, from: 1 });
    exec(instance, "update digests set digest = 'not a digest' where item_id = 100005");
    exec(
      instance,
      "insert into proposals (kind, from_tag_id, into_tag_id, reason, state, created_at) values ('tag-merge', 1, 2, 'Same.', 'open', 1), ('tag-merge', 1, 3, 'Other.', 'open', 1)",
    );
  });

  after(() => instance.close());

  it("moves all links over several units, keeps one link for an Item that had both, and counts the links moved", async () => {
    const answer = await accept(instance, 1);

    assert.deepEqual([answer.status, JSON.parse(answer.body)], [200, { state: "done" }]);
    assert.equal(count(instance, "select count(*) as n from tags where key = 'big'"), 0);
    assert.equal(count(instance, "select count(*) as n from item_tags where tag_id = 2"), 230);
    assert.equal(
      count(
        instance,
        "select count(*) as n from (select item_id from item_tags group by item_id having count(*) > 1 and sum(tag_id = 2) > 1)",
      ),
      0,
    );
    assert.deepEqual(await mergeLines(instance), ["big into bigger | 230 Items"]);
    assert.equal(
      rows(
        instance,
        DigestTagsSchema,
        "select digest as tags from digests where item_id = 100005",
      )[0]?.tags,
      "not a digest",
    );
    assert.equal(
      count(instance, "select count(*) as n from item_tags where item_id = 100005 and tag_id = 2"),
      1,
    );
    assert.equal(count(instance, "select count(*) as n from proposals"), 0);
  });

  it("rewrites each stored Digest once, in its old place", () => {
    assert.equal(tagsOfDigest(instance, 100001), JSON.stringify(["bigger", "other"]));
    assert.equal(
      count(
        instance,
        "select count(*) as n from digests where json_valid(digest) and json_extract(digest, '$.tags') like '%big\"%'",
      ),
      0,
    );
  });
});

describe("the sweep finishes a merge that a request left open", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    exec(
      instance,
      "insert into tags (id, key, name) values (1, 'ml', 'ml'), (2, 'machine learning', 'machine learning')",
    );
    seedVolume(instance, { tags: ["ML"], items: 150, from: 1 });
    linkVolume(instance, { tag: "ml", items: 150, from: 1 });
    exec(
      instance,
      "insert into proposals (id, kind, from_tag_id, into_tag_id, reason, state, created_at, cursor, moved, unit_revision) values (7, 'tag-merge', 1, 2, 'Same.', 'accepting', 1, 100, 100, 1)",
    );
    exec(
      instance,
      "insert into pins (kind, from_key, from_name, into_tag_id, created_at) values ('tag-merge', 'ml', 'ml', 2, 1)",
    );
    exec(instance, "update item_tags set tag_id = 2 where item_id <= 100100 and tag_id = 1");
    exec(
      instance,
      "update digests set digest = json_set(digest, '$.tags', json_array('machine learning')) where item_id <= 100100",
    );
  });

  after(() => instance.close());

  it("finishes the merge from the stored cursor, counts only the links that moved after an Item was deleted, and writes the Log line once", async () => {
    assert.equal((await instance.send("DELETE", "/api/items/100150")).status, 204);
    exec(instance, "delete from scheduled_runs where task = 'sweep'");
    await instance.tick();

    assert.equal(count(instance, "select count(*) as n from tags where key = 'ml'"), 0);
    assert.equal(count(instance, "select count(*) as n from item_tags where tag_id = 2"), 149);
    assert.deepEqual(await mergeLines(instance), ["ml into machine learning | 149 Items"]);
    assert.equal(count(instance, "select count(*) as n from proposals"), 0);
  });
});

describe("an Accept that ends on the last unit of a request answers 200", () => {
  const ITEMS = 5000;
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    exec(
      instance,
      "insert into tags (id, key, name) values (1, 'big', 'big'), (2, 'bigger', 'bigger')",
    );
    seedVolume(instance, { tags: ["big"], items: ITEMS, from: 1 });
    linkVolume(instance, { tag: "big", items: ITEMS, from: 1 });
    exec(
      instance,
      "insert into proposals (id, kind, from_tag_id, into_tag_id, reason, state, created_at) values (1, 'tag-merge', 1, 2, 'Same.', 'open', 1)",
    );
  });

  after(() => instance.close());

  it("moves 5,000 Items in exactly 50 units and answers done", async () => {
    const answer = await accept(instance, 1);

    assert.deepEqual([answer.status, JSON.parse(answer.body)], [200, { state: "done" }]);
    assert.equal(count(instance, "select count(*) as n from proposals"), 0);
    assert.equal(count(instance, "select count(*) as n from item_tags where tag_id = 2"), ITEMS);
  });
});

describe("an Accept whose Tag the tag-keys step has staged as a survivor", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    exec(
      instance,
      "insert into tags (id, key, name) values (1, 'stored-a', 'Foo'), (2, 'stored-b', 'foo'), (3, 'bar', 'bar')",
    );
    seedVolume(instance, { tags: ["Foo"], items: 1, from: 1 });
    seedVolume(instance, { tags: ["foo"], items: 1, from: 2 });
    exec(instance, "insert into item_tags (item_id, tag_id) values (100001, 1), (100002, 2)");
    exec(
      instance,
      "insert into proposals (id, kind, from_tag_id, into_tag_id, reason, state, created_at) values (7, 'tag-merge', 1, 3, 'Same.', 'open', 1)",
    );
    exec(
      instance,
      "update data_steps set version = 0, cursor = '1|merge:0' where name = 'tag-keys'",
    );
    exec(instance, "delete from data_steps where name = 'pin-keys'");
    exec(
      instance,
      "insert into data_step_renames (step, subject, old_key, new_key) values ('tag-keys', 1, 'stored-a', 'foo'), ('tag-keys', 2, 'stored-b', 'foo')",
    );
    exec(
      instance,
      "insert or replace into scheduled_runs (task, last_run_at) values ('sweep', ?)",
      Date.now(),
    );
  });

  after(() => instance.close());

  it("lets both key steps finish after the Accept deleted the staged Tag", async () => {
    assert.equal((await accept(instance, 7)).status, 200);

    for (let run = 0; run < 6; run += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each tick continues the step the previous one left.
      await instance.tick();
    }

    assert.equal(
      count(
        instance,
        "select count(*) as n from data_steps where name in ('tag-keys', 'pin-keys') and cursor is null and version > 0",
      ),
      2,
    );
    assert.equal(count(instance, "select count(*) as n from data_step_renames"), 0);
    assert.deepEqual(tagNames(instance), ["bar"]);
    assert.equal(count(instance, "select count(*) as n from item_tags where tag_id = 3"), 2);
  });
});
