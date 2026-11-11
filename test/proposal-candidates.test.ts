import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { catalogKey } from "../src/core/catalog.ts";
import {
  type CandidateTag,
  PROPOSALS_MAX,
  candidatePairs,
  disjointPairs,
  looseKey,
  pairKey,
} from "../src/core/proposal-candidates.ts";
import { proposalsInput } from "../src/core/proposal-input.ts";
import { PROPOSALS_INPUT_BYTES, type SentPair, proposalsTask } from "../src/core/proposal-task.ts";

function tag(id: number, name: string, items = 1): CandidateTag {
  return { id, key: catalogKey(name), items };
}

function pairsOf(tags: readonly CandidateTag[], known: readonly string[] = []) {
  return candidatePairs(tags, new Set(known)).map(
    ({ low, high }) => `${String(low)}-${String(high)}`,
  );
}

describe("the plain check picks the pairs of Tags that may name one concept, in a fixed order, at most 20 and none that has a row", () => {
  it("meets punctuation, spacing and a final s, and keeps accents apart", () => {
    assert.equal(looseKey("machine-learning"), "machinelearning");
    assert.equal(looseKey("llms"), "llm");
    assert.equal(looseKey("gas"), "gas");
    assert.equal(looseKey("cs"), "cs");
    assert.deepEqual(
      pairsOf([
        tag(1, "machine-learning"),
        tag(2, "machine learning"),
        tag(3, "machine_learning"),
        tag(4, "LLM"),
        tag(5, "LLMs"),
        tag(6, "café"),
        tag(7, "cafe"),
      ]),
      ["1-2", "1-3", "2-3", "4-5"],
    );
  });

  it("meets an initialism of two or more words with a Tag of at least 2 letters", () => {
    assert.deepEqual(
      pairsOf([
        tag(1, "machine learning"),
        tag(2, "ml"),
        tag(3, "natural language processing"),
        tag(4, "NLP"),
      ]),
      ["1-2", "3-4"],
    );
    assert.deepEqual(pairsOf([tag(1, "a b"), tag(2, "a")]), []);
  });

  it("sends c, c++ and c# to the model as pairs, and skips a Tag with no Item and a pair that has a row", () => {
    const tags = [tag(1, "c"), tag(2, "c++"), tag(3, "c#"), tag(4, "C!", 0)];

    assert.deepEqual(pairsOf(tags), ["1-2", "1-3", "2-3"]);
    assert.deepEqual(pairsOf(tags, [pairKey(3, 1)]), ["1-2", "2-3"]);
  });

  it("orders by the combined Item count and then by the two ids", () => {
    assert.deepEqual(
      pairsOf([
        tag(1, "aa", 1),
        tag(2, "a-a", 1),
        tag(3, "bb", 5),
        tag(4, "b b", 5),
        tag(5, "cc", 1),
        tag(6, "c c", 1),
      ]),
      ["3-4", "1-2", "5-6"],
    );
  });

  it("takes disjoint pairs only: three spellings of one concept send one pair", () => {
    const pairs = candidatePairs([tag(1, "ab", 3), tag(2, "a-b", 2), tag(3, "a b", 1)], new Set());

    assert.deepEqual(
      disjointPairs(pairs).map(({ low, high }) => `${String(low)}-${String(high)}`),
      ["1-2"],
    );
  });

  it("takes at most 20 disjoint pairs", () => {
    const tags = Array.from({ length: 25 }, (_, at) => [
      tag(at * 2 + 1, `word${String(at)}x`),
      tag(at * 2 + 2, `word ${String(at)}x`),
    ]).flat();

    assert.equal(candidatePairs(tags, new Set()).length, 25);
    assert.equal(disjointPairs(candidatePairs(tags, new Set())).length, PROPOSALS_MAX);
  });
});

function sent(id: number, name: string): SentPair {
  const side = (at: number) => ({ id: at, name: `${name}${String(at)}`, items: 1, topics: ["T"] });

  return { low: side(id), high: side(id + 1) };
}

describe("the input of the Tag-merge run holds whole pairs within 14,000 bytes", () => {
  it("adds each pair whole in order and skips one that does not fit", () => {
    const small = sent(1, "a");
    const big = sent(3, "b".repeat(PROPOSALS_INPUT_BYTES));
    const last = sent(5, "c");
    const { input, sent: kept } = proposalsInput([small, big, last]);

    assert.deepEqual(kept, [small, last]);
    assert.equal(
      input,
      JSON.stringify({
        pairs: [
          [small.low, small.high],
          [last.low, last.high],
        ],
      }),
    );
    assert.ok(new TextEncoder().encode(input).length <= PROPOSALS_INPUT_BYTES);
  });
});

function merge(from: number, into: number, reason = "The same concept.") {
  return { from, into, reason };
}

describe("the result of the Tag-merge run names only sent pairs, each Tag once, at most 20 merges, each with a short plain reason", () => {
  const SENT_PAIRS = [sent(1, "a"), sent(3, "b"), sent(5, "c")];

  const resultAccepts = (merges: readonly unknown[]) =>
    proposalsTask(SENT_PAIRS).schema.safeParse({ merges }).success;

  it("takes a pair either way round and zero merges", () => {
    assert.equal(resultAccepts([]), true);
    assert.equal(resultAccepts([merge(1, 2), merge(4, 3)]), true);
  });

  it("refuses a Tag in two merges, an id or pair that was not sent, and from equal to into", () => {
    assert.equal(resultAccepts([merge(1, 2), merge(2, 1)]), false);
    assert.equal(resultAccepts([merge(1, 3)]), false);
    assert.equal(resultAccepts([merge(1, 99)]), false);
    assert.equal(resultAccepts([merge(1, 1)]), false);
  });

  it("takes 20 merges of 20 different sent pairs and refuses 21", () => {
    const sentPairs = Array.from({ length: 21 }, (_, at) => sent(1 + 2 * at, "p"));
    const merges = sentPairs.map(({ low, high }) => merge(low.id, high.id));

    const accepts = (count: number) =>
      proposalsTask(sentPairs).schema.safeParse({ merges: merges.slice(0, count) }).success;

    assert.deepEqual([accepts(20), accepts(21)], [true, false]);
  });

  it("takes a reason of 160 characters, refuses 161 and refuses each forbidden character", () => {
    assert.equal(resultAccepts([merge(1, 2, "r".repeat(160))]), true);
    assert.equal(resultAccepts([merge(1, 2, "r".repeat(161))]), false);
    assert.equal(resultAccepts([merge(1, 2, "")]), false);

    for (const text of ["a [b]", "a {b}", 'a "b"', "a\nb", "a\rb"]) {
      assert.equal(resultAccepts([merge(1, 2, text)]), false, text);
    }
  });
});
