import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { runWeek, seedDigested, seedTopics, sentOf, tasksOf } from "./disagreement-fixtures.ts";
import { Instance } from "./instance.ts";
import { SECRET_KEY, saveProvider } from "./related-fixtures.ts";

const CAP = 14_000;

const LONG = "x".repeat(1200);

describe("one weekly call holds at most 14,000 bytes of Topics", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    seedTopics(instance, { 1: "Long", 2: "Second", 3: "Small" });
    seedDigested(instance, [
      ...Array.from({ length: 12 }, (_, at) => ({
        id: 20 + at,
        topic: 1,
        savedAt: 200 + at,
        summary: LONG,
      })),
      { id: 1, topic: 2, savedAt: 100, summary: LONG },
      { id: 2, topic: 2, savedAt: 101, summary: LONG },
      { id: 3, topic: 3, savedAt: 50, summary: "Short." },
      { id: 4, topic: 3, savedAt: 51, summary: "Short." },
    ]);
    await saveProvider(instance);
    await runWeek(instance);
  });

  after(() => instance.close());

  it("drops the oldest Items of a Topic that does not fit, keeps the newest, and stays within the cap with no room for one more Item", () => {
    const [sent] = sentOf(instance);
    const [task] = tasksOf(instance);
    const long = sent?.topics.find(({ name }) => name === "Long");
    const ids = long?.items.map(({ id }) => id) ?? [];

    assert.ok(ids.length >= 2 && ids.length < 12);
    assert.deepEqual(
      ids,
      Array.from({ length: ids.length }, (_, at) => 31 - at),
    );
    assert.ok((task?.inputs ?? "").length <= CAP);
    assert.ok((task?.inputs ?? "").length > CAP - 1400);
  });

  it("skips a Topic that cannot fit 2 more Items, sends a later Topic that does fit, and keeps the Topics in newest-Digest order", () => {
    const [sent] = sentOf(instance);

    assert.deepEqual(
      sent?.topics.map(({ name }) => name),
      ["Long", "Small"],
    );
  });
});
