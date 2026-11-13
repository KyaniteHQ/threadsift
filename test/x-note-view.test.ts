import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";
import { insertedXItem } from "./x-intake-fixtures.ts";

describe("the Item shows the cause note of an X link only while its fetch result is not a success", () => {
  let instance: Instance;
  let itemId = 0;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    itemId = insertedXItem(instance, "2300000000000000001");
  });

  after(() => instance.close());

  it("shows the stored note on an unreadable Item and hides it once an older release wrote ok", async () => {
    exec(
      instance,
      "update items set fetch_result = 'unreadable', x_note = 'cli-signed-out' where id = ?",
      itemId,
    );

    assert.equal((await instance.detail(itemId)).xNote, "cli-signed-out");

    exec(instance, "update items set fetch_result = 'ok' where id = ?", itemId);

    assert.equal((await instance.detail(itemId)).xNote, null);
  });
});
