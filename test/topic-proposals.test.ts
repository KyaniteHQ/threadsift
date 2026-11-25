import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { Instance } from "./instance.ts";
import { SECRET_KEY, paste, saveProvider, until, exec, rows } from "./related-fixtures.ts";
import { proposeTopics, topicId } from "./topic-accept-fixtures.ts";

describe("the Topic job's input and its owner Item", () => {
  let instance: Instance;
  let owner: number;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await paste(instance, "a", { title: "A", topic: "Machine learning" });
    await paste(instance, "b", { title: "B", topic: "machine-learning" });
    await paste(instance, "c", { title: "C", topic: "ML" });
    await paste(instance, "d", { title: "D", topic: "Games" });
    await paste(instance, "e", { title: "E", topic: "Puzzle" });
    await paste(instance, "f", { title: "F", topic: "Puzzle" });
    await paste(instance, "g", { title: "G", topic: "Puzzles" });
    owner = await paste(instance, "h", { title: "H", topic: "Puzzles" });
    await saveProvider(instance);
  });

  after(() => instance.close());

  it("sends the undecided pairs, most used first, and leaves out a Topic with no Item and both decided pairs", async () => {
    exec(instance, "insert into topics (key, name) values ('game', 'Game')");

    proposeTopics(instance, ["ML", "Machine learning"], "rejected", "The same subject.");
    proposeTopics(instance, ["machine-learning", "Machine learning"], "declined", null);
    await instance.tick();

    const [task] = await until(
      "a topic_proposals task exists",
      () =>
        rows(
          instance,
          z.object({ inputs: z.string(), item_id: z.number() }),
          "select inputs, item_id from ai_tasks where kind = 'topic_proposals'",
        ),
      (found) => found.length > 0,
    );

    const { pairs } = z
      .object({
        pairs: z.array(
          z.tuple([
            z.object({ id: z.number(), items: z.number(), tags: z.array(z.string()) }),
            z.object({ id: z.number(), items: z.number(), tags: z.array(z.string()) }),
          ]),
        ),
      })
      .parse(JSON.parse(task?.inputs ?? ""));

    assert.equal(task?.item_id, owner);
    assert.deepEqual(
      pairs.map((pair) => pair.map(({ id }) => id)),
      [
        [topicId(instance, "Puzzle"), topicId(instance, "Puzzles")],
        [topicId(instance, "machine-learning"), topicId(instance, "ML")],
      ],
    );
    assert.deepEqual(
      pairs.map((pair) => pair.map(({ items }) => items)),
      [
        [2, 2],
        [1, 1],
      ],
    );
  });
});
