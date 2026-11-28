import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { SavedItemResponseSchema } from "../src/core/contract/item-route-wire.ts";
import { chargeOf } from "../src/features/x/core/x-api-metered.ts";
import { resourcesOf } from "../src/features/x/core/x-api-posts.ts";
import {
  itemSpentOn,
  nextUtcDayAt,
  reserved,
  settled,
  spentOn,
  utcDayOf,
} from "../src/features/x/core/x-api-spend.ts";
import { Instance, type Json } from "./instance.ts";
import {
  AUTHOR,
  AUTHOR_ID,
  ROOT_ID,
  absent,
  lookup,
  post,
  searchPage,
  user,
} from "./x-api-fixtures.ts";

const LAST_MS = Date.parse("2026-11-28T23:59:59.999Z");

const countOf = (answer: Json) => resourcesOf(JSON.stringify(answer));

const answered = (status: number, text: string) => ({ kind: "answered", status, text }) as const;

describe("the X API spend counter keeps the counted spend of each UTC day and refuses a request that could pass the day's limit", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
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

    assert.equal(await reserved(db, { day, worstMicros: 600_000, item: null }, 1_000_000), true);
    assert.equal(await reserved(db, { day, worstMicros: 400_001, item: null }, 1_000_000), false);
    assert.equal((await spentOn(db, day)).micros, 600_000);
    assert.equal(await reserved(db, { day, worstMicros: 400_000, item: null }, 1_000_000), true);
    assert.equal((await spentOn(db, day)).micros, 1_000_000);
  });

  it("replaces the reserved worst case by the posts and users the answer returned, at X's prices", async () => {
    const { db } = instance.core;
    const day = "2026-11-03";

    const reservation = { day, worstMicros: 1_500_000, item: null };

    await reserved(db, reservation, 3_000_000);
    await settled(db, reservation, { micros: 31 * 5000 + 29 * 10_000, posts: 31, users: 29 });

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

    const reservation = { day, worstMicros: 60_000, item: null };

    await reserved(db, reservation, 3_000_000);
    await settled(db, reservation, { micros: 0, posts: 0, users: 0 });

    assert.deepEqual(await spentOn(db, day), { day, micros: 0, posts: 0, users: 0 });
  });

  it("lets only one of two reservations sent at once pass when both together pass the limit", async () => {
    const { db } = instance.core;
    const day = "2026-11-05";
    const both = await Promise.all(
      [1, 2].map(() => reserved(db, { day, worstMicros: 700_000, item: null }, 1_000_000)),
    );

    assert.deepEqual(
      both.toSorted((a, b) => Number(a) - Number(b)),
      [false, true],
    );
    assert.equal((await spentOn(db, day)).micros, 700_000);
  });

  async function pastedItem(path: string): Promise<number> {
    const { item } = await instance.read("POST", "/api/items", SavedItemResponseSchema, {
      url: `https://held.test/${path}`,
      page: { title: "Held", markdown: "Held page text." },
    });

    return item.id;
  }

  it("adds each settled call to the Item's spend of that day and keeps the days apart", async () => {
    const { db } = instance.core;
    const day = "2026-11-06";
    const item = { id: await pastedItem("x-api-spend"), limitMicros: 1_000_000 };
    const first = { day, worstMicros: 60_000, item };
    const second = { day, worstMicros: 60_000, item };

    await reserved(db, first, 3_000_000);
    await settled(db, first, { micros: 60_000, posts: 4, users: 4 });
    await reserved(db, second, 3_000_000);
    await settled(db, second, { micros: 15_000, posts: 1, users: 1 });

    assert.deepEqual(
      [await itemSpentOn(db, item.id, day), await itemSpentOn(db, item.id, "2026-11-07")],
      [75_000, 0],
    );
  });

  it("lets only one of two reservations of one Item sent at once pass when both together pass the Item's limit, and leaves the day with that one", async () => {
    const { db } = instance.core;
    const day = "2026-11-08";
    const item = { id: await pastedItem("x-api-race"), limitMicros: 100_000 };
    const both = await Promise.all(
      [1, 2].map(() => reserved(db, { day, worstMicros: 60_000, item }, 3_000_000)),
    );

    assert.deepEqual(
      both.toSorted((a, b) => Number(a) - Number(b)),
      [false, true],
    );
    assert.deepEqual(
      [await itemSpentOn(db, item.id, day), (await spentOn(db, day)).micros],
      [60_000, 60_000],
    );
  });

  it("reserves nothing on the day when the Item's row cannot be written", async () => {
    const { db } = instance.core;
    const day = "2026-11-09";

    await assert.rejects(
      reserved(
        db,
        { day, worstMicros: 60_000, item: { id: 999_999, limitMicros: 100_000 } },
        3_000_000,
      ),
    );
    assert.equal((await spentOn(db, day)).micros, 0);
  });
});

