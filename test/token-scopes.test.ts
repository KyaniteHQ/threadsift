import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { TokenListResponseSchema } from "../src/core/contract/access-wire.ts";
import {
  ItemReadResponseSchema,
  SavedItemResponseSchema,
} from "../src/core/contract/item-route-wire.ts";
import { type Answer, Instance, type Json } from "./instance.ts";
import { createAgentToken } from "./mcp-client.ts";
import { DIGEST } from "./mcp-fixtures.ts";
import { SECRET_KEY, paste, saveProvider } from "./related-fixtures.ts";

type Send = (method: string, path: string, body?: Json) => Promise<Answer>;

const CALLS = [
  "list",
  "head",
  "topic",
  "paste",
  "batch",
  "pasteWithDigest",
  "batchWithDigest",
  "digest",
  "overview",
  "delete",
] as const;

type Call = (typeof CALLS)[number];

const OWNER_STATUS = {
  list: 200,
  head: 200,
  topic: 200,
  paste: 201,
  batch: 200,
  pasteWithDigest: 201,
  batchWithDigest: 200,
  digest: 200,
  overview: 202,
  delete: 204,
} as const satisfies Record<Call, number>;

const READ: readonly Call[] = ["list", "head", "topic"];

const ADD: readonly Call[] = ["paste", "batch"];

const ALL = ["read", "add", "digest", "delete"];

const TOKENS: readonly { readonly scopes?: string[]; readonly allowed: readonly Call[] }[] = [
  { allowed: [...READ, ...ADD] },
  { scopes: ["read"], allowed: READ },
  { scopes: ["add"], allowed: ADD },
  { scopes: ["read", "digest"], allowed: [...READ, "digest", "overview"] },
  { scopes: ["read", "delete"], allowed: [...READ, "delete"] },
  { scopes: ["read", "add", "digest"], allowed: CALLS.filter((call) => call !== "delete") },
  { scopes: ALL, allowed: CALLS },
  { scopes: ["read", "reddit"], allowed: READ },
];

const link = (tag: string): string => `https://x.com/someone/status/${tag}`;

async function callsOf(instance: Instance, send: Send, tag: string) {
  const saved = async (suffix: string) =>
    (
      await instance.read("POST", "/api/items", SavedItemResponseSchema, {
        url: link(tag + suffix),
      })
    ).item.id;

  const [kept, gone] = await Promise.all([saved("1"), saved("2")]);
  const cursor = { name: `cursor${tag}`, cursor: "1" };

  const [list, head, topic, added, batch, addedWithDigest, batchWithDigest, digest, overview, del] =
    await Promise.all([
      send("GET", "/api/items"),
      send("HEAD", "/api/items"),
      send("GET", "/api/topics/scopes"),
      send("POST", "/api/items", { url: link(`${tag}3`) }),
      send("POST", "/api/items/batch", { links: [{ url: link(`${tag}4`) }], import: cursor }),
      send("POST", "/api/items", { url: link(`${tag}5`), digest: DIGEST }),
      send("POST", "/api/items/batch", {
        links: [{ url: link(`${tag}6`) }, { url: link(`${tag}7`), digest: DIGEST }],
        import: { ...cursor, name: `digest${tag}` },
      }),
      send("POST", `/api/items/${String(kept)}/digest`),
      send("POST", "/api/topics/scopes/overview"),
      send("DELETE", `/api/items/${String(gone)}`),
    ]);

  return {
    statuses: {
      list: list.status,
      head: head.status,
      topic: topic.status,
      paste: added.status,
      batch: batch.status,
      pasteWithDigest: addedWithDigest.status,
      batchWithDigest: batchWithDigest.status,
      digest: digest.status,
      overview: overview.status,
      delete: del.status,
    } satisfies Record<Call, number>,
    saves: [
      [added.status, [`${tag}3`]],
      [batch.status, [`${tag}4`]],
      [addedWithDigest.status, [`${tag}5`]],
      [batchWithDigest.status, [`${tag}6`, `${tag}7`]],
    ] as const,
  };
}

