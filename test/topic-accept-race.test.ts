import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { continueMerges } from "../src/features/wiki/core/merge-accept.ts";
import { Instance } from "./instance.ts";
import { pasteTopics } from "./overview-gap-fixtures.ts";
import { seedTopicItems } from "./pin-fixtures.ts";
import { answerOf, proposeTopics, topicId } from "./topic-accept-fixtures.ts";

const withInstance = async (run: (instance: Instance) => Promise<void>): Promise<void> => {
  const instance = await Instance.start();

  try {
    await instance.setUp();
    await run(instance);
  } finally {
    await instance.close();
  }
};

function beforeFirstBatch(instance: Instance, staged: () => Promise<void>): () => boolean {
  const { db } = instance.core;
  const real = db.batch.bind(db);
  let ran = false;

  Object.defineProperty(db, "batch", {
    configurable: true,
    value: async (queries: Parameters<typeof real>[0]) => {
      if (!ran) {
        ran = true;
        Reflect.deleteProperty(db, "batch");
        await staged();
      }

      return real(queries);
    },
  });

  return () => ran;
}

const pinKeys = (instance: Instance): number =>
  instance.database.count("select count(*) as n from pins where from_key = 'a'");

describe("Accept of a Topic row whose claimed merge the merges stage runs first", () => {
  it("answers done when the stage finished the merge before the request's first unit", () =>
    withInstance(async (instance) => {
      await pasteTopics(instance, { Loser: ["loser"], Survivor: ["survivor"] });
      const loser = topicId(instance, "Loser");
      seedTopicItems(instance, { topicId: loser, name: "Loser", from: 1000, items: 2 });
      const proposal = proposeTopics(instance, ["Loser", "Survivor"]);
      const swept = beforeFirstBatch(instance, () => continueMerges(instance.core));

      assert.deepEqual(await answerOf(instance, proposal), [200, { state: "done" }]);
      assert.equal(swept(), true);
      assert.equal(
        instance.database.count("select count(*) as n from pins where from_key = 'loser'"),
        1,
      );
      assert.equal(
        instance.database.count("select count(*) as n from topics where id = ?", loser),
        0,
      );
    }));

  it("answers 404 when another merge removed the row after the stage handed the claim back", () =>
    withInstance(async (instance) => {
      await pasteTopics(instance, { A: ["a"], B: ["b"], C: ["c"] });
      const a = topicId(instance, "A");
      seedTopicItems(instance, { topicId: a, name: "A", from: 1000, items: 2 });
      const first = proposeTopics(instance, ["A", "B"]);
      const second = proposeTopics(instance, ["B", "C"]);
      let secondAnswer: readonly [number, unknown] | null = null;
      const staged = beforeFirstBatch(instance, async () => {
        instance.database.script(
          "create trigger test_on_pin before insert on pins begin select raise(abort, 'the unit fails'); end;",
        );
        await continueMerges(instance.core).catch(() => {});
        instance.database.script("drop trigger test_on_pin");
        secondAnswer = await answerOf(instance, second);
      });

      assert.deepEqual(await answerOf(instance, first), [404, { error: "Not found" }]);
      assert.equal(staged(), true);
      assert.deepEqual(secondAnswer, [200, { state: "done" }]);
      assert.equal(instance.database.count("select count(*) as n from topics where id = ?", a), 1);
      assert.equal(pinKeys(instance), 0);
    }));
});
