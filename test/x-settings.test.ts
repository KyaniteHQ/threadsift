import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { CreatedTokenResponseSchema } from "../src/core/contract/access-wire.ts";
import { SavedItemResponseSchema } from "../src/core/contract/item-route-wire.ts";
import {
  type XReaderChoice,
  XSettingsViewSchema,
} from "../src/core/contract/x-settings-contract.ts";
import { saveBot } from "./bot-task-fixtures.ts";
import { Instance, SECRET_KEY } from "./instance.ts";

const PATH = "/api/settings/x";

async function chosenAs(instance: Instance, reader: XReaderChoice) {
  const saved = await instance.send("PUT", PATH, { reader });

  assert.equal(saved.status, 200);
  assert.equal(XSettingsViewSchema.parse(JSON.parse(saved.body)).reader, reader);

  return (await instance.read("GET", PATH, XSettingsViewSchema)).reader;
}

describe("the X settings report the reader of X links and let the owner choose it, to the signed-in owner only", () => {
  let instance: Instance;
  let token = "";

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    ({ value: token } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "x-settings",
    }));
  });

  after(() => instance.close());

  it("answers auto, all four choices and no reader on a container without the grok CLI or a Grok Bot", async () => {
    assert.deepEqual(await instance.read("GET", PATH, XSettingsViewSchema), {
      reader: "auto",
      choices: ["auto", "grok-bot", "grok-cli", "x-api"],
      bot: "not-configured",
      api: "none",
      auto: { reader: null, because: "no-reader" },
      fetcher: null,
      state: "not-installed",
      version: null,
      refusedUpdate: null,
    });
  });

  it("reports the Grok Bot as ready once its settings are saved", async () => {
    await saveBot(instance);

    assert.equal((await instance.read("GET", PATH, XSettingsViewSchema)).bot, "ready");
  });

  it("saves each choice, reads it back, and returns to auto", async () => {
    assert.equal(await chosenAs(instance, "grok-bot"), "grok-bot");
    assert.equal(await chosenAs(instance, "grok-cli"), "grok-cli");
    assert.equal(await chosenAs(instance, "x-api"), "x-api");
    assert.equal(await chosenAs(instance, "auto"), "auto");
  });

  it("refuses a value that is not a choice with 400 and keeps the saved choice", async () => {
    await instance.send("PUT", PATH, { reader: "grok-bot" });

    assert.equal((await instance.send("PUT", PATH, { reader: "claude" })).status, 400);
    assert.equal((await instance.send("PUT", PATH, {})).status, 400);
    assert.equal((await instance.read("GET", PATH, XSettingsViewSchema)).reader, "grok-bot");
  });

  it("answers 403 to an agent token, for the read and for the change", async () => {
    const savedReader = (await instance.read("GET", PATH, XSettingsViewSchema)).reader;
    const reader = savedReader === "grok-cli" ? "auto" : "grok-cli";
    assert.equal((await instance.sendWithToken(token, "GET", PATH)).status, 403);
    assert.equal((await instance.sendWithToken(token, "PUT", PATH, { reader })).status, 403);
    assert.equal((await instance.read("GET", PATH, XSettingsViewSchema)).reader, savedReader);
  });
});

describe("on the Worker the choice of the grok CLI is not offered, is refused, and a saved one reads as itself", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("offers auto, grok-bot and x-api only", async () => {
    const answer = await instance.sendWithPublicOnlyAiAndNoXFetcher("GET", PATH);
    const view = XSettingsViewSchema.parse(JSON.parse(answer.body));

    assert.deepEqual(
      [view.choices, view.state, view.fetcher],
      [["auto", "grok-bot", "x-api"], "worker", null],
    );
  });

  it("reads a saved grok CLI choice as itself, and a pasted X link gets the grok CLI note and no X API read even with an X API token saved", async () => {
    try {
      await instance.send("PUT", PATH, { reader: "grok-cli" });
      await instance.send("PUT", "/api/settings/x-api", { token: "synthetic-bearer-token" });

      const answer = await instance.sendWithPublicOnlyAiAndNoXFetcher("GET", PATH);
      const view = XSettingsViewSchema.parse(JSON.parse(answer.body));

      assert.deepEqual(
        [view.reader, view.api, view.choices],
        ["grok-cli", "saved", ["auto", "grok-bot", "x-api"]],
      );

      const { item } = await instance.read("POST", "/api/items", SavedItemResponseSchema, {
        url: "https://x.com/someone/status/321",
      });

      await instance.settledItem(item.id);
      assert.equal((await instance.detail(item.id)).xNote, "cli-not-installed");
    } finally {
      await instance.send("DELETE", "/api/settings/x-api");
      await instance.send("PUT", PATH, { reader: "auto" });
    }
  });

  it("refuses grok-cli with 400 and saves nothing, and accepts grok-bot", async () => {
    assert.equal(
      (await instance.sendWithPublicOnlyAiAndNoXFetcher("PUT", PATH, { reader: "grok-cli" }))
        .status,
      400,
    );
    assert.equal((await instance.read("GET", PATH, XSettingsViewSchema)).reader, "auto");

    assert.equal(
      (await instance.sendWithPublicOnlyAiAndNoXFetcher("PUT", PATH, { reader: "grok-bot" }))
        .status,
      200,
    );
    assert.equal((await instance.read("GET", PATH, XSettingsViewSchema)).reader, "grok-bot");
  });
});
