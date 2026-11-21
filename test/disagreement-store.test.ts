import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { botInstance } from "./bot-task-fixtures.ts";
import { answerDisagreement, sentDisagreement } from "./disagreement-answer.ts";
import {
  checksOf,
  disagreementRows,
  membersText,
  pasteItems,
  proposeDisagreement,
  replaceDigest,
  sentOf,
  taskState,
  tokenOf,
  topicIdOf,
} from "./disagreement-fixtures.ts";
import type { Instance } from "./instance.ts";

const REASON = "One says the setting is on, the other says it is off.";

async function start(): Promise<Instance> {
  const instance = await botInstance();

  await pasteItems(instance, [
    { topic: "Reading" },
    { topic: "Reading" },
    { topic: "Reading" },
    { topic: "Other" },
    { topic: "Other" },
  ]);

  return instance;
}

describe("a disagreement answer", () => {
  let instance: Instance;

  beforeEach(async () => {
    instance = await start();
  });

  afterEach(() => instance.close());

  it("stores a returned pair as an open row with both Digest tokens, writes the membership of every sent Topic and completes the task", async () => {
    const sent = await sentDisagreement(instance, 5);

    assert.deepEqual(
      sentOf(instance)[0]?.topics.map(({ name }) => name),
      ["Other", "Reading"],
    );

    await answerDisagreement(instance, sent, [{ a: 2, b: 1, reason: REASON }]);

    assert.deepEqual(
      disagreementRows(instance).map((row) => [
        row.from_item_id,
        row.into_item_id,
        row.from_digest,
        row.into_digest,
        row.state,
        row.reason,
      ]),
      [[1, 2, tokenOf(instance, 1), tokenOf(instance, 2), "open", REASON]],
    );
    assert.deepEqual(checksOf(instance), [
      { topic_id: topicIdOf(instance, "Reading"), members: membersText(instance, [1, 2, 3]) },
      { topic_id: topicIdOf(instance, "Other"), members: membersText(instance, [4, 5]) },
    ]);
    assert.equal(taskState(instance, sent.id), "done");
  });

  ["open", "rejected"].forEach((state) => {
    it(`keeps the existing ${state} row when an answer names the same two Items again`, async () => {
      const sent = await sentDisagreement(instance, 5);
      proposeDisagreement(instance, [1, 2], state);
      const existing = disagreementRows(instance);

      await answerDisagreement(instance, sent, [{ a: 2, b: 1, reason: "A second reason." }]);

      assert.deepEqual(disagreementRows(instance), existing);
      assert.equal(taskState(instance, sent.id), "done");
    });
  });

  it("writes nothing and fails the task as stale when a Digest of a sent Topic was replaced after the read", async () => {
    const sent = await sentDisagreement(instance, 5);
    const unchanged = checksOf(instance);

    await replaceDigest(instance, 2, { topic: "Reading", summary: "A replaced summary." });
    await answerDisagreement(instance, sent, [{ a: 1, b: 2, reason: REASON }]);

    assert.deepEqual(disagreementRows(instance), []);
    assert.deepEqual(checksOf(instance), unchanged);
    assert.equal(taskState(instance, sent.id), "failed");
  });

  it("replaces the hidden open row of the same pair with a row on the new Digest tokens", async () => {
    const stale = proposeDisagreement(instance, [1, 2]);

    await replaceDigest(instance, 2, { topic: "Reading", summary: "A replaced summary." });

    const sent = await sentDisagreement(instance, 5);

    await answerDisagreement(instance, sent, [{ a: 1, b: 2, reason: REASON }]);

    const stored = disagreementRows(instance);

    assert.equal(stored.length, 1);
    assert.equal(
      stored.some(({ id }) => id === stale),
      false,
    );
    assert.deepEqual(
      stored.map(({ state, from_digest: from, into_digest: into }) => [state, from, into]),
      [["open", tokenOf(instance, 1), tokenOf(instance, 2)]],
    );
  });
});
