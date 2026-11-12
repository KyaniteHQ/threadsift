import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { count } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { LOSER_FIRST_ITEM, jobsOf, seedLibrary, stepPinKeys } from "./pin-fixtures.ts";
import { SECRET_KEY, exec, saveProvider } from "./related-fixtures.ts";

const seededRun = async (seed: (instance: Instance) => void) => {
  const instance = await Instance.start({ secretKey: SECRET_KEY });

  await instance.setUp();
  await saveProvider(instance);
  seedLibrary(instance);
  seed(instance);
  await stepPinKeys(instance);

  return instance;
};

describe("the final opening attempt for the survivor's overview", () => {
  it("opens one topic_overview job on the survivor's owner Item when a Provider is saved", async () => {
    const instance = await seededRun(() => {});

    try {
      assert.equal(count(instance, "select count(*) as n from topics where id = 2"), 0);
      assert.equal(
        jobsOf(instance),
        JSON.stringify([{ item_id: 1, kind: "topic_overview", state: "queued" }]),
      );
    } finally {
      await instance.close();
    }
  });

  it("opens none when the survivor's owner Item already has an open job, and keeps the loser owner's job where it was", async () => {
    const instance = await seededRun((seeded) => {
      for (const id of [1, LOSER_FIRST_ITEM]) {
        exec(
          seeded,
          "insert into jobs (kind, item_id, address, state, attempts, stale_requeues, next_attempt_at) select 'topic_overview', id, original_url, 'queued', 0, 0, 9999999999999 from items where id = ?",
          id,
        );
      }
    });

    try {
      assert.equal(
        jobsOf(instance),
        JSON.stringify([
          { item_id: 1, kind: "topic_overview", state: "queued" },
          { item_id: LOSER_FIRST_ITEM, kind: "topic_overview", state: "queued" },
        ]),
      );
    } finally {
      await instance.close();
    }
  });

  it("opens a job on the survivor's owner Item beside the open job of the loser's owner, so two jobs exist for one Topic", async () => {
    const instance = await seededRun((seeded) => {
      exec(
        seeded,
        "insert into jobs (kind, item_id, address, state, attempts, stale_requeues, next_attempt_at) select 'topic_overview', id, original_url, 'queued', 0, 0, 9999999999999 from items where id = ?",
        LOSER_FIRST_ITEM,
      );
    });

    try {
      assert.equal(
        jobsOf(instance),
        JSON.stringify([
          { item_id: 1, kind: "topic_overview", state: "queued" },
          { item_id: LOSER_FIRST_ITEM, kind: "topic_overview", state: "queued" },
        ]),
      );
    } finally {
      await instance.close();
    }
  });
});
