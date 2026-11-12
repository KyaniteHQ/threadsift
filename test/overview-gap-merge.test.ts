import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { accept } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { gapRows, gapTopics, pasteTopics, proposeGap } from "./overview-gap-fixtures.ts";
import { proposeTopics } from "./topic-accept-fixtures.ts";

describe("Accept of a Topic merge deletes the row of the merged-away Topic and keeps the survivor's", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await pasteTopics(instance, { Loser: ["l1", "l2"], Survivor: ["s1"] });
  });

  after(() => instance.close());

  it("removes the Loser's row by cascade and leaves the Survivor's row", async () => {
    proposeGap(instance, "Loser");

    const kept = proposeGap(instance, "Survivor");

    assert.equal(
      (await accept(instance, proposeTopics(instance, ["Loser", "Survivor"]))).status,
      200,
    );
    assert.deepEqual(gapTopics(instance), ["Survivor"]);
    assert.deepEqual(
      gapRows(instance).map(({ id, state }) => [id, state]),
      [[kept, "open"]],
    );
  });
});
