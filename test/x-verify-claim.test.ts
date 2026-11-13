import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { executeClaimed } from "../src/core/jobs.ts";
import { Instance } from "./instance.ts";
import { addressOf, insertedXItem } from "./x-intake-fixtures.ts";
import { commentCount, itemRow, verificationRow } from "./x-intake-rows.ts";
import { xClient } from "./x-thread-client.ts";
import { authored, reply, thread } from "./x-thread-fixtures.ts";
import {
  claimedBeforeNewerAnswer,
  dueKindsBesideVerification,
  jobAfterNewerAnswer,
  storedUnreadably,
} from "./x-verify-claim-fixtures.ts";
import { valueOf } from "./x-verify-job-fixtures.ts";

const BROKEN = "1000000000000000006";
const CLAIMED = "1000000000000000007";
const DIGESTED = "1000000000000000008";
const RESTARTED = "1000000000000000009";
const SHORTENED = "1000000000000000010";

describe("a verification job ends its own stored row and no newer one", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("ends the Item as unreadable and forgets a stored row that cannot be read", async () => {
    const itemId = insertedXItem(instance, BROKEN);

    await storedUnreadably(instance, itemId, BROKEN, valueOf(BROKEN));
    await instance.settledItem(itemId);

    assert.equal(itemRow(instance, itemId).fetch_result, "unreadable");
    assert.equal(verificationRow(instance, itemId), undefined);
  });

  it("keeps a thread that was stored after the job was claimed when that job ends out of attempts", async () => {
    const itemId = insertedXItem(instance, CLAIMED);
    const claimed = await claimedBeforeNewerAnswer(instance, itemId, CLAIMED, valueOf(CLAIMED));

    assert.equal(claimed?.itemId, itemId);

    if (claimed === null) return;

    await executeClaimed(instance.core, claimed);
    await instance.settledItem(itemId);

    assert.equal(itemRow(instance, itemId).fetch_result, "ok");
    assert.equal(commentCount(instance, itemId), valueOf(CLAIMED).replies.length);
    assert.equal(verificationRow(instance, itemId), undefined);
  });

  it("keeps a Digest job waiting while a verification of the Item is open", async () => {
    const itemId = insertedXItem(instance, DIGESTED);

    assert.deepEqual(
      await dueKindsBesideVerification(instance, itemId, DIGESTED, valueOf(DIGESTED)),
      ["x_verify"],
    );
  });

  it("starts a waiting job over when a newer answer is stored for the Item", async () => {
    const itemId = insertedXItem(instance, RESTARTED);
    const job = await jobAfterNewerAnswer(instance, itemId, RESTARTED, valueOf(RESTARTED));

    assert.deepEqual([job?.attempts, job?.waitReason], [0, null]);
    assert.ok((job?.nextAttemptAt ?? Infinity) <= Date.now());
  });

  it("refuses a Paste of an X thread with fewer replies than the saved one and keeps the saved one", async () => {
    const { saved, refused, itemIdOf } = xClient(instance);

    await saved({ url: addressOf(SHORTENED), content: JSON.stringify(authored(SHORTENED)) });

    const itemId = itemIdOf(SHORTENED);
    const savedComments = commentCount(instance, itemId);
    const fewer = thread([reply(1000000000000000031n, SHORTENED)], { id: SHORTENED });

    assert.match(
      await refused({ url: addressOf(SHORTENED), content: JSON.stringify(fewer) }),
      /fewer replies/u,
    );
    assert.equal(commentCount(instance, itemId), savedComments);
  });
});
