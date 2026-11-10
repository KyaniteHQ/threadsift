import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { SessionStateSchema } from "../src/http/schemas.ts";
import { Instance, PASSWORD, SETUP_CODE } from "./instance.ts";

const WRONG_SETUP_CODE = "a-wrong-setup-code-of-sixteen";

const WRONG_PASSWORD = "not the password of the owner";

describe("the owner takes a new Instance from first run to a signed-in session with the setup code", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
  });

  after(() => instance.close());

  const sessionState = async () =>
    (await instance.read("GET", "/api/session", SessionStateSchema)).state;

  it("asks for setup while no owner exists and refuses the library", async () => {
    assert.deepEqual(await instance.read("GET", "/api/session", SessionStateSchema), {
      state: "setup",
      code: "set",
    });
    assert.equal((await instance.send("GET", "/api/items")).status, 401);
  });

  it("refuses a wrong setup code and creates no owner", async () => {
    const refused = await instance.send("POST", "/api/setup", {
      code: WRONG_SETUP_CODE,
      password: PASSWORD,
    });

    assert.equal(refused.status, 401);
    assert.equal(await sessionState(), "setup");
  });

  it("creates the owner with the right setup code and signs the owner in", async () => {
    const created = await instance.send("POST", "/api/setup", {
      code: SETUP_CODE,
      password: PASSWORD,
    });

    assert.equal(created.status, 204);
    assert.equal(await sessionState(), "signed-in");
    assert.equal((await instance.send("GET", "/api/items")).status, 200);
  });

  it("takes no second owner once one exists", async () => {
    const second = await instance.send("POST", "/api/setup", {
      code: SETUP_CODE,
      password: WRONG_PASSWORD,
    });

    assert.equal(second.status, 409);
  });

  it("signs out and refuses the library again", async () => {
    assert.equal((await instance.send("POST", "/api/logout")).status, 204);
    assert.equal(await sessionState(), "signed-out");
    assert.equal((await instance.send("GET", "/api/items")).status, 401);
  });

  it("refuses a wrong password and stays signed out", async () => {
    const refused = await instance.send("POST", "/api/login", { password: WRONG_PASSWORD });

    assert.equal(refused.status, 401);
    assert.equal(await sessionState(), "signed-out");
  });

  it("signs in again with the right password", async () => {
    assert.equal((await instance.send("POST", "/api/login", { password: PASSWORD })).status, 204);
    assert.equal(await sessionState(), "signed-in");
    assert.equal((await instance.send("GET", "/api/items")).status, 200);
  });
});
