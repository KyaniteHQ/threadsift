import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { candidatePairs, disjointPairs } from "../src/core/proposal-candidates.ts";
import { proposalsInput } from "../src/core/proposal-input.ts";
import {
  PROPOSALS_INPUT_BYTES,
  type ProposalTopic,
  type SentPair,
  topicProposalsTask,
} from "../src/core/proposal-task.ts";

function topic(id: number, key: string, items = 1) {
  return { id, key, items };
}

const pairsOf = (topics: readonly ReturnType<typeof topic>[], known: readonly string[] = []) =>
  candidatePairs(topics, new Set(known)).map(({ low, high }) => [low, high]);

describe("the Topic check pairs Topic keys by the same loose key or an initialism", () => {
  it("pairs spellings of one key and a short form, and not subjects that only share letters", () => {
    const topics = [
      topic(1, "machine learning", 3),
      topic(2, "machine-learning", 2),
      topic(3, "ml", 1),
      topic(4, "java"),
      topic(5, "javascript"),
      topic(6, "games", 2),
      topic(7, "game", 2),
      topic(8, "deep learning"),
    ];

    assert.deepEqual(pairsOf(topics), [
      [1, 2],
      [1, 3],
      [6, 7],
      [2, 3],
    ]);
  });

  it("skips a pair that has a row, in either direction, and a Topic with no Item", () => {
    const topics = [topic(1, "games"), topic(2, "game"), topic(3, "game", 0)];

    assert.deepEqual(pairsOf(topics, ["1:2"]), []);
    assert.deepEqual(pairsOf(topics), [[1, 2]]);
    assert.deepEqual(
      disjointPairs(candidatePairs([topic(1, "a b"), topic(2, "ab"), topic(3, "ab")], new Set())),
      [{ low: 1, high: 2, weight: 2 }],
    );
  });
});

function sent(id: number, name: string): SentPair<ProposalTopic> {
  const side = (at: number) => ({ id: at, name: `${name}${String(at)}`, items: 1, tags: ["t"] });

  return { low: side(id), high: side(id + 1) };
}

describe("the input of the Topic run holds whole pairs within 14,000 bytes", () => {
  it("adds each pair whole in order and skips one that does not fit", () => {
    const small = sent(1, "a");
    const big = sent(3, "b".repeat(PROPOSALS_INPUT_BYTES));
    const last = sent(5, "c");
    const { input, sent: kept } = proposalsInput([small, big, last]);

    assert.deepEqual(kept, [small, last]);
    assert.ok(new TextEncoder().encode(input).length <= PROPOSALS_INPUT_BYTES);
    assert.deepEqual(JSON.parse(input), {
      pairs: [
        [small.low, small.high],
        [last.low, last.high],
      ],
    });
  });
});

function merge(from: number, into: number, reason = "The same subject.") {
  return { from, into, reason };
}

describe("the result of the Topic run names only sent pairs, each Topic once, at most 20 merges, each with a short plain reason", () => {
  const SENT_PAIRS = [sent(1, "a"), sent(3, "b"), sent(5, "c")];

  const accepts = (merges: readonly unknown[], pairs = SENT_PAIRS) =>
    topicProposalsTask(pairs).schema.safeParse({ merges }).success;

  it("takes a pair either way round and zero merges", () => {
    assert.equal(accepts([]), true);
    assert.equal(accepts([merge(1, 2), merge(4, 3)]), true);
  });

  it("refuses a Topic in two merges, an id or pair that was not sent, and from equal to into", () => {
    assert.equal(accepts([merge(1, 2), merge(2, 1)]), false);
    assert.equal(accepts([merge(1, 3)]), false);
    assert.equal(accepts([merge(1, 99)]), false);
    assert.equal(accepts([merge(1, 1)]), false);
  });

  it("takes 20 merges and refuses 21", () => {
    const pairs = Array.from({ length: 21 }, (_, at) => sent(1 + 2 * at, "p"));
    const merges = pairs.map(({ low, high }) => merge(low.id, high.id));

    assert.deepEqual([accepts(merges.slice(0, 20), pairs), accepts(merges, pairs)], [true, false]);
  });

  it("takes a reason of 160 characters, refuses 161 and refuses each forbidden character", () => {
    assert.equal(accepts([merge(1, 2, "r".repeat(160))]), true);
    assert.equal(accepts([merge(1, 2, "r".repeat(161))]), false);
    assert.equal(accepts([merge(1, 2, "")]), false);

    for (const text of ["a [b]", "a {b}", 'a "b"', "a\nb", "a\rb"]) {
      assert.equal(accepts([merge(1, 2, text)]), false, text);
    }
  });
});
