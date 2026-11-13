import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { count } from "./accept-fixtures.ts";
import { seedDigested, seedTopics } from "./disagreement-fixtures.ts";
import { Instance } from "./instance.ts";
import { dump, rerunSteps, script } from "./pin-fixtures.ts";
import { paste, rows } from "./related-fixtures.ts";

const REASON = "They disagree about the default.";

const DISAGREEMENT_PINS = `select id, kind, from_key, from_name, from_item_id, into_item_id, from_digest, into_digest from pins where kind = 'items-disagree' order by id`;

describe("the pin-keys step leaves a disagreement Pin alone", () => {
  let instance: Instance;
  let unchanged: string;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    seedTopics(instance, { 1: "Reading", 2: "Older Topic" });
    seedDigested(
      instance,
      Array.from({ length: 8 }, (_, at) => ({ id: at + 1, topic: 1 })),
    );
    script(
      instance,
      `
      insert into tags (id, key, name) values (1, 'machine learning', 'machine learning');
      insert into pins (kind, from_key, from_name, into_tag_id, created_at) values ('tag-merge', 'old-key', 'ML', 1, 1);
      insert into pins (kind, from_key, from_name, into_topic_id, created_at) values ('topic-merge', 'older', 'Older Topic', 1, 2);
      insert into pins (kind, from_key, from_name, from_item_id, into_item_id, from_digest, into_digest, created_at) values
        ('items-disagree', '1:2', '${REASON}', 1, 2, 1, 2, 3),
        ('items-disagree', '3:4', '${REASON}', 3, 4, 3, 4, 4);`,
    );
    unchanged = dump(instance, DISAGREEMENT_PINS);
    await rerunSteps(instance, "pin-keys");
  });

  after(() => instance.close());

  it("recomputes the Tag and Topic Pin keys as before and leaves both disagreement Pins unchanged, even with the same reason", () => {
    assert.equal(dump(instance, DISAGREEMENT_PINS), unchanged);
    assert.equal(
      dump(instance, "select kind, from_key from pins where kind <> 'items-disagree' order by id"),
      JSON.stringify([
        { kind: "tag-merge", from_key: "ml" },
        { kind: "topic-merge", from_key: "older topic" },
      ]),
    );
  });

  it("completes: the version is recorded with no cursor and a second tick changes nothing", async () => {
    assert.equal(
      count(
        instance,
        "select count(*) as n from data_steps where name = 'pin-keys' and cursor is null and version > 0",
      ),
      1,
    );

    const earlier = dump(instance, "select * from pins order by id");

    await rerunSteps(instance, "pin-keys");
    assert.equal(dump(instance, "select * from pins order by id"), earlier);
  });

  it("does not rewrite a Digest whose Topic and Tag equal a pair key", async () => {
    const id = await paste(instance, "pair-key", {
      title: "Pair key",
      topic: "1:2",
      tags: ["3:4"],
    });

    assert.deepEqual(
      rows(
        instance,
        z.object({ topic: z.string(), tags: z.string() }),
        "select topic, json_extract(digest, '$.tags') as tags from digests where item_id = ?",
        id,
      ),
      [{ topic: "1:2", tags: JSON.stringify(["3:4"]) }],
    );
    assert.equal(dump(instance, DISAGREEMENT_PINS), unchanged);
  });
});
