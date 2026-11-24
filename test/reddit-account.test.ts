import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { CreatedTokenResponseSchema } from "../src/core/contract/access-wire.ts";
import { type Answer, Instance, type Json } from "./instance.ts";
import { createAgentToken } from "./mcp-client.ts";
import {
  PATH,
  accountInstance,
  SESSION,
  account,
  connect,
  verified,
  view,
} from "./reddit-account-fixtures.ts";
import { exec } from "./related-fixtures.ts";

describe("the Reddit account settings are reached only by the signed-in owner", () => {
  let instance: Instance;
  let token = "";

  before(async () => {
    instance = await accountInstance();
    ({ value: token } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "reddit-account-access",
      scopes: ["read", "reddit"],
    }));
  });

  after(() => instance.close());

  const calls = [
    ["GET", PATH],
    ["PUT", PATH],
    ["DELETE", PATH],
    ["POST", `${PATH}/verify`],
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
});

describe("the owner connects and disconnects a Reddit account", () => {
  let instance: Instance;

  before(async () => {
    instance = await accountInstance();
  });

  after(() => instance.close());

  it("reads none before anything is saved, and verify says not-configured", async () => {
    assert.deepEqual(await view(instance), { state: "none", secretReady: true });
    assert.equal(await verified(instance), "not-configured");
  });

  const storesSession = async (session: string, expected: string) => {
    const saved = await instance.send("PUT", PATH, { session });
    assert.equal(saved.status, 200);
    assert.deepEqual(JSON.parse(saved.body), { state: "connected", secretReady: true });
    const [row, ...rest] = account(instance);
    assert.equal(rest.length, 0);
    assert.ok(row);
    assert.equal(row.state, "connected");
    assert.match(row.sealed_session, /^v1\./u);
    assert.ok(!row.sealed_session.includes(expected));
    assert.ok((await instance.core.secrets?.open(row.sealed_session)) === expected);
  };

  it("stores a value sealed, with or without the cookie name in front, and says connected", async () => {
    const replacement = "replacement-session";
    await storesSession(SESSION, SESSION);
    await storesSession(`reddit_session=${replacement}`, replacement);
  });

  it("keeps the saved session out of the PUT and GET response bodies", async () => {
    const saved = await instance.send("PUT", PATH, { session: SESSION });
    const read = await instance.send("GET", PATH);
    for (const answer of [saved, read]) {
      assert.equal(answer.status, 200);
      assert.ok(!answer.body.includes(SESSION.slice(0, 20)));
    }
  });

  const refused = [
    ["a semicolon", "abc;def"],
    ["a space", "abc def"],
    ["a line break", "abc\ndef"],
    ["an empty value", ""],
    ["only the cookie name", "reddit_session="],
    ["a value over 4,096 characters", "a".repeat(4097)],
  ] as const;

  const refusesValue = (name: string, text: string) => {
    it(`answers 400 for ${name} and keeps the saved account`, async () => {
      await connect(instance, SESSION);
      const unchanged = account(instance);
      assert.equal(unchanged.length, 1);
      const answer = await instance.send("PUT", PATH, { session: text });

      assert.equal(answer.status, 400);
      assert.deepEqual(account(instance), unchanged);
    });
  };

  for (const [name, text] of refused) refusesValue(name, text);

  it("accepts a value of exactly 4,096 characters", async () => {
    assert.equal((await instance.send("PUT", PATH, { session: "a".repeat(4096) })).status, 200);
  });
});

describe("an Instance with no sealing key, and a row sealed under another key", () => {
  let bare: Instance;
  let other: Instance;

  before(async () => {
    bare = await Instance.start();
    await bare.setUp();
    other = await accountInstance();
    await connect(other, SESSION);
  });

  after(async () => {
    await bare.close();
    await other.close();
  });

  it("reads missing, refuses the value with secret-missing, and saves nothing", async () => {
    assert.deepEqual(await view(bare), { state: "missing", secretReady: false });
    assert.deepEqual(await connect(bare, SESSION), { kind: "refused", reason: "secret-missing" });
    assert.equal(await verified(bare), "secret-missing");
    assert.deepEqual(account(bare), []);
  });

  it("answers a token with refused secret-missing to PUT and state missing to GET", async () => {
    const { value } = await createAgentToken(bare, "extension", ["read", "reddit"]);
    const put = await bare.sendWithToken(value, "PUT", TOKEN_PATH, { session: SESSION });
    const read = await bare.sendWithToken(value, "GET", TOKEN_PATH);

    assert.deepEqual(JSON.parse(put.body), { kind: "refused", reason: "secret-missing" });
    assert.deepEqual(JSON.parse(read.body), { state: "missing", secretReady: false });
    assert.deepEqual(account(bare), []);
  });

  it("reads unreadable when the sealing key changed, and verify says so without a request", async () => {
    const [row] = account(other);
    assert.ok(row !== undefined);

    const foreign = await Instance.start({ secretKey: "cd".repeat(32) });
    try {
      await foreign.setUp();
      exec(
        foreign,
        "insert into reddit_account (id, sealed_session, state, state_at, connected_at) values (1, ?, 'connected', 1, 1)",
        row.sealed_session,
      );

      assert.deepEqual(await view(foreign), { state: "unreadable", secretReady: true });
      assert.equal(await verified(foreign), "unreadable");
      assert.deepEqual(await connect(foreign, SESSION), { state: "connected", secretReady: true });
    } finally {
      await foreign.close();
    }
  });
});

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
    instance = await accountInstance();
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
    const connected = { state: "connected", secretReady: true };
    assert.deepEqual(JSON.parse(viaToken.body), connected);
    assert.deepEqual(JSON.parse(viaOwner.body), connected);

    const read = await instance.sendWithToken(value, "GET", TOKEN_PATH);

    assert.deepEqual(JSON.parse(read.body), connected);

    const removed = await instance.sendWithToken(value, "DELETE", TOKEN_PATH);

    assert.deepEqual(JSON.parse(removed.body), { state: "none", secretReady: true });
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
});
