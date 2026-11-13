import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import { PATH, SECRET_KEY } from "./grok-bot-fixtures.ts";
import { Instance } from "./instance.ts";

describe("the Grok Bot settings are reached only by the signed-in owner", () => {
  let instance: Instance;
  let token = "";

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    ({ value: token } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "grok-bot-access",
    }));
  });

  after(() => instance.close());

  const calls = [
    ["GET", PATH],
    ["PUT", PATH],
    ["DELETE", PATH],
    ["POST", `${PATH}/test`],
  ] as const;

  it("answers 403 to an agent token on all four routes", async () => {
    const statuses = await Promise.all(
      calls.map(
        async ([method, path]) => (await instance.sendWithToken(token, method, path)).status,
      ),
    );

    assert.deepEqual(statuses, [403, 403, 403, 403]);
  });

  it("answers 401 to a signed-out call on all four routes", async () => {
    const statuses = await Promise.all(
      calls.map(async ([method, path]) => (await instance.fetch(path, { method })).status),
    );

    assert.deepEqual(statuses, [401, 401, 401, 401]);
  });

  it("describes the four calls in the OpenAPI document", async () => {
    const document = z
      .object({ paths: z.record(z.string(), z.record(z.string(), z.unknown())) })
      .parse(JSON.parse((await instance.send("GET", "/api/openapi.json")).body));

    assert.deepEqual(
      [
        Object.keys(document.paths[PATH] ?? {}).toSorted(),
        Object.keys(document.paths[`${PATH}/test`] ?? {}),
      ],
      [["delete", "get", "put"], ["post"]],
    );
  });
});
