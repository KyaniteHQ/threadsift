import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  disagreementRows,
  proposeDisagreement,
  runWeek,
  seedDigested,
  seedTopics,
  sentOf,
} from "./disagreement-fixtures.ts";
import { acceptStatus, pinRows, replaceDigestToken } from "./disagreement-pin-fixtures.ts";
import { Instance } from "./instance.ts";
import { readPage } from "./lost-highlight-fixtures.ts";
import { SECRET_KEY, saveProvider } from "./related-fixtures.ts";

describe("the weekly disagreement check treats a pair with a current Pin as decided", () => {
  let instance: Instance;
  let duplicate: number;
  let rejected: number;
  let staleRow: number;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    seedTopics(instance, { 1: "Reading" });
    seedDigested(
      instance,
      Array.from({ length: 10 }, (_, at) => ({ id: at + 1, topic: 1 })),
    );
    await acceptStatus(instance, proposeDisagreement(instance, [1, 2]));
    duplicate = proposeDisagreement(instance, [1, 2]);
    rejected = proposeDisagreement(instance, [3, 4], "rejected");
    await acceptStatus(instance, proposeDisagreement(instance, [5, 6]));
    replaceDigestToken(instance, 5, 900);
    staleRow = proposeDisagreement(instance, [5, 6]);
    await acceptStatus(instance, proposeDisagreement(instance, [7, 8]));
    replaceDigestToken(instance, 7, 901);
    await saveProvider(instance);
  });

  after(() => instance.close());

  it("hides an open row whose pair has a current Pin, and lists a row whose Pin is stale", async () => {
    assert.deepEqual(
      (await readPage(instance)).proposals.map(({ id }) => id),
      [staleRow],
    );
    assert.equal(
      disagreementRows(instance).some(({ id }) => id === duplicate),
      true,
    );
  });

  it("deletes the hidden open row at the next weekly stage, keeps a rejected row and the row whose Pin is stale, and leaves every Pin", async () => {
    const pins = pinRows(instance);

    await runWeek(instance);

    assert.deepEqual(
      disagreementRows(instance).map(({ id }) => id),
      [rejected, staleRow],
    );
    assert.deepEqual(pinRows(instance), pins);
  });

  it("sends the pinned pair in decided and leaves out a pair whose Pin is stale and has no row", () => {
    const [sent] = sentOf(instance).slice(-1);

    assert.equal(
      sent?.decided.some(([low, high]) => low === 1 && high === 2),
      true,
    );
    assert.equal(
      sent?.decided.some(([low, high]) => low === 7 && high === 8),
      false,
    );
    assert.equal(
      sent?.decided.some(([low, high]) => low === 5 && high === 6),
      true,
    );
  });
});
