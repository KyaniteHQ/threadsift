import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { CreatedTokenResponseSchema } from "../src/core/contract/access-wire.ts";
import { PATH } from "./grok-bot-fixtures.ts";
import { Instance, SECRET_KEY } from "./instance.ts";

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
});
