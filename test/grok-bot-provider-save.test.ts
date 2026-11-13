import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { AiSettingsViewSchema, VerifyResultSchema } from "../src/core/ai-contract.ts";
import { saveBot } from "./bot-task-fixtures.ts";
import { taskRows } from "./bot-task-rows.ts";
import { SECRET_KEY } from "./grok-bot-fixtures.ts";
import {
  AI_PATH,
  chooseGrokBot,
  revisionOf,
  storedSettings,
  unreadableBotKey,
  usedAsProvider,
} from "./grok-bot-provider-fixtures.ts";
import { Instance } from "./instance.ts";
import { exec, saveProvider } from "./related-fixtures.ts";

const REFUSAL = z.object({ error: z.string(), code: z.string() });

describe("Grok Bot is selected as the Provider only when the Grok Bot settings can send, and the stored Provider stays", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await saveProvider(instance);
  });

  after(() => instance.close());

  it("answers 400 not-configured when no Grok Bot settings are saved, and changes nothing", async () => {
    const revisionBefore = revisionOf(instance);
    const stored = storedSettings(instance);

    const answer = await chooseGrokBot(instance);

    assert.equal(answer.status, 400);
    assert.equal(REFUSAL.parse(JSON.parse(answer.body)).code, "not-configured");
    assert.deepEqual(storedSettings(instance), stored);
    assert.equal(revisionOf(instance), revisionBefore);
  });

  it("answers 400 secret-missing when the saved Grok Bot key cannot be opened, and changes nothing", async () => {
    unreadableBotKey(instance);

    const revisionBefore = revisionOf(instance);
    const answer = await chooseGrokBot(instance);

    assert.equal(answer.status, 400);
    assert.equal(REFUSAL.parse(JSON.parse(answer.body)).code, "secret-missing");
    assert.equal(usedAsProvider(instance), false);
    assert.equal(revisionOf(instance), revisionBefore);
  });

  it("sets the flag and counts a revision once the settings are usable, leaves the stored Provider row alone and lists the Provider", async () => {
    exec(instance, "delete from grok_bot_settings");
    await saveBot(instance);

    const stored = storedSettings(instance);
    const revisionBefore = revisionOf(instance);
    const answer = await chooseGrokBot(instance);
    const view = AiSettingsViewSchema.parse(JSON.parse(answer.body));

    assert.equal(answer.status, 200);
    assert.deepEqual(view.settings, { provider: "grok-bot", model: "" });
    assert.ok(view.providers.includes("grok-bot"));
    assert.equal(usedAsProvider(instance), true);
    assert.deepEqual(storedSettings(instance), stored);
    assert.equal(revisionOf(instance), revisionBefore + 1);
    assert.deepEqual((await instance.read("GET", AI_PATH, AiSettingsViewSchema)).settings, {
      provider: "grok-bot",
      model: "",
    });
  });

  it("answers Verify with a refusal before any task row while Grok Bot is selected and its key cannot be opened, and does not run the stored Provider", async () => {
    unreadableBotKey(instance);

    const known = taskRows(instance).length;
    const answer = await instance.send("POST", "/api/settings/ai/verify");

    assert.deepEqual(VerifyResultSchema.parse(JSON.parse(answer.body)), {
      kind: "refused",
      reason: "secret-missing",
      status: null,
    });
    assert.equal(taskRows(instance).length, known);
  });

  it("clears the flag when another Provider is saved, and that Provider runs", async () => {
    exec(instance, "delete from grok_bot_settings");
    await saveBot(instance);
    assert.equal((await chooseGrokBot(instance)).status, 200);

    await saveProvider(instance);

    const view = await instance.read("GET", AI_PATH, AiSettingsViewSchema);

    assert.equal(view.settings?.provider, "openai-compatible");
    assert.equal(usedAsProvider(instance), false);
  });
});
