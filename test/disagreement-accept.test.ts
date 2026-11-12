import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import {
  disagreementRows,
  proposeDisagreement,
  replaceDigest,
  seedDigested,
  seedTopics,
} from "./disagreement-fixtures.ts";
import { pinRows, acceptStatus } from "./disagreement-pin-fixtures.ts";
import { Instance } from "./instance.ts";
import { readPage } from "./lost-highlight-fixtures.ts";
import { SECRET_KEY, exec } from "./related-fixtures.ts";

describe("Accept of a disagreement keeps the pair as a Pin", () => {
  let instance: Instance;
  let token: string;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    seedTopics(instance, { 1: "Reading", 2: "Other" });
    seedDigested(instance, [
      ...Array.from({ length: 8 }, (_, at) => ({ id: at + 1, topic: 1 })),
      { id: 9, topic: 2 },
      { id: 10, topic: 1 },
      { id: 11, topic: 1 },
    ]);
    ({ value: token } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "disagreement-accept",
    }));
  });

  after(() => instance.close());

  it("stores one Pin with the pair key, the reason and both Digest tokens, deletes the row, lists it no more and answers 404 the second time, with no Provider saved", async () => {
    const id = proposeDisagreement(instance, [1, 2]);

    assert.deepEqual(await acceptStatus(instance, id), [200, { state: "done" }]);
    assert.deepEqual(
      pinRows(instance).map(({ id: _id, ...pin }) => pin),
      [
        {
          from_key: "1:2",
          from_name: "They give opposite advice.",
          from_item_id: 1,
          into_item_id: 2,
          from_digest: 1,
          into_digest: 2,
        },
      ],
    );
    assert.deepEqual(disagreementRows(instance), []);
    assert.deepEqual((await readPage(instance)).proposals, []);
    assert.deepEqual(await acceptStatus(instance, id), [404, { error: "Not found" }]);
  });

  it("answers 409 not-open for a rejected row and keeps it", async () => {
    const id = proposeDisagreement(instance, [3, 4], "rejected");

    assert.deepEqual(await acceptStatus(instance, id), [409, { error: "not-open" }]);
    assert.deepEqual(
      disagreementRows(instance).map((row) => [row.id, row.state]),
      [[id, "rejected"]],
    );
    assert.equal(pinRows(instance).length, 1);
  });

  it("refuses an agent token with 403 and a signed-out call with 401, and stores nothing", async () => {
    const id = proposeDisagreement(instance, [5, 6]);

    assert.equal(
      (await instance.sendWithToken(token, "POST", `/api/proposals/${String(id)}/accept`)).status,
      403,
    );
    assert.equal(
      (await instance.fetch(`/api/proposals/${String(id)}/accept`, { method: "POST" })).status,
      401,
    );
    assert.equal(pinRows(instance).length, 1);
    assert.equal(disagreementRows(instance).filter((row) => row.id === id).length, 1);
  });

  it("answers 409 not-current when either Item has a newer Digest, and keeps the row with no Pin", async () => {
    const id = proposeDisagreement(instance, [10, 11]);

    replaceDigest(instance, 11, 900);
    assert.deepEqual(await acceptStatus(instance, id), [409, { error: "not-current" }]);
    assert.equal(pinRows(instance).length, 1);
    assert.equal(
      disagreementRows(instance).some((row) => row.id === id),
      true,
    );
  });

  it("answers 409 not-current when the two Items sit under two Topics, and keeps the row with no Pin", async () => {
    const id = proposeDisagreement(instance, [7, 8]);

    exec(instance, "update items set topic_id = 2 where id = 8");
    assert.deepEqual(await acceptStatus(instance, id), [409, { error: "not-current" }]);
    assert.equal(pinRows(instance).length, 1);
    exec(instance, "update items set topic_id = 1 where id = 8");
    assert.deepEqual(await acceptStatus(instance, id), [200, { state: "done" }]);
    assert.deepEqual(
      pinRows(instance).map((pin) => pin.from_key),
      ["1:2", "7:8"],
    );
  });
});

describe("an open row for a pair that already has a current Pin", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    seedTopics(instance, { 1: "Reading" });
    seedDigested(instance, [
      { id: 1, topic: 1 },
      { id: 2, topic: 1 },
    ]);
  });

  after(() => instance.close());

  it("answers 200 done, deletes the row and leaves the Pin as it was", async () => {
    assert.deepEqual(await acceptStatus(instance, proposeDisagreement(instance, [1, 2])), [
      200,
      { state: "done" },
    ]);
    exec(instance, "update pins set from_name = 'The first reason.'");

    const [earlier] = pinRows(instance);
    const again = proposeDisagreement(instance, [1, 2]);

    assert.deepEqual(await acceptStatus(instance, again), [200, { state: "done" }]);
    assert.deepEqual(pinRows(instance), [earlier]);
    assert.deepEqual(disagreementRows(instance), []);
  });
});

describe("accepting a new row for a pair whose Pin is stale", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    seedTopics(instance, { 1: "Reading" });
    seedDigested(instance, [
      { id: 1, topic: 1 },
      { id: 2, topic: 1 },
    ]);
  });

  after(() => instance.close());

  it("replaces the Pin in place and keeps one Pin for the pair", async () => {
    await acceptStatus(instance, proposeDisagreement(instance, [1, 2]));

    const [older] = pinRows(instance);

    replaceDigest(instance, 2, 950);
    assert.deepEqual(await acceptStatus(instance, proposeDisagreement(instance, [1, 2])), [
      200,
      { state: "done" },
    ]);

    const found = pinRows(instance);

    assert.equal(found.length, 1);
    assert.equal(found[0]?.id, older?.id);
    assert.deepEqual([found[0]?.from_digest, found[0]?.into_digest], [1, 950]);
  });
});
