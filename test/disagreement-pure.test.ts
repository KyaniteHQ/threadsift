import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { z } from "zod";

import { utf8Length } from "../src/core/digest-prompt.ts";
import { fillDisagreementInput } from "../src/core/disagreement-fill.ts";
import {
  DISAGREEMENT_INPUT_BYTES,
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

const idsOf = (sent: readonly SentTopic[]) =>
  sent.map(({ id, items }) => [id, items.length] as const);

describe("filling one call with Topics up to the byte cap", () => {
  it("adds every Topic whole while they fit and keeps the order", () => {
    const { input, sent } = fillDisagreementInput([topic(1, 3, 100), topic(2, 3, 100)], new Set());

    assert.deepEqual(idsOf(sent), [
      [1, 3],
      [2, 3],
    ]);
    assert.ok(utf8Length(input) <= DISAGREEMENT_INPUT_BYTES);
  });

  it("drops the oldest Items of a Topic that does not fit, down to 2, and keeps the Topic's membership text", () => {
    const whole = topic(1, 12, 1500);
    const { input, sent } = fillDisagreementInput([whole], new Set());
    const kept = sent[0]?.items ?? [];

    assert.ok(kept.length >= 2 && kept.length < 12);
    assert.deepEqual(kept, whole.items.slice(0, kept.length));
    assert.ok(utf8Length(input) <= DISAGREEMENT_INPUT_BYTES);
    assert.equal(
      fillDisagreementInput([{ ...whole, items: whole.items.slice(0, kept.length + 1) }], new Set())
        .sent[0]?.items.length,
      kept.length,
    );
    assert.equal(sent[0]?.members, "m1");
  });

  it("skips a Topic that cannot fit 2 Items and fits a later, smaller Topic", () => {
    const { sent } = fillDisagreementInput(
      [topic(1, 2, 400), topic(2, 2, 7000), topic(3, 2, 400)],
      new Set(),
    );

    assert.deepEqual(idsOf(sent), [
      [1, 2],
      [3, 2],
    ]);
  });

  it("sends no Topic when none fits", () => {
    assert.deepEqual(fillDisagreementInput([topic(1, 2, 7000)], new Set()).sent, []);
  });

  it("lists the decided pairs of the sent Items, lower id first, in either stored order", () => {
    const { input } = fillDisagreementInput([topic(1, 3, 10)], new Set(["101:103"]));

    assert.deepEqual(
      z.object({ decided: z.array(z.array(z.number())) }).parse(JSON.parse(input)).decided,
      [[101, 103]],
    );
  });
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