describe("an agent token calls only what its scopes allow", () => {
  let instance: Instance;

  const stored = async (url: string) =>
    (
      await instance.read(
        "GET",
        `/api/items?url=${encodeURIComponent(link(url))}`,
        ItemReadResponseSchema,
      )
    ).items.length;

  const tokenCases = ({ scopes, allowed }: (typeof TOKENS)[number], index: number): void => {
    it(`gives a token with ${scopes?.join(" and ") ?? "no scopes in its request"} exactly the calls those scopes cover, and a refused call stores nothing`, async () => {
      const { value } = await createAgentToken(instance, `token ${String(index)}`, scopes);

      const { statuses, saves } = await callsOf(
        instance,
        (...call) => instance.sendWithToken(value, ...call),
        `30${String(index)}`,
      );

      assert.deepEqual(
        CALLS.map((call) => statuses[call]),
        CALLS.map((call) => (allowed.includes(call) ? OWNER_STATUS[call] : 403)),
      );

      assert.deepEqual(
        await Promise.all(saves.map(([, urls]) => Promise.all(urls.map((url) => stored(url))))),
        saves.map(([status, urls]) => urls.map(() => (status === 403 ? 0 : 1))),
      );

      assert.equal(
        (await instance.send("GET", `/api/imports/digest30${String(index)}`)).status,
        statuses.batchWithDigest === 403 ? 404 : 200,
      );
    });
  };

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await saveProvider(instance);
    await paste(instance, "topic", { title: "A Topic page to read", topic: "Scopes" });
  });

  after(() => instance.close());

  for (const [index, row] of TOKENS.entries()) tokenCases(row, index);

  it("refuses an empty or unknown scope list when creating a token, and lists each token's scopes", async () => {
    const bad = await Promise.all(
      [[], ["read", "admin"]].map((scopes) =>
        instance.send("POST", "/api/tokens", { name: "refused", scopes }),
      ),
    );

    assert.deepEqual(
      bad.map(({ status }) => status),
      [400, 400],
    );

    await createAgentToken(instance, "listed default");
    await createAgentToken(instance, "listed two", ["read", "delete"]);
    await createAgentToken(instance, "listed digest", ["digest"]);
    await createAgentToken(instance, "listed reddit", ["read", "reddit"]);

    const { tokens } = await instance.read("GET", "/api/tokens", TokenListResponseSchema);

    assert.deepEqual(
      ["listed default", "listed two", "listed digest", "listed reddit"].map(
        (name) => tokens.find((each) => each.name === name)?.scopes,
      ),
      [["read", "add"], ["read", "delete"], ["digest"], ["read", "reddit"]],
    );
  });
});

describe("a token whose stored scopes are unreadable", () => {
  let instance: Instance;

  const store = (id: number, scopes: string): void => {
    using database = new DatabaseSync(instance.databaseFile);

    database.prepare("update agent_tokens set scopes = ? where id = ?").run(scopes, id);
  };

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  it("lists with no scopes, and each call answers the 403 of a token that lacks the scope", async () => {
    const lacking = await createAgentToken(instance, "lacks read", ["add"]);
    const expected = await instance.sendWithToken(lacking.value, "GET", "/api/items");

    assert.equal(expected.status, 403);

    const stored = [JSON.stringify({ read: true }), JSON.stringify(["read", "admin"]), "["];

    const unreadable = await Promise.all(
      stored.map((scopes, index) =>
        createAgentToken(instance, `unreadable scopes ${String(index)}`).then((token) => {
          store(token.id, scopes);

          return token;
        }),
      ),
    );

    const answers = await Promise.all(
      unreadable.map(({ value }) => instance.sendWithToken(value, "GET", "/api/items")),
    );

    assert.deepEqual(answers, [expected, expected, expected]);

    const { tokens } = await instance.read("GET", "/api/tokens", TokenListResponseSchema);

    assert.deepEqual(
      unreadable.map(({ id }) => tokens.find((each) => each.id === id)?.scopes),
      [[], [], []],
    );
  });
});

describe("a token row stored without scopes", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
  });

  after(() => instance.close());

  it("is refused by the database, which holds no default scopes for a token", () => {
    using database = new DatabaseSync(instance.databaseFile);

    assert.throws(() => {
      database
        .prepare(
          "insert into agent_tokens (name, digest, created_at) values ('no scopes', 'digest', 0)",
        )
        .run();
    }, /NOT NULL constraint failed: agent_tokens\.scopes/u);
  });
});
