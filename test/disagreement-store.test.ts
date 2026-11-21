import assert from "node:assert/strict";
import { type TestContext, describe, it } from "node:test";

import { applyBotResult, openJobOf, sentTask } from "./bot-kinds-fixtures.ts";
import { botInstance } from "./bot-task-fixtures.ts";
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
} from "./disagreement-fixtures.ts";
import type { Instance } from "./instance.ts";
import { topicId } from "./topic-accept-fixtures.ts";

const REASON = "One says the setting is on, the other says it is off.";

async function readingLibrary(t: Readonly<TestContext>): Promise<Instance> {
  const instance = await botInstance();
  t.after(() => instance.close());
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
  it("stores a returned pair as an open row with both Digest tokens, writes the membership of every sent Topic and completes the task", async (t) => {
    const instance = await readingLibrary(t);
    const sent = await sentTask(
      instance,
      await openJobOf(instance, { kind: "disagreement_proposals", itemId: 5 }),
    );

    assert.deepEqual(
      sentOf(instance)[0]?.topics.map(({ name }) => name),
      ["Other", "Reading"],
    );

    await applyBotResult(instance, sent, { disagreements: [{ a: 2, b: 1, reason: REASON }] });

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
      { topic_id: topicId(instance, "Reading"), members: membersText(instance, [1, 2, 3]) },
      { topic_id: topicId(instance, "Other"), members: membersText(instance, [4, 5]) },
    ]);
    assert.equal(taskState(instance, sent.id), "done");
  });

  ["open", "rejected"].forEach((state) => {
    it(`keeps the existing ${state} row when an answer names the same two Items again`, async (t) => {
      const instance = await readingLibrary(t);
      const sent = await sentTask(
        instance,
        await openJobOf(instance, { kind: "disagreement_proposals", itemId: 5 }),
      );
      proposeDisagreement(instance, [1, 2], state);
      const existing = disagreementRows(instance);

      await applyBotResult(instance, sent, {
        disagreements: [{ a: 2, b: 1, reason: "A second reason." }],
      });

      assert.deepEqual(disagreementRows(instance), existing);
      assert.equal(taskState(instance, sent.id), "done");
    });
  });

  it("writes nothing and fails the task as stale when a Digest of a sent Topic was replaced after the read", async (t) => {
    const instance = await readingLibrary(t);
    const sent = await sentTask(
      instance,
      await openJobOf(instance, { kind: "disagreement_proposals", itemId: 5 }),
    );
    const unchanged = checksOf(instance);

    await replaceDigest(instance, 2, { topic: "Reading", summary: "A replaced summary." });
    await applyBotResult(instance, sent, { disagreements: [{ a: 1, b: 2, reason: REASON }] });

    assert.deepEqual(disagreementRows(instance), []);
    assert.deepEqual(checksOf(instance), unchanged);
    assert.equal(taskState(instance, sent.id), "failed");
  });

  it("replaces the hidden open row of the same pair with a row on the new Digest tokens", async (t) => {
    const instance = await readingLibrary(t);
    const stale = proposeDisagreement(instance, [1, 2]);

    await replaceDigest(instance, 2, { topic: "Reading", summary: "A replaced summary." });

    const sent = await sentTask(
      instance,
      await openJobOf(instance, { kind: "disagreement_proposals", itemId: 5 }),
    );

    await applyBotResult(instance, sent, { disagreements: [{ a: 1, b: 2, reason: REASON }] });

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
