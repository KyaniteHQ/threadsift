import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { Instance } from "./instance.ts";
import { claims, moveClaimBack, nextTick, readPage } from "./lost-highlight-fixtures.ts";
import {
  addTopics,
  gapRows,
  gapTopics,
  gapsOf,
  overviewJobs,
  pasteInto,
  proposeGap,
  queueOverview,
  storePage,
} from "./overview-gap-fixtures.ts";
import { SECRET_KEY, exec, rows, saveProvider } from "./related-fixtures.ts";

const TASK = "overview_proposals";

const OVERVIEW_TASKS = "select count(*) as n from ai_tasks where kind = 'topic_overview'";

const count = (instance: Instance, query: string) =>
  rows(instance, z.object({ n: z.number() }), query)[0]?.n ?? 0;

describe("the weekly overview check with no Provider saved", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await pasteInto(instance, "Behind", ["b1", "b2", "b3"]);
    await pasteInto(instance, "Single", ["s1"]);
  });

  after(() => instance.close());

  it("claims nothing and stores no row, then claims on the first tick after a Provider is saved and lists the Topic that is furthest behind first", async () => {
    await instance.tick();
    assert.deepEqual([claims(instance, TASK), gapRows(instance)], [[], []]);

    await saveProvider(instance);
    await nextTick(instance);

    assert.equal(claims(instance, TASK).length, 1);
    assert.deepEqual(gapTopics(instance), ["Single", "Behind"]);
    assert.deepEqual(
      gapRows(instance).map(({ state, reason }) => [state, reason]),
      [
        ["open", "plain-check"],
        ["open", "plain-check"],
      ],
    );

    const listed = gapsOf(await readPage(instance)).map(({ topic }) => [
      topic.name,
      topic.uncovered,
      topic.items,
    ]);

    assert.deepEqual(listed, [
      ["Behind", 3, 3],
      ["Single", 1, 1],
    ]);
  });

  it("makes no job and no overview task", () => {
    assert.deepEqual(overviewJobs(instance), []);
    assert.equal(count(instance, OVERVIEW_TASKS), 0);
  });
});

describe("the weekly overview check picks only Topics that have a gap", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();

    await pasteInto(instance, "Behind", ["b1", "b2", "b3"]);
    await pasteInto(instance, "Covered", ["c1", "c2"]);

    const [queued] = await pasteInto(instance, "Queued", ["q1", "q2"]);
    const [, running] = await pasteInto(instance, "Running", ["l1", "l2"]);

    await pasteInto(instance, "Removed", ["r1", "r2"]);
    await pasteInto(instance, "Rejected", ["j1"]);

    const [built] = await pasteInto(instance, "Partly", ["p1", "p2", "p3"]);

    assert.ok(queued !== undefined && running !== undefined && built !== undefined);
    storePage(instance, "Covered", { builtFrom: "all" });
    queueOverview(instance, queued);
    queueOverview(instance, running, "running");
    storePage(instance, "Removed", { builtFrom: "all" });
    exec(
      instance,
      "update topic_pages set built_from = json_insert(built_from, '$[#]', json_object('item', 9999, 'digest', 9999)) where topic_id = (select id from topics where name = 'Removed')",
    );
    proposeGap(instance, "Rejected", "rejected");
    storePage(instance, "Partly", { builtFrom: [built] });
    await saveProvider(instance);
  });

  after(() => instance.close());

  it("proposes a Topic with a gap and no open run and no row, and skips covered, running, rejected and removed-Item Topics", async () => {
    await nextTick(instance);

    assert.deepEqual(gapTopics(instance), ["Rejected", "Partly", "Behind"]);
    assert.deepEqual(
      gapsOf(await readPage(instance)).map(({ topic }) => [topic.name, topic.uncovered]),
      [
        ["Behind", 3],
        ["Partly", 2],
      ],
    );
    assert.deepEqual(
      gapRows(instance).map(({ state }) => state),
      ["rejected", "open", "open"],
    );
  });
});

describe("the weekly overview check is bounded and runs once a week", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    addTopics(
      instance,
      Array.from({ length: 25 }, (_, at) => ({
        id: at + 1,
        name: `topic${String(at + 1).padStart(2, "0")}`,
        items: at + 1,
        from: (at * (at + 1)) / 2 + 1,
      })),
    );
    await saveProvider(instance);
  });

  after(() => instance.close());

  it("inserts 20 rows, the Topics with the most uncovered Items, and none on a second tick in the week", async () => {
    await nextTick(instance);

    const first = gapTopics(instance);

    assert.equal(first.length, 20);
    assert.deepEqual(first.slice(0, 2), ["topic06", "topic07"]);
    assert.equal(first.at(-1), "topic25");
    assert.equal(first.includes("topic05"), false);

    await nextTick(instance);
    assert.equal(gapRows(instance).length, 20);
  });

  it("inserts the rest after the claim is moved back 7 days, and never a Topic that has a row", async () => {
    moveClaimBack(instance, TASK);
    await nextTick(instance);

    assert.equal(gapRows(instance).length, 25);
    assert.equal(new Set(gapRows(instance).map(({ topic_id }) => topic_id)).size, 25);
  });
});

describe("the weekly overview check deletes an open row whose gap closed", () => {
  let instance: Instance;
  let closed: number;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await pasteInto(instance, "Closing", ["a1", "a2"]);
    await pasteInto(instance, "Staying", ["s1"]);
    closed = proposeGap(instance, "Closing");
    proposeGap(instance, "Staying");
    await saveProvider(instance);
    await nextTick(instance);
  });

  after(() => instance.close());

  it("lists no row for the closed gap, keeps it on a tick in the same week, and deletes it when the week is claimed again", async () => {
    storePage(instance, "Closing", { builtFrom: "all" });

    assert.deepEqual(
      gapsOf(await readPage(instance)).map(({ topic }) => topic.name),
      ["Staying"],
    );
    assert.equal(
      gapRows(instance).some(({ id }) => id === closed),
      true,
    );

    await nextTick(instance);
    assert.equal(
      gapRows(instance).some(({ id }) => id === closed),
      true,
    );

    moveClaimBack(instance, TASK);
    await nextTick(instance);
    assert.deepEqual(gapTopics(instance), ["Staying"]);
  });

  it("proposes a Topic again when it falls behind again, because its row is gone", async () => {
    exec(
      instance,
      "update topic_pages set built_from = '[]' where topic_id = (select id from topics where name = 'Closing')",
    );
    moveClaimBack(instance, TASK);
    await nextTick(instance);
    assert.deepEqual(gapTopics(instance).toSorted(), ["Closing", "Staying"]);
  });
});
