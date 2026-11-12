import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DISAGREEMENTS_MAX,
  type SentTopic,
  disagreementTask,
} from "../src/core/disagreement-task.ts";

const topic = (id: number, items: number, summaryLength: number, first = id * 100): SentTopic => ({
  id,
  name: `Topic ${String(id)}`,
  members: `m${String(id)}`,
  items: Array.from({ length: items }, (_, at) => ({
    id: first + items - at,
    digest: first + items - at,
    title: `Title ${String(first + items - at)}`,
    summary: "s".repeat(summaryLength),
  })),
});

const pair = (a: number, b: number, reason = "They give opposite advice.") => ({ a, b, reason });

describe("the result schema of the disagreement task", () => {
  const sent = [topic(1, 3, 10), topic(2, 2, 10)];

  const parse = (disagreements: readonly ReturnType<typeof pair>[]) =>
    disagreementTask(sent).schema.safeParse({ disagreements });

  it("accepts zero pairs, a pair of two sent Items of one Topic and a pair written either way round", () => {
    assert.equal(parse([]).success, true);
    assert.equal(parse([pair(101, 102)]).success, true);
    assert.equal(parse([pair(102, 101)]).success, true);
  });

  it("refuses an Item that was not sent, two Items of different Topics, equal ids and a pair given twice", () => {
    assert.equal(parse([pair(101, 999)]).success, false);
    assert.equal(parse([pair(101, 201)]).success, false);
    assert.equal(parse([pair(101, 101)]).success, false);
    assert.equal(parse([pair(101, 102), pair(102, 101)]).success, false);
  });

  it("accepts 10 pairs and refuses 11", () => {
    const wide = [topic(1, 12, 10)];
    const pairs = Array.from({ length: DISAGREEMENTS_MAX + 1 }, (_, at) => pair(101, 102 + at));

    const run = (count: number) =>
      disagreementTask(wide).schema.safeParse({ disagreements: pairs.slice(0, count) }).success;

    assert.equal(run(DISAGREEMENTS_MAX), true);
    assert.equal(run(DISAGREEMENTS_MAX + 1), false);
  });

  it("accepts a reason of 160 characters, refuses 161 and refuses an empty reason and each forbidden character", () => {
    assert.equal(parse([pair(101, 102, "a".repeat(160))]).success, true);
    assert.equal(parse([pair(101, 102, "a".repeat(161))]).success, false);
    assert.equal(parse([pair(101, 102, " ")]).success, false);

    for (const character of ["[", "]", "{", "}", '"', "\n", "\r"]) {
      assert.equal(
        parse([pair(101, 102, `a${character}b`)]).success,
        false,
        JSON.stringify(character),
      );
    }
  });
});
