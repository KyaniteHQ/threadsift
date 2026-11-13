import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { GrokBotViewSchema } from "../src/core/grok-bot-contract.ts";
import { botInstance } from "./bot-task-fixtures.ts";
import { PATH } from "./grok-bot-fixtures.ts";
import { chooseGrokBot, usedAsProvider } from "./grok-bot-provider-fixtures.ts";
import type { Instance } from "./instance.ts";
import { saveProvider } from "./related-fixtures.ts";

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
      error: "Grok Bot is the Provider, so pick and save another Provider in the AI section first.",
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
