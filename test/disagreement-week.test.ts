import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import {
  checksOf,
  jobsOf,
  runWeek,
  seedDigested,
  seedTopics,
  sentOf,
  tasksOf,
} from "./disagreement-fixtures.ts";
import { Instance } from "./instance.ts";
import { claims, moveClaimBack, nextTick } from "./lost-highlight-fixtures.ts";
import { SECRET_KEY, exec, saveProvider } from "./related-fixtures.ts";

const TASK = "disagreement_proposals";

describe("the weekly disagreement claim", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    seedTopics(instance, { 1: "Reading" });
    seedDigested(instance, [
      { id: 1, topic: 1 },
      { id: 2, topic: 1 },
      { id: 3, topic: 1 },
    ]);
    exec(
      instance,
      "insert into items (id, source, kind, normalized_url, original_url, saved_at) values (4, 'other', 'link', 'u4', 'u4', 4)",
    );
  });

  after(() => instance.close());

  it("claims nothing and opens no job with no Provider saved", async () => {
    await instance.tick();
    assert.deepEqual([claims(instance, TASK), jobsOf(instance)], [[], []]);
  });

  it("claims once, opens one job owned by the highest-id Item with a Digest beside the Tag and Topic jobs, and opens none on a second tick", async () => {
    await saveProvider(instance);
    await nextTick(instance);

    const [claimed] = claims(instance, TASK);

    assert.ok(claimed !== undefined);
    assert.deepEqual(
      jobsOf(instance).map(({ item_id: owner }) => owner),
      [3],
    );
    assert.equal(jobsOf(instance, "proposals").length, 1);
    assert.equal(jobsOf(instance, "topic_proposals").length, 1);

    exec(instance, "update jobs set state = 'done' where kind = 'disagreement_proposals'");
    await nextTick(instance);
    assert.equal(jobsOf(instance).length, 1);
    assert.deepEqual(claims(instance, TASK), [claimed]);
  });

  it("opens one more job once its claim is 7 days old, and leaves the other claims alone", async () => {
    const tagClaim = claims(instance, "proposals");

    moveClaimBack(instance, TASK);
    await nextTick(instance);

    assert.equal(jobsOf(instance).length, 2);
    assert.deepEqual(claims(instance, "proposals"), tagClaim);
  });
});

describe("the Topics the weekly disagreement check reads", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    seedTopics(instance, {
      1: "Older",
      2: "Newer",
      3: "Alone",
      4: "Checked",
      5: "Unreadable",
      6: "Long",
    });
    seedDigested(instance, [
      { id: 1, topic: 1, savedAt: 10 },
      { id: 2, topic: 1, savedAt: 11 },
      { id: 3, topic: 2, savedAt: 20 },
      { id: 4, topic: 2, savedAt: 21 },
      { id: 5, topic: 2, savedAt: 22 },
      { id: 6, topic: 3, savedAt: 30 },
      { id: 7, topic: 4, savedAt: 40 },
      { id: 8, topic: 4, savedAt: 41 },
      { id: 9, topic: 5, savedAt: 50 },
      { id: 10, topic: 5, savedAt: 51, digest: "not json" },
      ...Array.from({ length: 14 }, (_, at) => ({ id: 20 + at, topic: 6, savedAt: 100 + at })),
    ]);
    exec(instance, "update digests set digest = 'not json' where item_id = 10");
    exec(instance, "update digests set created_at = 5 where item_id in (1, 2)");
    exec(instance, "update digests set created_at = 90 where item_id in (3, 4, 5)");
    exec(instance, "update digests set created_at = 999 where item_id between 20 and 33");
    exec(
      instance,
      "insert into topic_checks (topic_id, members, checked_at) values (4, '7:7,8:8', 1)",
    );
    exec(
      instance,
      "insert into proposals (kind, from_item_id, into_item_id, from_digest, into_digest, reason, state, created_at) values ('items-disagree', 3, 4, 3, 4, 'Decided.', 'rejected', 1)",
    );
    await saveProvider(instance);
    await runWeek(instance);
  });

  after(() => instance.close());

  it("sends the touched Topics newest Digest first, at most 12 Items each newest saved first, and leaves out a Topic with one Item, a Topic whose membership is stored and a Topic with one readable Digest", () => {
    const [sent] = sentOf(instance);

    assert.deepEqual(
      sent?.topics.map(({ name, items }) => [name, items.map(({ id }) => id)]),
      [
        ["Long", [33, 32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22]],
        ["Newer", [5, 4, 3]],
        ["Older", [2, 1]],
      ],
    );
  });

  it("lists the decided pairs of the sent Items and nothing but an Item id, a title and a Summary of each Item", () => {
    const [sent] = sentOf(instance);
    const [task] = tasksOf(instance);

    assert.deepEqual(sent?.decided, [[3, 4]]);
    assert.deepEqual(
      Object.keys(z.record(z.string(), z.unknown()).parse(JSON.parse(task?.inputs ?? "{}"))),
      ["topics", "decided"],
    );
    assert.equal(task?.item_id, 33);
    assert.ok((task?.inputs ?? "").length < 14_000);
    assert.deepEqual(checksOf(instance), [{ topic_id: 4, members: "7:7,8:8" }]);
  });
});
