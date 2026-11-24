import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ErrorResponseSchema } from "../src/core/contract/error-wire.ts";
import { Instance, PASSWORD } from "./instance.ts";
import { createAgentToken } from "./mcp-client.ts";

const RESET_CODE = "a-reset-code-of-at-least-thirty-two-characters";

const SHORT_RESET_CODE = "a-reset-code-below-thirty-two";

const NEW_PASSWORD = "a new owner password of fifteen or more";

const LOCK_AFTER = 10;

const WRONG_PASSWORD = "not the password of the owner";

const refusalCode = (body: string) => ErrorResponseSchema.parse(JSON.parse(body)).code;

const reset = (instance: Instance, code: string, password = NEW_PASSWORD) =>
  instance.fetch("/api/password/reset", {
    method: "POST",
    headers: { origin: "http://localhost", "content-type": "application/json" },
    body: JSON.stringify({ code, password }),
  });

describe("a lost password is reset with the one-use code the server holds, and the reset ends every session and keeps the agent tokens", () => {
  let instance: Instance;
  let token: { readonly value: string };
  let ownerCookie: string;

  before(async () => {
    instance = await Instance.start({ resetCode: RESET_CODE });
    await instance.setUp();
    token = await createAgentToken(instance, "survives the reset", ["read"]);
    ownerCookie = instance.sessionCookie ?? "";
  });

  after(() => instance.close());

  it("refuses a wrong reset code with 403 wrong-reset-code and leaves the password and the session as they were", async () => {
    const refused = await reset(instance, `${RESET_CODE}-wrong`);

    assert.equal(refused.status, 403);
    assert.equal(refusalCode(await refused.text()), "wrong-reset-code");
    assert.equal((await instance.send("GET", "/api/items")).status, 200);
    assert.equal(
      (await instance.send("POST", "/api/login", { password: NEW_PASSWORD })).status,
      403,
    );
  });

  it("clears the sign-in lock the wrong tries had built, so the new password signs in at once, and starts no session", async () => {
    const wrong = await Promise.all(
      Array.from({ length: LOCK_AFTER }, () =>
        instance.send("POST", "/api/login", { password: WRONG_PASSWORD }),
      ),
    );

    assert.ok(wrong.every(({ status }) => status === 403 || status === 429));

    const locked = await instance.send("POST", "/api/login", { password: PASSWORD });

    assert.equal(locked.status, 429);
    assert.equal(refusalCode(locked.body), "locked");

    const reply = await reset(instance, RESET_CODE);

    assert.equal(reply.status, 204);
    assert.deepEqual(reply.headers.getSetCookie(), []);
    assert.equal(
      (await instance.send("POST", "/api/login", { password: NEW_PASSWORD })).status,
      204,
    );
  });

  it("ends the owner's session, keeps the agent token, and signs in with the new password only", async () => {
    const withOldSession = await instance.fetch("/api/items", { headers: { cookie: ownerCookie } });
    const withToken = await instance.sendWithToken(token.value, "GET", "/api/items");

    assert.equal(withOldSession.status, 401);
    assert.equal(withToken.status, 200);

    const old = await instance.send("POST", "/api/login", { password: PASSWORD });

    assert.equal(old.status, 403);
    assert.equal(refusalCode(old.body), "wrong-password");
    assert.equal(
      (await instance.send("POST", "/api/login", { password: NEW_PASSWORD })).status,
      204,
    );
    assert.equal((await instance.send("GET", "/api/items")).status, 200);
  });

  it("refuses the same code a second time with 409 reset-used and keeps the password it set", async () => {
    const again = await reset(instance, RESET_CODE, PASSWORD);

    assert.equal(again.status, 409);
    assert.equal(refusalCode(await again.text()), "reset-used");
    assert.equal(
      (await instance.send("POST", "/api/login", { password: NEW_PASSWORD })).status,
      204,
    );
  });
});

describe("a reset answers 503 while the server holds no usable reset code", () => {
  const cases = [
    { name: "no reset code", resetCode: undefined, code: "reset-missing" },
    { name: "a reset code below 32 characters", resetCode: SHORT_RESET_CODE, code: "reset-short" },
  ] as const;

  for (const { name, resetCode, code } of cases) {
    it(`refuses with ${code} when the server holds ${name}, even for the code it holds`, async () => {
      const instance = await Instance.start({ resetCode });

      try {
        await instance.setUp();

        const refused = await reset(instance, resetCode ?? RESET_CODE);

        assert.equal(refused.status, 503);
        assert.equal(refusalCode(await refused.text()), code);
        assert.equal(
          (await instance.send("POST", "/api/login", { password: PASSWORD })).status,
          204,
        );
      } finally {
        await instance.close();
      }
    });
  }
});
