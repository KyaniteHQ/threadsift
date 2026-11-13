import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { saveBot } from "./bot-task-fixtures.ts";
import { chooseGrokBot } from "./grok-bot-provider-fixtures.ts";
import { Instance } from "./instance.ts";
import {
  LINKED,
  SECRET_KEY,
  addressOf,
  hopResults,
  seedGithubCooldown,
  toolsOf,
  warningsDuring,
  withoutComments,
} from "./one-hop-fixtures.ts";
import { until } from "./related-fixtures.ts";

describe("the linked-page hop of a Digest runs when Grok Bot is the Provider", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    seedGithubCooldown(instance);
  });

  after(() => instance.close());

  it("looks at the linked page before the bot task is sent", async () => {
    const tools = toolsOf(instance);
    const linked = await tools.paste(addressOf("bot1"), withoutComments("bot1", { url: LINKED }));

    await instance.settledItem(linked.item.id);
    await saveBot(instance);

    const { warnings } = await warningsDuring(async (seen) => {
      assert.equal((await chooseGrokBot(instance)).status, 200);

      return until(
        () => hopResults(seen),
        (results) => results.length > 0,
      );
    });

    assert.deepEqual(hopResults(warnings).slice(0, 1), ["waiting"]);
  });
});
