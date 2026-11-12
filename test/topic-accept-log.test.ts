import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { LogPageSchema } from "../src/core/log-contract.ts";
import { Instance } from "./instance.ts";
import { script } from "./pin-fixtures.ts";

describe("the Log stores and reads a merge-topic entry and still refuses an unknown action", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("stores merge-topic through the trigger and lists it with the names and the count", async () => {
    script(
      instance,
      "insert into log_entries (at, action, merged_from, merged_into, moved) values (5, 'merge-topic', 'ML', 'Machine learning', 7)",
    );

    const [entry] = (await instance.read("GET", "/api/log", LogPageSchema)).entries;

    assert.deepEqual(entry, {
      id: 1,
      at: 5,
      action: "merge-topic",
      from: "ML",
      into: "Machine learning",
      items: 7,
    });
  });

  it("refuses an unknown action on insert and on update", () => {
    assert.throws(() => {
      script(instance, "insert into log_entries (at, action) values (6, 'merge-tag')");
    }, /log_entries_action/u);
    assert.throws(() => {
      script(instance, "update log_entries set action = 'merge-tag'");
    }, /log_entries_action/u);
  });
});
