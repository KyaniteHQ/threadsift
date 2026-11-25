import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { executeClaimed } from "../src/core/compose/jobs.ts";
import { openJobOfKind } from "./bot-task-fixtures.ts";
import { Instance, SECRET_KEY } from "./instance.ts";
import { saveProvider } from "./library-fixtures.ts";
import { DIGEST, hopThreadOf, toolsOf } from "./one-hop-fixtures.ts";
import { redditAddressOf } from "./reader-thread-fixtures.ts";

describe("a Digest job claimed before a caller sent a Digest publishes it without a model call", () => {
  it("makes no model call when the caller's Digest lands after the claim", async () => {
    const instance = await Instance.start({ secretKey: SECRET_KEY });

    try {
      await instance.setUp();

      const tools = toolsOf(instance);

      const { item } = await tools.paste(
        redditAddressOf("lateclaim1"),
        hopThreadOf("lateclaim1", { selftext: "Some text." }),
      );

      await instance.settledItem(item.id);
      await saveProvider(instance);

      const claimed = await openJobOfKind(instance, { kind: "digest", itemId: item.id });

      assert.equal(claimed.attemptPending, null);
      instance.database.exec(
        "update items set pending_digest = ? where id = ?",
        JSON.stringify(DIGEST),
        item.id,
      );

      const earlier = tools.aiTasks(item.id);

      await executeClaimed(instance.core, claimed);

      assert.deepEqual(tools.aiTasks(item.id), [...earlier, { executor: "caller" }]);
      assert.equal((await instance.settledItem(item.id)).digestTitle, DIGEST.title);
    } finally {
      await instance.close();
    }
  });
});
