import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  nextUtcDayAt,
  reserved,
  settled,
  spentOn,
  utcDayOf,
} from "../src/features/x/core/x-api-spend.ts";
import { Instance } from "./instance.ts";

const LAST_MS = Date.parse("2026-11-28T23:59:59.999Z");

describe("the X API spend counter keeps the counted spend of each UTC day and refuses a request that could pass the day's limit", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
  });

  after(() => instance.close());

  it("names the UTC day of a time, and the start of the next one, at the last millisecond of a day and the first of the next", () => {
    assert.deepEqual(
      [utcDayOf(LAST_MS), utcDayOf(LAST_MS + 1), nextUtcDayAt(LAST_MS), nextUtcDayAt(LAST_MS + 1)],
      ["2026-11-28", "2026-11-29", LAST_MS + 1, LAST_MS + 1 + 86_400_000],
    );
  });

  it("starts a day at nothing spent", async () => {
    assert.deepEqual(await spentOn(instance.core.db, "2026-11-01"), {
      day: "2026-11-01",
      micros: 0,
      posts: 0,
      users: 0,
    });
  });

  it("reserves a worst case that fits the day's limit and refuses one that could pass it, leaving the day as it was", async () => {
    const { db } = instance.core;
    const day = "2026-11-02";

    assert.equal(
      await reserved(db, { day, worstMicros: 600_000, dayLimitMicros: 1_000_000 }),
      true,
    );
    assert.equal(
      await reserved(db, { day, worstMicros: 400_001, dayLimitMicros: 1_000_000 }),
      false,
    );
    assert.equal((await spentOn(db, day)).micros, 600_000);
    assert.equal(
      await reserved(db, { day, worstMicros: 400_000, dayLimitMicros: 1_000_000 }),
      true,
    );
    assert.equal((await spentOn(db, day)).micros, 1_000_000);
  });

  it("replaces the reserved worst case by the posts and users the answer returned, at X's prices", async () => {
    const { db } = instance.core;
    const day = "2026-11-03";

    await reserved(db, { day, worstMicros: 1_500_000, dayLimitMicros: 3_000_000 });
    await settled(db, { day, worstMicros: 1_500_000, counted: { posts: 31, users: 29 } });

    assert.deepEqual(await spentOn(db, day), {
      day,
      micros: 31 * 5000 + 29 * 10_000,
      posts: 31,
      users: 29,
    });
  });

  it("counts nothing for a request that returned nothing", async () => {
    const { db } = instance.core;
    const day = "2026-11-04";

    await reserved(db, { day, worstMicros: 45_000, dayLimitMicros: 3_000_000 });
    await settled(db, { day, worstMicros: 45_000, counted: { posts: 0, users: 0 } });

    assert.deepEqual(await spentOn(db, day), { day, micros: 0, posts: 0, users: 0 });
  });

  it("lets only one of two reservations sent at once pass when both together pass the limit", async () => {
    const { db } = instance.core;
    const day = "2026-11-05";
    const both = await Promise.all(
      [1, 2].map(() => reserved(db, { day, worstMicros: 700_000, dayLimitMicros: 1_000_000 })),
    );

    assert.deepEqual(
      both.toSorted((a, b) => Number(a) - Number(b)),
      [false, true],
    );
    assert.equal((await spentOn(db, day)).micros, 700_000);
  });
});
