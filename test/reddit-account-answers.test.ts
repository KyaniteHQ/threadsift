import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import {
  REFUSALS_TO_EXPIRE,
  clearRefusals,
  countRefusal,
  recordWindow,
} from "../src/core/reddit-account-states.ts";
import { Instance } from "./instance.ts";
import { SECRET_KEY, SESSION, account, connect } from "./reddit-account-fixtures.ts";
import { exec } from "./related-fixtures.ts";

const NOW = 1_800_000_000_000;

const SECOND_MS = 1000;

describe("the account row records what Reddit answered", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  beforeEach(async () => {
    exec(instance, "delete from reddit_account");
    await connect(instance, SESSION);
  });

  after(() => instance.close());

  const record = (change: Parameters<typeof recordWindow>[1]) =>
    recordWindow(instance.core.db, change, NOW);

  it("keeps the requests left and the time of the request", async () => {
    await record({ left: 42.5, reset: "300", retryAfter: null, limited: false });

    const [row] = account(instance);

    assert.deepEqual(
      [row?.window_remaining, row?.window_resets_at, row?.last_request_at, row?.limited_until],
      [42, NOW + 300 * SECOND_MS, NOW, null],
    );
  });

  it("stops the account for at least 60 s after a 429 whose own headers say less, and empties the window", async () => {
    await record({ left: 9, reset: "0", retryAfter: null, limited: true });

    const [row] = account(instance);

    assert.deepEqual([row?.window_remaining, row?.limited_until], [0, NOW + 60 * SECOND_MS]);
  });

  it("stops the account for the longest of the 429's reset, its Retry-After and 60 s, and at most one hour", async () => {
    await record({ left: null, reset: "120", retryAfter: "300", limited: true });
    assert.equal(account(instance)[0]?.limited_until, NOW + 300 * SECOND_MS);

    await record({
      left: null,
      reset: "900",
      retryAfter: "Wed, 21 Oct 2026 07:28:00 GMT",
      limited: true,
    });
    assert.equal(account(instance)[0]?.limited_until, NOW + 900 * SECOND_MS);

    await record({ left: null, reset: "86400", retryAfter: null, limited: true });
    assert.equal(account(instance)[0]?.limited_until, NOW + 3600 * SECOND_MS);
  });

  it("expires the account at the third refusal from three different jobs, and counts one job once", async () => {
    const ports = instance.core;

    assert.equal(await countRefusal(ports, 10, NOW), "counted");
    assert.equal(await countRefusal(ports, 10, NOW), "counted");
    assert.equal(account(instance)[0]?.refused_count, 1);
    assert.equal(await countRefusal(ports, 11, NOW), "counted");
    assert.equal(account(instance)[0]?.refused_count, REFUSALS_TO_EXPIRE - 1);
    assert.equal(await countRefusal(ports, 12, NOW), "expired");
    assert.equal(account(instance)[0]?.state, "expired");
  });

  it("starts the count again after an answer that shows the session works", async () => {
    const ports = instance.core;

    await countRefusal(ports, 10, NOW);
    await countRefusal(ports, 11, NOW);
    await clearRefusals(ports.db);
    assert.equal(account(instance)[0]?.refused_count, 0);
    assert.equal(await countRefusal(ports, 12, NOW), "counted");
    assert.equal(account(instance)[0]?.state, "connected");
  });
});
