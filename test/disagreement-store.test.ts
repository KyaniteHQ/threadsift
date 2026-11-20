import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { botInstance, selectGrokBot } from "./bot-task-fixtures.ts";
import { applyAnswer } from "./disagreement-apply.ts";
import {
  checksOf,
  disagreementRows,
  membersText,
  pasteItems,
  proposeDisagreement,
  replaceDigest,
  runningTask,
  sentTopics,
  taskState,
  tokenOf,
  topicIdOf,
} from "./disagreement-fixtures.ts";
import type { Instance } from "./instance.ts";

const REASON = "One says the setting is on, the other says it is off.";

type Reading = Readonly<{
  instance: Instance;
  sent: Awaited<ReturnType<typeof sentTopics>>;
}>;

async function start(): Promise<Reading> {
  const instance = await botInstance();

  await pasteItems(instance, [
    { topic: "Reading" },
    { topic: "Reading" },
    { topic: "Reading" },
    { topic: "Other" },
    { topic: "Other" },
  ]);

  await selectGrokBot(instance);

  return { instance, sent: await sentTopics(instance.core.db) };
}

describe("the guarded store of a disagreement run, applied to the outcome the production handler builds", () => {
  let reading: Reading;

  before(async () => {
    reading = await start();
  });

  after(() => reading.instance.close());

  it("stores a returned pair as an open row with both Digest tokens, writes the membership of every sent Topic and completes the task, in one batch", async () => {
    const { instance, sent } = reading;
    const taskId = runningTask(instance);

    assert.deepEqual(
      sent.map(({ name }) => name),
      ["Other", "Reading"],
    );

    await applyAnswer(reading, taskId, [{ a: 2, b: 1, reason: REASON }]);

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
    assert.equal(taskState(instance, taskId), "done");
  });

  it("keeps the existing row, open or rejected, when a returned pair names the same two Items in either order", async () => {
    const { instance } = reading;
    const [existing] = disagreementRows(instance);

    assert.ok(existing !== undefined);

    const taskId = runningTask(instance);

    await applyAnswer(reading, taskId, [{ a: 1, b: 2, reason: "A second reason." }]);
    assert.deepEqual(disagreementRows(instance), [existing]);

    assert.equal(
      (await instance.send("POST", `/api/proposals/${String(existing.id)}/reject`)).status,
      200,
    );
    await applyAnswer(reading, runningTask(instance), [{ a: 2, b: 1, reason: "A third reason." }]);
    assert.deepEqual(
      disagreementRows(instance).map(({ id, state }) => [id, state]),
      [[existing.id, "rejected"]],
    );
  });
});

describe("the guard of the store of a disagreement run", () => {
  let reading: Reading;

  before(async () => {
    reading = await start();
  });

  after(() => reading.instance.close());

  it("writes nothing and fails the task as stale when a Digest of a sent Topic was replaced after the read", async () => {
    const { instance } = reading;
    const taskId = runningTask(instance);
    const unchanged = checksOf(instance);

    await replaceDigest(instance, 2, { topic: "Reading", summary: "A replaced summary." });
    await applyAnswer(reading, taskId, [{ a: 1, b: 2, reason: REASON }]);

    assert.deepEqual(disagreementRows(instance), []);
    assert.deepEqual(checksOf(instance), unchanged);
    assert.equal(taskState(instance, taskId), "failed");
  });
});

describe("the store of a disagreement run next to a row that a new Digest made stale", () => {
  let reading: Reading;

  before(async () => {
    reading = await start();
  });

  after(() => reading.instance.close());

  it("replaces the hidden open row of the same pair with a row on the new Digest tokens", async () => {
    const { instance } = reading;
    const stale = proposeDisagreement(instance, [1, 2]);

    await replaceDigest(instance, 2, { topic: "Reading", summary: "A replaced summary." });

    const sent = await sentTopics(instance.core.db);

    await applyAnswer({ instance, sent }, runningTask(instance), [{ a: 1, b: 2, reason: REASON }]);

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
