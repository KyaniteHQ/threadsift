import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { readDisagreementInput } from "../src/core/disagreement-input.ts";
import { disagreementRun } from "../src/core/disagreement-job.ts";
import { storedOutcome } from "../src/core/weekly-model-run.ts";
import {
  disagreementRows,
  proposeDisagreement,
  runningTask,
  seedDigested,
  seedTopics,
  tokenOf,
} from "./disagreement-fixtures.ts";
import { acceptStatus, pinRows, replaceDigestToken } from "./disagreement-pin-fixtures.ts";
import { Instance } from "./instance.ts";
import { interrupted } from "./interrupted-database.ts";

const REASON = "One says the setting is on, the other says it is off.";

type Pair = Readonly<{ a: number; b: number; reason: string }>;

async function storeAnswer(instance: Instance, disagreements: readonly Pair[]): Promise<void> {
  const db = interrupted(instance.databaseFile, () => false, {});
  const read = await readDisagreementInput(db);

  assert.ok(read !== null);

  const { writes } = storedOutcome(db, disagreementRun, {
    sent: read.sent,
    taskId: runningTask(instance),
    result: { disagreements },
  });

  const [head, ...rest] = writes;

  assert.ok(head !== undefined);
  await db.batch([head, ...rest]);
}

describe("the guarded store of a weekly disagreement answer, applied to the outcome the production handler builds", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    seedTopics(instance, { 1: "Reading" });
    seedDigested(
      instance,
      Array.from({ length: 4 }, (_, at) => ({ id: at + 1, topic: 1 })),
    );
    await acceptStatus(instance, proposeDisagreement(instance, [1, 2]));
  });

  after(() => instance.close());

  it("stores a returned pair that has no current Pin and drops the returned pair that has one, named in the reverse order", async () => {
    await storeAnswer(instance, [
      { a: 2, b: 1, reason: REASON },
      { a: 3, b: 4, reason: REASON },
    ]);

    assert.deepEqual(
      disagreementRows(instance).map((row) => [row.from_item_id, row.into_item_id, row.state]),
      [[3, 4, "open"]],
    );
    assert.deepEqual(
      pinRows(instance).map((pin) => [pin.from_item_id, pin.into_item_id]),
      [[1, 2]],
    );
  });

  it("stores the pair again once either Digest of its Pin has changed, with the new Digest tokens", async () => {
    replaceDigestToken(instance, 1, 900);
    await storeAnswer(instance, [{ a: 1, b: 2, reason: REASON }]);

    assert.deepEqual(
      disagreementRows(instance)
        .filter((row) => row.from_item_id === 1)
        .map((row) => [row.into_item_id, row.from_digest, row.into_digest, row.state]),
      [[2, 900, tokenOf(instance, 2), "open"]],
    );
  });
});
