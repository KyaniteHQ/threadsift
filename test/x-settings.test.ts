import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { XSettingsViewSchema } from "../src/core/x-settings.ts";
import { CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import { Instance } from "./instance.ts";

const PATH = "/api/settings/x";

describe("the X settings report which fetcher answers X links, to the signed-in owner only", () => {
  let instance: Instance;
  let token = "";

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    ({ value: token } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "x-settings",
    }));
  });

  after(() => instance.close());

  it("answers no fetcher on an Instance without the grok CLI", async () => {
    assert.deepEqual(await instance.read("GET", PATH, XSettingsViewSchema), {
      fetcher: null,
      state: "not-installed",
      version: null,
    });
  });

  it("answers 403 to an agent token and 401 signed out", async () => {
    assert.equal((await instance.sendWithToken(token, "GET", PATH)).status, 403);
    assert.equal((await instance.fetch(PATH)).status, 401);
  });

  it("describes the read in the OpenAPI document", async () => {
    const document = z
      .object({ paths: z.record(z.string(), z.record(z.string(), z.unknown())) })
      .parse(JSON.parse((await instance.send("GET", "/api/openapi.json")).body));

    assert.deepEqual(Object.keys(document.paths[PATH] ?? {}), ["get"]);
  });
});
