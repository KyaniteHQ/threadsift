import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  disagreementRows,
  pasteItems,
  proposeDisagreement,
  replaceDigest,
  runWeek,
  sentOf,
  tasksOf,
} from "./disagreement-fixtures.ts";
import { Instance } from "./instance.ts";
import { listedIds, readPage } from "./lost-highlight-fixtures.ts";
import { seedProposal } from "./proposal-seed.ts";
import { SECRET_KEY, saveProvider, count, exec } from "./related-fixtures.ts";
import { topicId } from "./topic-accept-fixtures.ts";
import { jobsOf } from "./weekly-claim-fixtures.ts";

const LISTED = {
  id: 2,
  kind: "items-disagree",
  state: "open",
  reason: "They give opposite advice.",
  topic: { key: "reading", name: "Reading" },
  first: { id: 1, title: "Title 1", summary: "The setting is on by default." },
  second: { id: 2, title: "Title 2", summary: "The setting is off by default." },
};

describe("disagreement rows beside the other kinds", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await pasteItems(instance, [
      { topic: "Reading", title: LISTED.first.title, summary: LISTED.first.summary },
      { topic: "Reading", title: LISTED.second.title, summary: LISTED.second.summary },
      { topic: "Reading" },
      { topic: "Other" },
    ]);
    seedProposal(
      instance,
      "topic-merge",
      {
        fromTopicId: topicId(instance, "Reading"),
        intoTopicId: topicId(instance, "Other"),
      },
      { reason: "Same subject." },
    );
    proposeDisagreement(instance, [1, 2]);
  });

  after(() => instance.close());

  it("lists the disagreement with both stored Summaries", async () => {
    const owner = await readPage(instance);

    assert.deepEqual(
      owner.proposals.map(({ kind }) => kind),
      ["items-disagree", "topic-merge"],
    );
    assert.deepEqual(JSON.parse(JSON.stringify(owner.proposals[0])), LISTED);
  });

  it("rejects the row once, answers 409 not-open the second time, and lists it no more", async () => {
    const id = String(LISTED.id);
    const rejected = await instance.send("POST", `/api/proposals/${id}/reject`);
    const again = await instance.send("POST", `/api/proposals/${id}/reject`);

    assert.deepEqual([rejected.status, JSON.parse(rejected.body)], [200, { state: "rejected" }]);
    assert.deepEqual([again.status, JSON.parse(again.body)], [409, { error: "not-open" }]);
    assert.deepEqual(
      (await readPage(instance)).proposals.map(({ kind }) => kind),
      ["topic-merge"],
    );
  });
});

describe("a disagreement row stays only while the pair was judged on the Digests that are stored", () => {
  let instance: Instance;
  let changed = 0;
  let moved = 0;
  let rejected = 0;
  let kept = 0;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await pasteItems(instance, [
      ...Array.from({ length: 9 }, () => ({ topic: "Reading" })),
      { topic: "Other" },
    ]);
    await saveProvider(instance);
  });

  after(() => instance.close());

  it("hides at once, and deletes at the next weekly stage, an open row whose Digest changed, and keeps a rejected row", async () => {
    changed = proposeDisagreement(instance, [1, 2]);
    rejected = proposeDisagreement(instance, [5, 6], "rejected");
    kept = proposeDisagreement(instance, [7, 8]);

    await replaceDigest(instance, 1, { topic: "Reading", summary: "A new summary of the first." });
    await replaceDigest(instance, 5, { topic: "Reading", summary: "A new summary of the fifth." });

    assert.deepEqual(await listedIds(instance, "items-disagree"), [kept]);
    assert.equal(disagreementRows(instance).length, 3);

    await runWeek(instance);
    assert.ok(
      sentOf(instance)
        .at(-1)
        ?.decided.some(([first, second]) => first === 5 && second === 6) === true,
    );

    assert.deepEqual(
      disagreementRows(instance).map(({ id }) => id),
      [rejected, kept],
    );
    assert.equal(
      disagreementRows(instance).some(({ id }) => id === changed),
      false,
    );
  });

  it("hides an open row whose Items sit in two Topics, keeps it through the next weekly stage, and lists it again when the Items are back in one Topic", async () => {
    moved = proposeDisagreement(instance, [3, 4]);
    exec(instance, "update items set topic_id = ? where id = 4", topicId(instance, "Other"));

    assert.deepEqual(await listedIds(instance, "items-disagree"), [kept]);

    await runWeek(instance);

    assert.equal(
      disagreementRows(instance).some(({ id }) => id === moved),
      true,
    );

    exec(instance, "update items set topic_id = ? where id = 4", topicId(instance, "Reading"));

    assert.deepEqual(await listedIds(instance, "items-disagree"), [moved, kept]);
  });
});

describe("deleting an Item that a disagreement row names", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await pasteItems(
      instance,
      Array.from({ length: 5 }, () => ({ topic: "Reading" })),
    );
    proposeDisagreement(instance, [1, 2]);
    proposeDisagreement(instance, [2, 3]);
    await saveProvider(instance);
  });

  after(() => instance.close());

  it("removes the rows that name either Item and leaves the other rows", async () => {
    assert.equal((await instance.send("DELETE", "/api/items/1")).status, 204);
    assert.deepEqual(
      disagreementRows(instance).map(({ from_item_id: from, into_item_id: into }) => [from, into]),
      [[2, 3]],
    );
    assert.equal((await instance.send("DELETE", "/api/items/3")).status, 204);
    assert.deepEqual(disagreementRows(instance), []);
  });

  it("removes the open job and the AI task of the weekly run when the Item that owns them is deleted", async () => {
    await runWeek(instance);
    assert.deepEqual(
      [jobsOf(instance, "disagreement_proposals").length, tasksOf(instance).length],
      [1, 1],
    );
    assert.equal(tasksOf(instance)[0]?.item_id, 5);
    assert.equal((await instance.send("DELETE", "/api/items/5")).status, 204);
    assert.deepEqual(
      [jobsOf(instance, "disagreement_proposals").length, tasksOf(instance).length],
      [0, 0],
    );
    assert.equal(
      count(instance, "select count(*) as n from proposals where kind = 'items-disagree'"),
      0,
    );
  });
});
