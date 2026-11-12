import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { readDisagreementInput } from "../src/core/disagreement-input.ts";
import { disagreementRun } from "../src/core/disagreement-job.ts";
import { refusedByGuard } from "../src/core/guards.ts";
import { storedOutcome } from "../src/core/weekly-model-run.ts";
import {
  checksOf,
  disagreementRows,
  membersText,
  pasteItems,
  proposeDisagreement,
  replaceDigest,
  runningTask,
  taskState,
  tokenOf,
  topicIdOf,
} from "./disagreement-fixtures.ts";
import { Instance } from "./instance.ts";
import { interrupted } from "./interrupted-database.ts";

const REASON = "One says the setting is on, the other says it is off.";

type Reading = Readonly<{
  instance: Instance;
  db: ReturnType<typeof interrupted>;
  sent: Awaited<ReturnType<typeof sentTopics>>;
}>;

const sentTopics = async (db: ReturnType<typeof interrupted>) => {
  const read = await readDisagreementInput(db);

  assert.ok(read !== null);

  return read.sent;
};

async function apply(
  { db, sent }: Readonly<Pick<Reading, "db" | "sent">>,
  taskId: number,
  disagreements: readonly Readonly<{ a: number; b: number; reason: string }>[],
): Promise<void> {
  const { writes } = storedOutcome(db, disagreementRun, {
    sent,
    taskId,
    result: { disagreements },
  });

  const [head, ...rest] = writes;

  assert.ok(head !== undefined);
  await db.batch([head, ...rest]);
}

async function start(): Promise<Reading> {
  const instance = await Instance.start();

  await instance.setUp();
  await pasteItems(instance, [
    { topic: "Reading" },
    { topic: "Reading" },
    { topic: "Reading" },
    { topic: "Other" },
    { topic: "Other" },
  ]);

  const db = interrupted(instance.databaseFile, () => false, {});

  return { instance, db, sent: await sentTopics(db) };
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

    await apply(reading, taskId, [{ a: 2, b: 1, reason: REASON }]);

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

    await apply(reading, taskId, [{ a: 1, b: 2, reason: "A second reason." }]);
    assert.deepEqual(disagreementRows(instance), [existing]);

    assert.equal(
      (await instance.send("POST", `/api/proposals/${String(existing.id)}/reject`)).status,
      200,
    );
    await apply(reading, runningTask(instance), [{ a: 2, b: 1, reason: "A third reason." }]);
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

  it("writes nothing and refuses the batch when a Digest of a sent Topic was replaced after the read", async () => {
    const { instance } = reading;
    const taskId = runningTask(instance);
    const unchanged = checksOf(instance);

    await replaceDigest(instance, 2, { topic: "Reading", summary: "A replaced summary." });

    await assert.rejects(apply(reading, taskId, [{ a: 1, b: 2, reason: REASON }]), (error) =>
      refusedByGuard(error),
    );
    assert.deepEqual(disagreementRows(instance), []);
    assert.deepEqual(checksOf(instance), unchanged);
    assert.equal(taskState(instance, taskId), "running");
  });

  it("writes nothing and refuses the batch when the AI task is no longer running", async () => {
    const { instance } = reading;
    const fresh = { db: reading.db, sent: await sentTopics(reading.db) };
    const taskId = runningTask(instance, "failed");

    await assert.rejects(apply(fresh, taskId, [{ a: 1, b: 2, reason: REASON }]), (error) =>
      refusedByGuard(error),
    );
    assert.deepEqual(disagreementRows(instance), []);
    assert.deepEqual(checksOf(instance), []);
  });
});

describe("the store of a disagreement run next to a row that a new Digest made stale", () => {
  let reading: Reading;

  before(async () => {
    reading = await start();
  });

  after(() => reading.instance.close());

  it("replaces the hidden open row of the same pair with a row on the new Digest tokens", async () => {
    const { instance, db } = reading;
    const stale = proposeDisagreement(instance, [1, 2]);

    await replaceDigest(instance, 2, { topic: "Reading", summary: "A replaced summary." });

    const sent = await sentTopics(db);

    await apply({ db, sent }, runningTask(instance), [{ a: 1, b: 2, reason: REASON }]);

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
