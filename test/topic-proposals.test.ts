import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { Instance } from "./instance.ts";
import { seedProposal } from "./proposal-seed.ts";
import { SECRET_KEY, exec, paste, rows, saveProvider, until } from "./related-fixtures.ts";

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

  const topicId = (name: string): number => {
    const [found] = rows(
      instance,
      z.object({ id: z.number() }),
      "select id from topics where name = ?",
      name,
    );

    assert.ok(found !== undefined, name);

    return found.id;
  };

  it("sends the undecided pairs, most used first, and leaves out a Topic with no Item and both decided pairs", async () => {
    exec(instance, "insert into topics (key, name) values ('game', 'Game')");

    const decided = (from: string, into: string, reason: string | null, state: string) =>
      seedProposal(
        instance,
        "topic-merge",
        { from_topic_id: topicId(from), into_topic_id: topicId(into) },
        { reason, state },
      );

    decided("ML", "Machine learning", "The same subject.", "rejected");
    decided("machine-learning", "Machine learning", null, "declined");
    await instance.tick();

    const [task] = await until(
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
        [topicId("Puzzle"), topicId("Puzzles")],
        [topicId("machine-learning"), topicId("ML")],
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
