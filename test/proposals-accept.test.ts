import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { ProposalPageSchema } from "../src/core/proposal-contract.ts";
import { CreatedTokenResponseSchema, ItemReadResponseSchema } from "../src/http/schemas.ts";
import {
  accept,
  count,
  mergeLines,
  propose,
  seedVolume,
  tagId,
  tagNames,
  tagsOfDigest,
} from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { exec, paste, rows } from "./related-fixtures.ts";

const PinSchema = z.object({
  from_key: z.string(),
  from_name: z.string(),
  into_tag_id: z.number(),
});

const byNumber = (first: number, second: number): number => first - second;

const catalogVersion = (instance: Instance): number =>
  count(instance, "select coalesce(max(version), 0) as n from catalog_version");

const listed = async (instance: Instance, query: string) =>
  (await instance.read("GET", `/api/items${query}`, ItemReadResponseSchema)).items.map(
    ({ id }) => id,
  );

describe("Accept merges a Tag into another and a Pin keeps it merged", () => {
  let instance: Instance;
  let token: string;
  let one: number;
  let two: number;
  let three: number;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    one = await paste(instance, "one", { title: "One", tags: ["machine learning", "ml"] });
    two = await paste(instance, "two", { title: "Two", tags: ["ml", "ai", "ML"] });
    three = await paste(instance, "three", { title: "Three", tags: ["machine learning"] });
    ({ value: token } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "accept",
    }));
  });

  after(() => instance.close());

  it("refuses an agent token and a signed-out caller, and answers 404 for an unknown id", async () => {
    const id = propose(instance, ["ml", "machine learning"]);

    const agent = await instance.sendWithToken(
      token,
      "POST",
      `/api/proposals/${String(id)}/accept`,
    );

    const signedOut = await instance.fetch(`/api/proposals/${String(id)}/accept`, {
      method: "POST",
    });

    assert.deepEqual([agent.status, signedOut.status], [403, 401]);
    assert.equal((await accept(instance, 9999)).status, 404);
    assert.equal(count(instance, "select count(*) as n from pins"), 0);
    exec(instance, "delete from proposals");
  });

  it("answers not-open for a decided row and merge-busy while another merge runs, and lists accepting rows", async () => {
    const rejected = propose(instance, ["ml", "ai"], "rejected");
    const busy = propose(instance, ["ai", "machine learning"], "accepting");
    const open = propose(instance, ["ml", "machine learning"]);

    const first = await accept(instance, rejected);
    const second = await accept(instance, open);
    const page = await instance.read("GET", "/api/proposals", ProposalPageSchema);

    assert.deepEqual([first.status, JSON.parse(first.body)], [409, { error: "not-open" }]);
    assert.deepEqual([second.status, JSON.parse(second.body)], [409, { error: "merge-busy" }]);
    assert.deepEqual(
      page.proposals.map(({ id, state }) => [id, state]),
      [
        [open, "open"],
        [busy, "accepting"],
      ],
    );
    exec(instance, "delete from proposals");
  });

  it("moves every link, rewrites the stored Digests, drops the Tag, keeps a Pin and writes one merge line", async () => {
    const id = propose(instance, ["ml", "machine learning"]);
    const earlier = catalogVersion(instance);

    const answer = await accept(instance, id);

    assert.deepEqual([answer.status, JSON.parse(answer.body)], [200, { state: "done" }]);
    assert.deepEqual(tagNames(instance), ["machine learning", "ai"]);
    assert.equal(tagsOfDigest(instance, one), JSON.stringify(["machine learning"]));
    assert.equal(tagsOfDigest(instance, two), JSON.stringify(["machine learning", "ai"]));
    assert.equal(
      count(
        instance,
        "select count(*) as n from item_tags where tag_id = ?",
        tagId(instance, "machine learning"),
      ),
      3,
    );
    assert.equal(catalogVersion(instance), earlier + 1);
    assert.deepEqual(await mergeLines(instance), ["ml into machine learning | 2 Items"]);
    assert.equal(count(instance, "select count(*) as n from proposals"), 0);

    assert.deepEqual(
      rows(instance, PinSchema, "select from_key, from_name, into_tag_id from pins"),
      [{ from_key: "ml", from_name: "ml", into_tag_id: tagId(instance, "machine learning") }],
    );
  });

  it("finds the Items by the surviving name and none by the merged-away name", async () => {
    assert.deepEqual(
      (await listed(instance, "?tag=machine%20learning")).toSorted(byNumber),
      [one, two, three].toSorted(byNumber),
    );
    assert.deepEqual(await listed(instance, "?tag=ml"), []);
    assert.deepEqual(await listed(instance, "?q=ml"), []);
  });

  it("links a caller-sent Digest that names the merged-away Tag in another spelling to the survivor", async () => {
    const later = await paste(instance, "later", { title: "Later", tags: ["ML", "ai"] });

    assert.deepEqual(tagNames(instance), ["machine learning", "ai"]);
    assert.equal(tagsOfDigest(instance, later), JSON.stringify(["machine learning", "ai"]));
    assert.equal(
      count(
        instance,
        "select count(*) as n from item_tags where item_id = ? and tag_id = ?",
        later,
        tagId(instance, "machine learning"),
      ),
      1,
    );
  });

  it("links a stored Digest that names the merged-away Tag to the survivor in the older-Digest linking", async () => {
    seedVolume(instance, { tags: ["ML", "ai"], items: 1, from: 1 });
    exec(instance, "delete from scheduled_runs where task = 'sweep'");
    await instance.tick();

    assert.deepEqual(tagNames(instance), ["machine learning", "ai"]);
    assert.equal(tagsOfDigest(instance, 100001), JSON.stringify(["machine learning", "ai"]));
    assert.equal(
      count(
        instance,
        "select count(*) as n from item_tags where item_id = 100001 and tag_id in (select id from tags where key in ('machine learning', 'ai'))",
      ),
      2,
    );
  });

  it("changes no Pin when Items are deleted", async () => {
    const earlier = count(instance, "select count(*) as n from pins");

    assert.equal((await instance.send("DELETE", `/api/items/${String(one)}`)).status, 204);
    assert.equal(count(instance, "select count(*) as n from pins"), earlier);
    assert.equal(
      count(instance, "select count(*) as n from log_entries where action = 'merge'"),
      1,
    );
  });
});

