import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  CreatedTokenResponseSchema,
  SavedItemResponseSchema,
  TokenListResponseSchema,
} from "../src/http/schemas.ts";
import { type Answer, Instance, type Json } from "./instance.ts";
import { DIGEST } from "./mcp-fixtures.ts";
import { exec } from "./related-fixtures.ts";

type Send = (method: string, path: string, body?: Json) => Promise<Answer>;

const ALL = ["read", "add", "digest", "delete"];

const link = (tag: string): string => `https://x.com/someone/status/${tag}`;

const statuses = (answers: readonly Answer[]): number[] => answers.map(({ status }) => status);

describe("an agent token calls only what its scopes allow, and a token created before scopes holds all four", () => {
  let instance: Instance;
  let owner: Send;

  const createToken = (body: Json) =>
    instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, body);

  const sendAs =
    (value: string): Send =>
    (method, path, body) =>
      instance.sendWithToken(value, method, path, body);

  const saved = async (tag: string) =>
    (await instance.read("POST", "/api/items", SavedItemResponseSchema, { url: link(tag) })).item
      .id;

  const gatedCalls = async (send: Send, tag: string) => {
    const [kept, gone] = await Promise.all([saved(`${tag}1`), saved(`${tag}2`)]);

    return Promise.all([
      send("DELETE", `/api/items/${String(gone)}`),
      send("POST", `/api/items/${String(kept)}/digest`),
      send("POST", "/api/topics/databases/overview"),
      send("POST", "/api/items", { url: link(`${tag}3`), digest: DIGEST }),
      send("POST", "/api/items/batch", { links: [{ url: link(`${tag}4`), digest: DIGEST }] }),
    ]);
  };

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    owner = (method, path, body) => instance.send(method, path, body);
  });

  after(() => instance.close());

  it("starts a token with read and add, which cannot delete, queue a Digest or send one", async () => {
    const { token, value } = await createToken({ name: "default scopes" });
    const send = sendAs(value);

    assert.deepEqual(token.scopes, ["read", "add"]);
    assert.equal((await send("GET", "/api/items")).status, 200);
    assert.equal((await send("POST", "/api/items", { url: link("3000000001") })).status, 201);
    assert.deepEqual(statuses(await gatedCalls(send, "31")), [403, 403, 403, 403, 403]);
  });

  it("lets a token with all four scopes make every call the owner makes", async () => {
    const { value } = await createToken({ name: "all scopes", scopes: ALL });
    const answers = statuses(await gatedCalls(sendAs(value), "32"));

    assert.deepEqual(answers, statuses(await gatedCalls(owner, "33")));
    assert.ok(!answers.includes(403));
  });

  it("refuses a Paste and a batch of links from a token that holds only read", async () => {
    const { value } = await createToken({ name: "read only", scopes: ["read"] });
    const send = sendAs(value);

    assert.equal((await send("GET", "/api/items")).status, 200);
    assert.equal((await send("POST", "/api/items", { url: link("3000000002") })).status, 403);
    assert.equal(
      (await send("POST", "/api/items/batch", { links: [{ url: link("3000000004") }] })).status,
      403,
    );
  });

  it("answers 403 to a method that no scope lists, even to a token with all four scopes", async () => {
    const { value } = await createToken({ name: "unlisted method", scopes: ALL });
    const id = await saved("3000000003");
    const path = `/api/items/${String(id)}`;

    assert.equal((await sendAs(value)("PATCH", path)).status, 403);
    assert.equal((await owner("PATCH", path)).status, 404);
  });

  it("refuses an empty or unknown scope list when creating a token, and lists each token's scopes", async () => {
    const bad = await Promise.all(
      [[], ["read", "admin"]].map((scopes) =>
        instance.send("POST", "/api/tokens", { name: "refused", scopes }),
      ),
    );

    assert.deepEqual(statuses(bad), [400, 400]);

    await createToken({ name: "listed", scopes: ["read", "delete"] });

    const { tokens } = await instance.read("GET", "/api/tokens", TokenListResponseSchema);

    assert.deepEqual(tokens.find(({ name }) => name === "listed")?.scopes, ["read", "delete"]);
  });

  it("gives a token row stored without scopes all four, as a token from before scopes has", async () => {
    const { token, value } = await createToken({ name: "before scopes", scopes: ["read"] });

    exec(
      instance,
      "insert or replace into agent_tokens (id, name, digest, created_at) select id, name, digest, created_at from agent_tokens where id = ?",
      token.id,
    );

    const { tokens } = await instance.read("GET", "/api/tokens", TokenListResponseSchema);

    assert.deepEqual(tokens.find(({ name }) => name === "before scopes")?.scopes, ALL);
    assert.ok(!statuses(await gatedCalls(sendAs(value), "34")).includes(403));
  });
});
