import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import {
  checksOf,
  membersText,
  pasteItems,
  proposeDisagreement,
  runWeek,
  sentOf,
  tasksOf,
} from "./disagreement-fixtures.ts";
import { Instance } from "./instance.ts";
import { SECRET_KEY, saveProvider } from "./related-fixtures.ts";
import { exec } from "./sqlite-fixtures.ts";
import { topicId } from "./topic-accept-fixtures.ts";

describe("the Topics the weekly disagreement check reads", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await pasteItems(instance, [
      ...Array.from({ length: 2 }, () => ({ topic: "Older" })),
      ...Array.from({ length: 3 }, () => ({ topic: "Newer" })),
      { topic: "Alone" },
      ...Array.from({ length: 2 }, () => ({ topic: "Checked" })),
      ...Array.from({ length: 2 }, () => ({ topic: "Unreadable" })),
      ...Array.from({ length: 14 }, () => ({ topic: "Long" })),
    ]);
    exec(instance, "update digests set digest = 'not json' where item_id = 10");
    exec(instance, "update digests set created_at = 5 where item_id in (1, 2)");
    exec(instance, "update digests set created_at = 90 where item_id in (3, 4, 5)");
    exec(instance, "update digests set created_at = 999 where item_id between 11 and 24");
    exec(
      instance,
      "insert into topic_checks (topic_id, members, checked_at) values (?, ?, 1)",
      topicId(instance, "Checked"),
      membersText(instance, [7, 8]),
    );
    proposeDisagreement(instance, [3, 4], "rejected");
    await saveProvider(instance);
    await runWeek(instance);
  });

  after(() => instance.close());

  it("sends the touched Topics newest Digest first, at most 12 Items each newest saved first, and leaves out a Topic with one Item, a Topic whose membership is stored and a Topic with one readable Digest", () => {
    const [sent] = sentOf(instance);

    assert.deepEqual(
      sent?.topics.map(({ name, items }) => [name, items.map(({ id }) => id)]),
      [
        ["Long", [24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13]],
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
    assert.equal(task?.item_id, 24);
    assert.ok(Buffer.byteLength(task?.inputs ?? "") <= 14_000);
    assert.deepEqual(checksOf(instance), [
      { topic_id: topicId(instance, "Checked"), members: membersText(instance, [7, 8]) },
    ]);
  });
});
