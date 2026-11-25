import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { runWeek, seedDigested, seedTopics, sentOf, tasksOf } from "./disagreement-fixtures.ts";
import { Instance, SECRET_KEY } from "./instance.ts";
import { saveProvider } from "./library-fixtures.ts";
import { jobsOf, claims } from "./weekly-claim-fixtures.ts";

const span = (from: number, count: number): readonly number[] =>
  Array.from({ length: count }, (_, at) => from + at);

const textOf = (ids: readonly number[]): string =>
  ids.map((id) => `${String(id)}:${String(id)}`).join(",");

describe("a Topic is read again only when the exact list of its newest 12 Items and their Digests changes", () => {
  let instance: Instance;

  const sentTopics = (): readonly string[] =>
    sentOf(instance).flatMap(({ topics }) => topics.map(({ name }) => name));

  const store = (topic: number, ids: readonly number[]): void => {
    instance.database.exec(
      "insert or replace into topic_checks (topic_id, members, checked_at) values (?, ?, 1)",
      topic,
      textOf(ids),
    );
  };

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    seedTopics(instance, { 1: "Pair", 2: "Twelve", 3: "Thirteen", 4: "Merged", 5: "Receiving" });
    seedDigested(instance, [
      ...span(100, 2).map((id) => ({ id, topic: 1 })),
      ...span(110, 12).map((id) => ({ id, topic: 2 })),
      ...span(130, 13).map((id) => ({ id, topic: 3 })),
      { id: 60, topic: 4, token: 10 },
      { id: 61, topic: 4, token: 40 },
    ]);
    instance.database.exec(
      "insert into ai_tasks (id, kind, inputs, input_revision, executor, attempts, deadline, state) values (20, 'digest', '{}', 0, 'caller', 1, 0, 'done'), (30, 'digest', '{}', 0, 'caller', 1, 0, 'done')",
    );
    store(1, span(100, 2));
    store(2, span(110, 12));
    store(3, span(131, 12));
    instance.database.exec(
      "insert into topic_checks (topic_id, members, checked_at) values (4, '60:10,61:40', 1)",
    );
    await saveProvider(instance);
  });

  after(() => instance.close());

  it("builds in SQL the text a Topic of 2, 12 and 13 Items would store, so no stored Topic is read", async () => {
    await runWeek(instance);

    assert.equal(claims(instance, "disagreement_proposals").length, 1);
    assert.deepEqual(
      jobsOf(instance, "disagreement_proposals").map(({ state }) => state),
      ["done"],
    );
    assert.deepEqual(tasksOf(instance), []);
  });

  it("is not touched by a new Digest of an Item outside the newest 12, and is touched by one of a compared Item", async () => {
    instance.database.exec(
      "insert into ai_tasks (id, kind, inputs, input_revision, executor, attempts, deadline, state) values (900, 'digest', '{}', 0, 'caller', 1, 0, 'done'), (901, 'digest', '{}', 0, 'caller', 1, 0, 'done')",
    );
    instance.database.exec("update digests set task_id = 900 where item_id = 130");
    const task = "disagreement_proposals";
    const previous = claims(instance, task)[0]?.last_run_at ?? 0;
    const previousStates = jobsOf(instance, task).map(({ state }) => state);
    await runWeek(instance);
    assert.ok((claims(instance, task)[0]?.last_run_at ?? 0) > previous);
    assert.deepEqual(
      jobsOf(instance, task).map(({ state }) => state),
      [...previousStates, "done"],
    );
    assert.deepEqual(tasksOf(instance), []);

    instance.database.exec("update digests set task_id = 901 where item_id = 142");
    await runWeek(instance);
    assert.deepEqual(sentTopics(), ["Thirteen"]);
  });

  it("is read again when its Items were deleted and others moved in by a merge keep the count and the sum of the Digests", async () => {
    instance.database.exec("delete from digests where item_id in (60, 61)");
    instance.database.exec("delete from items where id in (60, 61)");
    seedDigested(instance, [
      { id: 62, topic: 5, token: 20 },
      { id: 63, topic: 5, token: 30 },
    ]);
    instance.database.exec("update items set topic_id = 4 where id in (62, 63)");
    await runWeek(instance);

    assert.deepEqual(
      sentOf(instance)
        .at(-1)
        ?.topics.map(({ name }) => name),
      ["Thirteen", "Merged"],
    );
  });
});
