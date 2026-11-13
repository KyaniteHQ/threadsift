import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import {
  RedditAccountSaveResponseSchema,
  RedditAccountViewSchema,
} from "../src/core/reddit-account-contract.ts";
import { type Answer, Instance, type Json } from "./instance.ts";
import { createAgentToken } from "./mcp-client.ts";
import { PATH, SECRET_KEY, SESSION, account, connect } from "./reddit-account-fixtures.ts";

const TOKEN_PATH = "/api/reddit-account";

type Caller = (method: string, path: string, body: Json) => Promise<Answer>;

async function statusesOf(call: Caller): Promise<readonly number[]> {
  const read = await call("GET", TOKEN_PATH, null);
  const write = await call("PUT", TOKEN_PATH, { session: SESSION });
  const remove = await call("DELETE", TOKEN_PATH, null);

  return [read.status, write.status, remove.status];
}

const withToken =
  (instance: Instance, value: string): Caller =>
  (method, path, body) =>
    instance.sendWithToken(value, method, path, body);

describe("an agent token reaches the Reddit account only through the reddit scope", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("lets a token with read and reddit read, write and remove, and the owner session do the same", async () => {
    const { value } = await createAgentToken(instance, "extension", ["read", "reddit"]);

    assert.deepEqual(await statusesOf(withToken(instance, value)), [200, 200, 200]);
    assert.deepEqual(account(instance), []);

    const owner = await statusesOf((method, path, body) => instance.send(method, path, body));

    assert.deepEqual(owner, [200, 200, 200]);
  });

  it("answers 403 to PUT and DELETE for a token without reddit, keeps the saved row, and still answers GET", async () => {
    await connect(instance, SESSION);

    const saved = account(instance);
    const defaults = await createAgentToken(instance, "default scopes");
    const writer = await createAgentToken(instance, "wide", ["read", "add", "digest", "delete"]);

    assert.deepEqual(await statusesOf(withToken(instance, defaults.value)), [200, 403, 403]);
    assert.deepEqual(await statusesOf(withToken(instance, writer.value)), [200, 403, 403]);
    assert.deepEqual(account(instance), saved);
  });

  it("answers 403 to GET for a token that holds reddit without read, and still lets it write and remove", async () => {
    const { value } = await createAgentToken(instance, "write only", ["reddit"]);

    assert.deepEqual(await statusesOf(withToken(instance, value)), [403, 200, 200]);
  });

  it("answers a token's PUT, GET and DELETE exactly as the owner's settings routes do, and returns no session", async () => {
    const { value } = await createAgentToken(instance, "same answers", ["read", "reddit"]);

    const viaToken = await instance.sendWithToken(value, "PUT", TOKEN_PATH, { session: SESSION });
    const viaOwner = await instance.send("PUT", PATH, { session: SESSION });

    assert.equal(viaToken.status, viaOwner.status);
    assert.deepEqual(
      RedditAccountSaveResponseSchema.parse(JSON.parse(viaToken.body)),
      RedditAccountSaveResponseSchema.parse(JSON.parse(viaOwner.body)),
    );

    const read = await instance.sendWithToken(value, "GET", TOKEN_PATH);

    assert.deepEqual(RedditAccountViewSchema.parse(JSON.parse(read.body)), {
      state: "connected",
      secretReady: true,
    });

    const removed = await instance.sendWithToken(value, "DELETE", TOKEN_PATH);

    assert.deepEqual(RedditAccountViewSchema.parse(JSON.parse(removed.body)), {
      state: "none",
      secretReady: true,
    });
    assert.deepEqual(account(instance), []);

    const bodies = [viaToken.body, read.body, removed.body];

    assert.ok(bodies.every((body) => !body.includes(SESSION.slice(0, 20))));
  });

  it("answers 400 to a value Reddit sessions cannot have, and saves nothing", async () => {
    const { value } = await createAgentToken(instance, "bad value", ["read", "reddit"]);
    const answer = await instance.sendWithToken(value, "PUT", TOKEN_PATH, { session: "abc;def" });

    assert.equal(answer.status, 400);
    assert.deepEqual(account(instance), []);
  });

  it("describes the three token routes, their scopes and their 403 in the OpenAPI document", async () => {
    const Operation = z.object({
      description: z.string(),
      responses: z.record(z.string(), z.unknown()),
    });

    const document = z
      .object({ paths: z.record(z.string(), z.record(z.string(), Operation.or(z.unknown()))) })
      .parse(JSON.parse((await instance.send("GET", "/api/openapi.json")).body));

    const route = document.paths[TOKEN_PATH] ?? {};
    const operation = (method: string) => Operation.parse(route[method]);

    assert.deepEqual(Object.keys(route).toSorted(), ["delete", "get", "put"]);
    assert.match(operation("put").description, /`reddit` scope/u);
    assert.match(operation("delete").description, /`reddit` scope/u);
    assert.match(operation("get").description, /`read` scope/u);

    for (const method of ["get", "put", "delete"]) {
      assert.ok("403" in operation(method).responses);
    }
  });
});

describe("an Instance with no sealing key refuses a token's connect without saving", () => {
  let bare: Instance;

  before(async () => {
    bare = await Instance.start();
    await bare.setUp();
  });

  after(() => bare.close());

  it("answers refused secret-missing to PUT and state missing to GET", async () => {
    const { value } = await createAgentToken(bare, "extension", ["read", "reddit"]);
    const put = await bare.sendWithToken(value, "PUT", TOKEN_PATH, { session: SESSION });
    const read = await bare.sendWithToken(value, "GET", TOKEN_PATH);

    assert.deepEqual(JSON.parse(put.body), { kind: "refused", reason: "secret-missing" });
    assert.deepEqual(JSON.parse(read.body), { state: "missing", secretReady: false });
    assert.deepEqual(account(bare), []);
  });
});
