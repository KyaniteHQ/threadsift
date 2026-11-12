import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, describe, it } from "node:test";

import {
  ItemReadResponseSchema,
  SavedItemResponseSchema,
  TokenListResponseSchema,
} from "../src/http/schemas.ts";
import { type Answer, Instance, type Json } from "./instance.ts";
import { createAgentToken } from "./mcp-client.ts";
import { DIGEST } from "./mcp-fixtures.ts";
import { type OlderRelease, startOlderRelease } from "./older-release.ts";
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

  it("answers 403 to a method that no scope lists, even to a token with all four scopes", async () => {
    const { value } = await createAgentToken(instance, "unlisted method", ALL);

    assert.equal((await instance.sendWithToken(value, "PATCH", "/api/items/1")).status, 403);
  });

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

    const { tokens } = await instance.read("GET", "/api/tokens", TokenListResponseSchema);

    assert.deepEqual(
      ["listed default", "listed two", "listed digest"].map(
        (name) => tokens.find((each) => each.name === name)?.scopes,
      ),
      [["read", "add"], ["read", "delete"], ["digest"]],
    );
  });
});

describe("a token that existed before scopes keeps all four", () => {
  const VALUE = "tsa_a-token-saved-by-the-release-before-scopes";

  let release: OlderRelease;

  before(async () => {
    const digest = createHash("sha256").update(VALUE).digest("hex");

    release = await startOlderRelease(
      "0049_agent-token-scopes.sql",
      `insert into agent_tokens (name, digest, created_at) values ('before scopes', '${digest}', 1)`,
    );
  });

  after(() => release.close());

  it("lists all four scopes after the migration and passes every gated call", async () => {
    const { instance } = release;
    const { tokens } = await instance.read("GET", "/api/tokens", TokenListResponseSchema);

    assert.deepEqual(
      tokens.map(({ name, scopes }) => [name, scopes]),
      [["before scopes", ALL]],
    );

    const { statuses } = await callsOf(
      instance,
      (...call) => instance.sendWithToken(VALUE, ...call),
      "400",
    );

    assert.ok(CALLS.every((call) => statuses[call] !== 403));
  });
});
