import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { atClock, steppingClock } from "./clock-fixtures.ts";
import { Instance } from "./instance.ts";
import {
  addLink,
  budgetOf,
  dayOf,
  itemsSavedByDay,
  makeToken,
  nextMidnight,
  secondsUntilMidnight,
  xLink,
} from "./token-budget-fixtures.ts";

const LAST_REQUEST_STEPS = 200;

const withAuthorization = (token: string) => ({
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
  origin: "http://localhost",
});

describe("an agent token's day is the UTC day, and a refusal says how long until the next one", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("sends Retry-After as the seconds until the next UTC midnight", async () => {
    const now = Date.now();
    await atClock(
      () => now,
      async () => {
        const token = await makeToken(instance, 1);

        await addLink(instance, token, 21);

        const response = await instance.fetch("/api/items", {
          method: "POST",
          headers: withAuthorization(token.value),
          body: JSON.stringify({ url: xLink(22) }),
        });

        assert.equal(response.status, 429);
        assert.equal(response.headers.get("retry-after"), String(secondsUntilMidnight(now)));
      },
    );
  });

  it("never sends a Retry-After below one second, whatever millisecond midnight falls on while the refusal is built", async () => {
    const token = await makeToken(instance, 1);
    const midnight = nextMidnight(Date.now());

    assert.equal(
      (
        await atClock(
          () => midnight - 1,
          () => addLink(instance, token, 24),
        )
      ).status,
      201,
    );

    const addAhead = (ahead: number) =>
      atClock(steppingClock(midnight - ahead), () =>
        instance.fetch("/api/items", {
          method: "POST",
          headers: withAuthorization(token.value),
          body: JSON.stringify({ url: xLink(1000 + ahead) }),
        }),
      );

    const waits: number[] = [];

    for (let ahead = 1; ahead <= LAST_REQUEST_STEPS; ahead += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each request runs on its own clock, one after the other.
      const response = await addAhead(ahead);

      if (response.status === 429) waits.push(Number(response.headers.get("retry-after")));
    }

    assert.ok(waits.length > LAST_REQUEST_STEPS / 4, `${String(waits.length)} refusals`);
    assert.ok(
      waits.every((wait) => Number.isInteger(wait) && wait >= 1),
      `a Retry-After below one second: ${waits.filter((wait) => wait < 1).join(", ")}`,
    );
  });

  it("starts a new UTC day with a full budget when the clock passes midnight, and the earlier day no longer counts", async () => {
    const token = await makeToken(instance, 1);
    const midnight = nextMidnight(Date.now());

    const lastMs = await atClock(
      () => midnight - 1,
      async () => [await addLink(instance, token, 51), await addLink(instance, token, 52)],
    );

    assert.deepEqual(
      lastMs.map(({ status }) => status),
      [201, 429],
    );

    const firstMs = await atClock(
      () => midnight,
      async () => ({
        budget: await budgetOf(instance, token.id),
        adds: [await addLink(instance, token, 52), await addLink(instance, token, 53)],
      }),
    );

    assert.equal(firstMs.budget.kind, "within");
    assert.deepEqual(
      firstMs.adds.map(({ status }) => status),
      [201, 429],
    );
    assert.deepEqual(itemsSavedByDay(instance, token.id), [
      [dayOf(midnight - 1), 1],
      [dayOf(midnight), 1],
    ]);
  });
});
