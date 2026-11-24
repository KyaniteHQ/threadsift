import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Instance } from "./instance.ts";
import { readPage } from "./lost-highlight-fixtures.ts";
import {
  addTopics,
  gapRows,
  gapsOf,
  sole,
  pasteTopics,
  proposeGap,
  queueOverview,
  storePage,
} from "./overview-gap-fixtures.ts";
import { SECRET_KEY, exec } from "./related-fixtures.ts";
import { proposeTopics } from "./topic-accept-fixtures.ts";

describe("overview-gap rows beside the other kinds", () => {
  let instance: Instance;
  let made: Readonly<Record<string, readonly number[]>>;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    made = await pasteTopics(instance, {
      Behind: ["b1", "b2", "b3"],
      Merged: ["m1"],
      "Merged into": ["i1"],
    });
    proposeTopics(instance, ["Merged", "Merged into"]);
    proposeGap(instance, "Behind");
  });

  after(() => instance.close());

  it("lists an overview gap with the live Topic counts", async () => {
    const owner = await readPage(instance);

    assert.deepEqual(
      owner.proposals.map(({ kind }) => kind),
      ["overview-gap", "topic-merge"],
    );
    assert.deepEqual(JSON.parse(JSON.stringify(sole(gapsOf(owner)))), {
      id: 2,
      kind: "overview-gap",
      state: "open",
      topic: { key: "behind", name: "Behind", uncovered: 3, items: 3 },
    });
  });

  it("counts the uncovered Items live: a Topic page that covers some of them, and an Item deleted", async () => {
    const [first] = made["Behind"] ?? [];

    assert.ok(first !== undefined);
    storePage(instance, "Behind", { builtFrom: [first] });
    assert.deepEqual(sole(gapsOf(await readPage(instance))).topic, {
      key: "behind",
      name: "Behind",
      uncovered: 2,
      items: 3,
    });

    const [, second] = made["Behind"] ?? [];

    assert.equal((await instance.send("DELETE", `/api/items/${String(second)}`)).status, 204);
    assert.deepEqual(sole(gapsOf(await readPage(instance))).topic, {
      key: "behind",
      name: "Behind",
      uncovered: 1,
      items: 2,
    });
    assert.deepEqual(
      gapRows(instance).map(({ state }) => state),
      ["open"],
    );
  });

  it("hides the row while an overview run is open for the Topic and shows it again when the run is done", async () => {
    const [first] = made["Behind"] ?? [];

    assert.ok(first !== undefined);
    queueOverview(instance, first);
    assert.deepEqual(gapsOf(await readPage(instance)), []);
    exec(instance, "update jobs set state = 'done' where kind = 'topic_overview'");
    assert.equal(gapsOf(await readPage(instance)).length, 1);
  });
});

describe("the Proposals list filters overview-gap rows before the page limit", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    addTopics(
      instance,
      Array.from({ length: 62 }, (_, at) => ({
        id: at + 1,
        name: `topic${String(at + 1).padStart(2, "0")}`,
        items: 1,
        from: at + 1,
      })),
    );
    exec(
      instance,
      "insert into proposals (id, kind, reason, state, created_at) select id, 'overview-gap', 'plain-check', 'open', 1 from topics order by id",
    );
    exec(
      instance,
      "insert into overview_gap_proposals (proposal_id, kind, topic_id) select id, 'overview-gap', id from topics",
    );
    exec(
      instance,
      "insert into topic_pages (topic_id, overview, revision, built_from, failure, updated_at) select topics.id, 'O', 1, json_array(json_object('item', topics.id, 'digest', topics.id)), null, 1 from topics where topics.id > 51",
    );
  });

  after(() => instance.close());

  it("fills the page with 50 eligible rows and pages on by the last id", async () => {
    const first = await readPage(instance);

    assert.equal(first.proposals.length, 50);
    assert.equal(first.proposals[0]?.id, 51);
    assert.equal(first.next, String(first.proposals.at(-1)?.id));

    const second = await readPage(instance, `?cursor=${first.next ?? ""}`);

    assert.deepEqual(
      second.proposals.map(({ id }) => id),
      [1],
    );
    assert.equal(second.next, null);
  });
});
