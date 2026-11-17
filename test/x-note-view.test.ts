import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";
import { insertedXItem } from "./x-intake-fixtures.ts";

describe("the detail of an unreadable X Item shows its stored cause note", () => {
  let instance: Instance;
  let itemId = 0;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    itemId = insertedXItem(instance, "2300000000000000001");
  });

  after(() => instance.close());

  it("shows the stored note on an unreadable Item", async () => {
    exec(
      instance,
      "update items set fetch_result = 'unreadable', x_note = 'cli-signed-out' where id = ?",
      itemId,
    );

    assert.equal((await instance.detail(itemId)).xNote, "cli-signed-out");
  });
});
