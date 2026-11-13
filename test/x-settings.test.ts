import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import type { XReaderChoice } from "../src/core/kinds.ts";
import { XSettingsViewSchema } from "../src/core/x-settings.ts";
import { CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import { SECRET_KEY, saveBot } from "./bot-task-fixtures.ts";
import { Instance } from "./instance.ts";

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

  it("answers auto, all three choices and no reader on a container without the grok CLI or a Grok Bot", async () => {
    assert.deepEqual(await instance.read("GET", PATH, XSettingsViewSchema), {
      reader: "auto",
      choices: ["auto", "grok-bot", "grok-cli"],
      bot: "not-configured",
      fetcher: null,
      state: "not-installed",
      version: null,
    });
  });

  it("reports the Grok Bot as ready once its settings are saved", async () => {
    await saveBot(instance);

    assert.equal((await instance.read("GET", PATH, XSettingsViewSchema)).bot, "ready");
  });

  it("saves each choice, reads it back, and returns to auto", async () => {
    assert.equal(await chosenAs(instance, "grok-bot"), "grok-bot");
    assert.equal(await chosenAs(instance, "grok-cli"), "grok-cli");
    assert.equal(await chosenAs(instance, "auto"), "auto");
  });

  it("refuses a value that is not a choice with 400 and keeps the saved choice", async () => {
    await instance.send("PUT", PATH, { reader: "grok-bot" });

    assert.equal((await instance.send("PUT", PATH, { reader: "claude" })).status, 400);
    assert.equal((await instance.send("PUT", PATH, {})).status, 400);
    assert.equal((await instance.read("GET", PATH, XSettingsViewSchema)).reader, "grok-bot");
  });

  it("answers 403 to an agent token, for the read and for the change, and 401 signed out", async () => {
    assert.equal((await instance.sendWithToken(token, "GET", PATH)).status, 403);
    assert.equal(
      (await instance.sendWithToken(token, "PUT", PATH, { reader: "grok-cli" })).status,
      403,
    );
    assert.equal((await instance.fetch(PATH)).status, 401);
    assert.equal(
      (
        await instance.fetch(PATH, {
          method: "PUT",
          headers: { "content-type": "application/json", origin: "http://localhost" },
          body: JSON.stringify({ reader: "grok-cli" }),
        })
      ).status,
      401,
    );
    assert.equal((await instance.read("GET", PATH, XSettingsViewSchema)).reader, "grok-bot");
  });

  it("describes the read and the change in the OpenAPI document", async () => {
    const document = z
      .object({ paths: z.record(z.string(), z.record(z.string(), z.unknown())) })
      .parse(JSON.parse((await instance.send("GET", "/api/openapi.json")).body));

    assert.deepEqual(Object.keys(document.paths[PATH] ?? {}).toSorted(), ["get", "put"]);
  });
});

describe("on the Worker the choice of the grok CLI is not offered and is refused", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("offers auto and grok-bot only", async () => {
    const answer = await instance.sendWithPublicOnlyAiAndNoXFetcher("GET", PATH);
    const view = XSettingsViewSchema.parse(JSON.parse(answer.body));

    assert.deepEqual(
      [view.choices, view.state, view.fetcher],
      [["auto", "grok-bot"], "worker", null],
    );
  });

  it("reports auto when the saved choice is the grok CLI, which this install cannot offer", async () => {
    await instance.send("PUT", PATH, { reader: "grok-cli" });

    const answer = await instance.sendWithPublicOnlyAiAndNoXFetcher("GET", PATH);

    assert.equal(XSettingsViewSchema.parse(JSON.parse(answer.body)).reader, "auto");

    await instance.send("PUT", PATH, { reader: "auto" });
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
