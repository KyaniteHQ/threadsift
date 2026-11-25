import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { accept, linkVolume, mergeLines, seedVolume, tagsOfDigest } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { seedProposal } from "./proposal-seed.ts";
import { count, exec, nextSweep, rows } from "./related-fixtures.ts";

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
    seedProposal(instance, "tag-merge", { fromTagId: 1, intoTagId: 2 }, { reason: "Same." });
    seedProposal(instance, "tag-merge", { fromTagId: 1, intoTagId: 3 }, { reason: "Other." });
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
    seedProposal(
      instance,
      "tag-merge",
      { fromTagId: 1, intoTagId: 2 },
      {
        id: 7,
        reason: "Same.",
        state: "accepting",
        run: { cursor: 100, moved: 100, unitRevision: 1 },
      },
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
    await nextSweep(instance);

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
    seedProposal(instance, "tag-merge", { fromTagId: 1, intoTagId: 2 }, { id: 1, reason: "Same." });
  });

  after(() => instance.close());

  it("moves 5,000 Items in exactly 50 units and answers done", async () => {
    const answer = await accept(instance, 1);

    assert.deepEqual([answer.status, JSON.parse(answer.body)], [200, { state: "done" }]);
    assert.equal(count(instance, "select count(*) as n from proposals"), 0);
    assert.equal(count(instance, "select count(*) as n from item_tags where tag_id = 2"), ITEMS);
  });
});
