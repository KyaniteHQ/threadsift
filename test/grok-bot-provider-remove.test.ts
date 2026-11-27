import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { GrokBotViewSchema } from "../src/core/contract/grok-bot-contract.ts";
import { botInstance, chooseGrokBot } from "./bot-task-fixtures.ts";
import { PATH } from "./grok-bot-fixtures.ts";
import { usedAsProvider } from "./grok-bot-provider-fixtures.ts";
import type { Instance } from "./instance.ts";
import { saveProvider } from "./library-fixtures.ts";

describe("removing the Grok Bot settings is refused while Grok Bot is the Provider", () => {
  let instance: Instance;

  before(async () => {
    instance = await botInstance();
    assert.equal((await chooseGrokBot(instance)).status, 200);
  });

  after(() => instance.close());

  it("answers 409 in-use with the text to show, and keeps the settings and the choice", async () => {
    const answer = await instance.send("DELETE", PATH);

    assert.equal(answer.status, 409);
    assert.deepEqual(JSON.parse(answer.body), {
      error:
        "Can’t remove the Grok Bot while it is set as the provider. Pick and save another provider in the AI section first.",
      code: "in-use",
    });
    assert.equal(usedAsProvider(instance), true);
    assert.equal((await instance.read("GET", PATH, GrokBotViewSchema)).configured, true);
  });

  it("removes the settings once another Provider is saved", async () => {
    await saveProvider(instance);

    const answer = await instance.send("DELETE", PATH);

    assert.equal(answer.status, 200);
    assert.equal(GrokBotViewSchema.parse(JSON.parse(answer.body)).configured, false);
  });
});
