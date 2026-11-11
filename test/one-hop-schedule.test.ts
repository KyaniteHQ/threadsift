import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { Instance } from "./instance.ts";
import {
  SECRET_KEY,
  LINKED,
  addressOf,
  hopResults,
  seedGithubCooldown,
  DIGEST,
  toolsOf,
  warningsDuring,
  withoutComments,
} from "./one-hop-fixtures.ts";

const SavedSettingsSchema = z.object({ settings: z.object({ keySet: z.boolean() }) });

describe("saving a Provider schedules an Item whose only source is a candidate, with no request sent", () => {
  let instance: Instance;
  let tools: ReturnType<typeof toolsOf>;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    seedGithubCooldown(instance);
    tools = toolsOf(instance);
  });

  after(() => instance.close());

  it("schedules an older Item whose only source is a candidate when a Provider is saved, and no Item without one", async () => {
    const linked = await tools.paste(
      addressOf("older1"),
      withoutComments("older1", { url: LINKED }),
    );

    const bare = await tools.paste(addressOf("older2"), withoutComments("older2", {}));

    const withCaller = await tools.paste(
      addressOf("older3"),
      withoutComments("older3", { url: LINKED }),
      DIGEST,
    );

    await instance.settledItem(linked.item.id);
    await instance.settledItem(bare.item.id);
    await instance.settledItem(withCaller.item.id);

    const { warnings, value: saved } = await warningsDuring(async () => {
      const answer = await instance.send("PUT", "/api/settings/ai", {
        provider: "openai-compatible",
        baseUrl: "http://127.0.0.1:9/v1",
        model: "a-model",
        key: "a-key-for-a-provider-that-is-never-called",
      });

      await instance.settledItem(linked.item.id);
      await instance.settledItem(withCaller.item.id);

      return answer;
    });

    assert.equal(saved.status, 200);
    assert.equal(SavedSettingsSchema.parse(JSON.parse(saved.body)).settings.keySet, true);
    assert.deepEqual(hopResults(warnings), ["waiting", "waiting"]);
    assert.equal((await instance.settledItem(linked.item.id)).status, "ready");
    assert.deepEqual(tools.digestJobs(linked.item.id), [{ state: "done", attempts: 0 }]);
    assert.deepEqual(tools.digestJobs(withCaller.item.id), [{ state: "done", attempts: 0 }]);
    assert.deepEqual(tools.pendingDigests(withCaller.item.id), [{ pending: 0 }]);
    assert.deepEqual(tools.digestJobs(bare.item.id), []);
    assert.deepEqual(tools.aiTasks(linked.item.id), []);
  });
});