describe("two Accepts in a row chain without a dangling Pin", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await paste(instance, "one", { title: "One", tags: ["ml", "machine learning", "ai"] });
  });

  after(() => instance.close());

  it("repoints the first Pin to the final target, and a later Digest that names the first Tag lands there", async () => {
    const first = await accept(instance, propose(instance, ["ml", "machine learning"]));
    const second = await accept(instance, propose(instance, ["machine learning", "ai"]));

    assert.deepEqual([first.status, second.status], [200, 200]);
    assert.deepEqual(tagNames(instance), ["ai"]);
    assert.deepEqual(
      rows(instance, PinSchema, "select from_key, from_name, into_tag_id from pins order by id"),
      [
        { from_key: "ml", from_name: "ml", into_tag_id: tagId(instance, "ai") },
        {
          from_key: "machine learning",
          from_name: "machine learning",
          into_tag_id: tagId(instance, "ai"),
        },
      ],
    );

    const later = await paste(instance, "later", { title: "Later", tags: ["ML"] });

    assert.equal(tagsOfDigest(instance, later), JSON.stringify(["ai"]));
  });
});

describe("a Pin that already holds the merged-away Tag key follows the Accept", () => {
  it("points the Pin at the survivor, so a later Digest that names the old Tag lands there", async () => {
    const instance = await Instance.start();

    try {
      await instance.setUp();
      await paste(instance, "one", { title: "One", tags: ["ml", "machine learning", "ai"] });
      exec(
        instance,
        "insert into pins (kind, from_key, from_name, into_tag_id, created_at) values ('tag-merge', 'ml', 'ml', ?, 0)",
        tagId(instance, "ai"),
      );

      assert.equal(
        (await accept(instance, propose(instance, ["ml", "machine learning"]))).status,
        200,
      );
      assert.deepEqual(
        rows(instance, PinSchema, "select from_key, from_name, into_tag_id from pins order by id"),
        [{ from_key: "ml", from_name: "ml", into_tag_id: tagId(instance, "machine learning") }],
      );

      const later = await paste(instance, "later", { title: "Later", tags: ["ML"] });

      assert.equal(tagsOfDigest(instance, later), JSON.stringify(["machine learning"]));
    } finally {
      await instance.close();
    }
  });
});
