import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import type { Instance } from "./instance.ts";
import {
  LATER,
  PATH,
  SESSION,
  account,
  accountInstance,
  connect,
  fetchJob,
  jobs,
} from "./reddit-account-fixtures.ts";
import { until } from "./related-fixtures.ts";

describe("Disconnect removes the Reddit account and makes due at once only the jobs that wait for Reddit", () => {
  let instance: Instance;

  before(async () => {
    instance = await accountInstance();
  });

  after(() => instance.close());

  it("removes the row and wakes the jobs waiting for Reddit", async () => {
    await connect(instance, SESSION);
    assert.equal(account(instance).length, 1);
    fetchJob(instance, 901, { state: "queued", waitReason: "reddit-limit", dueAt: LATER });
    fetchJob(instance, 902, { state: "queued", waitReason: "reddit-limit", dueAt: LATER });
    fetchJob(instance, 903, { state: "queued", waitReason: "github-rate-limit", dueAt: LATER });

    const removed = await instance.read("DELETE", PATH, z.looseObject({ state: z.string() }));
    const observedAt = Date.now();

    assert.equal(removed.state, "none");
    assert.deepEqual(account(instance), []);

    const settled = await until(
      "no job waits for the Reddit limit",
      () => jobs(instance),
      (all) => all.every((job) => job.wait_reason !== "reddit-limit"),
    );

    assert.deepEqual(
      settled.map(({ id, wait_reason: reason, next_attempt_at: due }) => [
        id,
        reason,
        due <= observedAt ? "due" : due,
      ]),
      [
        [901, null, "due"],
        [902, null, "due"],
        [903, "github-rate-limit", LATER],
      ],
    );
  });
});