describe("what one X API request counts", () => {
  const lookupPrice = { kind: "resources", worst: { posts: 4, users: 4 } } as const;
  const verifyPrice = { kind: "flat", micros: 200_000 } as const;
  const worst = { micros: 60_000, posts: 4, users: 4 };

  it("counts nothing for a request that was never sent and for an answer X refused", () => {
    assert.deepEqual(
      [
        chargeOf(lookupPrice, { kind: "not-sent" }),
        chargeOf(lookupPrice, answered(429, "{}")),
        chargeOf(verifyPrice, answered(401, "{}")),
      ],
      [0, 0, 0].map(() => ({ micros: 0, posts: 0, users: 0 })),
    );
  });

  it("keeps the worst case for a request with no answer, a server error and a 200 of an unknown shape", () => {
    assert.deepEqual(
      [
        chargeOf(lookupPrice, { kind: "unknown" }),
        chargeOf(lookupPrice, answered(503, '{"data":[]}')),
        chargeOf(lookupPrice, answered(200, '{"result":{"data":[{"id":"1"}]}}')),
        chargeOf(verifyPrice, answered(503, "")),
      ],
      [worst, worst, worst, { micros: 200_000, posts: 0, users: 0 }],
    );
  });

  it("counts the posts and users of a 200 at X's prices", () => {
    assert.deepEqual(
      chargeOf(lookupPrice, answered(200, '{"data":{"id":"1"},"includes":{"users":[{},{}]}}')),
      { micros: 5000 + 2 * 10_000, posts: 1, users: 2 },
    );
  });

  it("counts every post and user an answer returns, in data and in includes, and nothing it can count in a body that is not JSON or not of a shape it knows", () => {
    assert.deepEqual(
      countOf(
        lookup(post({ id: ROOT_ID }), {
          users: [user(AUTHOR_ID, AUTHOR), user("72", "other_one")],
          tweets: [post({ id: "1800000000000000001" })],
        }),
      ),
      { posts: 2, users: 2 },
    );
    assert.deepEqual(
      countOf(searchPage([post({ id: "1" }), post({ id: "2" })], [user("73", "first_reader")])),
      { posts: 2, users: 1 },
    );
    assert.deepEqual(countOf(absent(ROOT_ID, "resource-not-found")), { posts: 0, users: 0 });
    assert.deepEqual(countOf({ meta: { result_count: 0 } }), { posts: 0, users: 0 });
    assert.deepEqual(
      countOf({
        data: { id: ROOT_ID },
        includes: { tweets: [{ id: "1" }], posts: [{ id: "1" }, { id: "2" }] },
      }),
      { posts: 3, users: 0 },
    );
    assert.deepEqual(
      [
        resourcesOf("<html>Bad gateway</html>"),
        countOf({}),
        countOf({ meta: { result_count: 20 } }),
        countOf({ data: { id: ROOT_ID }, includes: { articles: [{ id: "9" }] } }),
      ],
      [null, null, null, null],
    );
  });
});
