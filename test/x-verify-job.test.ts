import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Instance } from "./instance.ts";
import { until } from "./related-fixtures.ts";
import { digestOf } from "./x-intake-bodies.ts";
import { addressOf, insertedXItem } from "./x-intake-fixtures.ts";
import { commentCount, itemRow, verificationRow, verifyJobStates } from "./x-intake-rows.ts";
import { xClient } from "./x-thread-client.ts";
import { authored, reply, thread } from "./x-thread-fixtures.ts";
import {
  allJudged,
  storedForVerification,
  valueOf,
  withOneReply,
} from "./x-verify-job-fixtures.ts";

const FRESH = "1000000000000000002";
const REFUSED = "1000000000000000003";
const KEPT = "1000000000000000004";
const PASTED = "1000000000000000005";

describe("a thread waits as stored state until every post of it was judged, and is shown only then", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("shows the replies that were judged, without the one that was rejected, publishes the Digest that came with the thread, ends with the row for the replies that are missing, and forgets the stored thread", async () => {
    const itemId = insertedXItem(instance, FRESH);
    const value = valueOf(FRESH);
    const [first] = value.replies;

    await storedForVerification(instance, itemId, FRESH, value, {
      judged: allJudged(value, { [first?.id ?? ""]: "rejected" }),
      digest: JSON.stringify(digestOf()),
    });

    const detail = await until(
      () => instance.detail(itemId),
      ({ digestTitle }) => digestTitle !== null,
    );

    const item = itemRow(instance, itemId);

    assert.deepEqual([item.fetch_result, item.status], ["ok", "ready"]);
    assert.equal(detail.digestTitle, digestOf().title);
    assert.equal(detail.comments.received, value.replies.length - 1);
    assert.equal(detail.comments.nodes.at(-1)?.kind, "more");
    assert.equal(verificationRow(instance, itemId), undefined);
  });

  it("shows nothing and ends the Item as unreadable when the post itself was rejected", async () => {
    const itemId = insertedXItem(instance, REFUSED);
    const value = valueOf(REFUSED);

    await storedForVerification(instance, itemId, REFUSED, value, {
      judged: allJudged(value, { [REFUSED]: "rejected" }),
    });

    const item = itemRow(instance, itemId);

    assert.deepEqual([item.fetch_result, item.status], ["unreadable", "ready"]);
    assert.equal(commentCount(instance, itemId), 0);
    assert.equal(verificationRow(instance, itemId), undefined);
  });

  it("keeps the saved thread and ends unreadable when the verified thread has fewer replies than the saved one", async () => {
    const { saved, itemIdOf } = xClient(instance);

    await saved({ url: addressOf(KEPT), content: JSON.stringify(authored(KEPT)) });

    const itemId = itemIdOf(KEPT);
    const receivedBefore = (await instance.detail(itemId)).comments.received;
    const fewer = withOneReply(KEPT);

    await storedForVerification(instance, itemId, KEPT, fewer, { judged: allJudged(fewer) });

    assert.equal(itemRow(instance, itemId).fetch_result, "unreadable");
    assert.equal((await instance.detail(itemId)).comments.received, receivedBefore);
  });

  it("drops the stored thread and its job when content is saved for the Item while the job waits, so the saved content stays", async () => {
    const { saved } = xClient(instance);
    const itemId = insertedXItem(instance, PASTED);
    const stored = valueOf(PASTED);

    await storedForVerification(instance, itemId, PASTED, stored, {
      judged: allJudged(stored),
      waiting: true,
    });

    assert.deepEqual(
      verifyJobStates(instance, itemId).map(({ state }) => state),
      ["queued"],
    );

    const pasted = thread([reply(1000000000000000041n, PASTED)], { id: PASTED });

    await saved({ url: addressOf(PASTED), content: JSON.stringify(pasted) });
    await instance.settledItem(itemId);

    assert.deepEqual(
      verifyJobStates(instance, itemId).map(({ state }) => state),
      ["done"],
    );
    assert.equal(verificationRow(instance, itemId), undefined);
    assert.equal(commentCount(instance, itemId), 1);
  });
});
