import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { TopicPageSchema } from "../src/core/topic-overview-contract.ts";
import { topicApiPath } from "../src/core/topic-path.ts";
import { CreatedTokenResponseSchema, SavedItemResponseSchema } from "../src/http/schemas.ts";
import { Instance, type Json } from "./instance.ts";

function digestFor(topic: string, title: string, summary: string): Json {
  return { title, topic, tags: ["notes"], summary, keyPoints: [`${title} in one line`] };
}

const ISTANBUL_ONE = "https://example.com/istanbul/ferries";

const ISTANBUL_TWO = "https://example.com/istanbul/bridges";

const SLASH_TOPIC = "https://example.com/ml/embeddings";

const DOT_TOPIC = "https://example.com/dots/one";

const DOTS_TOPIC = "https://example.com/dots/two";

const TILDE_DOTS_TOPIC = "https://example.com/dots/three";

const SENTENCE =
  "Copying the database file while the writer is busy can tear a page, so take the copy with the online backup command instead.";

const PAGE = {
  markdown: Array.from({ length: 6 }, () => SENTENCE).join("\n\n"),
  title: "A page",
};

type Row = readonly [string, string, string, string];

async function saveInOrder(
  instance: Instance,
  rows: readonly Row[],
): Promise<Record<string, number>> {
  const [first, ...rest] = rows;

  if (first === undefined) return {};

  const [url, topic, title, summary] = first;

  const { item } = await instance.read("POST", "/api/items", SavedItemResponseSchema, {
    url,
    page: PAGE,
    digest: digestFor(topic, title, summary),
  });

  await instance.settledItem(item.id);

  return { [url]: item.id, ...(await saveInOrder(instance, rest)) };
}

describe("a Topic page lists the Items of one Topic with their Summary lines, whichever way the Topic is spelled", () => {
  let instance: Instance;
  const saved: Record<string, number> = {};

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();

    const digests: readonly Row[] = [
      [
        ISTANBUL_ONE,
        "İstanbul",
        "Ferries across the Bosphorus",
        "Ferries cross the strait all day.\nThey cost less than a taxi.",
      ],
      [
        ISTANBUL_TWO,
        "istanbul",
        "Bridges over the Bosphorus",
        "Three bridges join the two shores.",
      ],
      [SLASH_TOPIC, "AI/ML", "Embeddings explained", "Embeddings map text to vectors."],
      [DOT_TOPIC, ".", "A single dot", "The Topic is one dot."],
      [DOTS_TOPIC, "..", "Two dots", "The Topic is two dots."],
      [TILDE_DOTS_TOPIC, "~..", "A tilde and two dots", "The Topic is a tilde and two dots."],
    ];

    Object.assign(saved, await saveInOrder(instance, digests));
  });

  after(() => instance.close());

  const page = (key: string) => instance.read("GET", topicApiPath(key), TopicPageSchema);

  it("answers the Topic's Items with their Summary lines, newest saved first", async () => {
    const { topic, items } = await page("istanbul");

    assert.deepEqual(topic, { key: "istanbul", name: "İstanbul", itemCount: 2 });
    assert.deepEqual(
      items.map(({ id, title, summary }) => [id, title, summary]),
      [
        [saved[ISTANBUL_TWO], "Bridges over the Bosphorus", "Three bridges join the two shores."],
        [
          saved[ISTANBUL_ONE],
          "Ferries across the Bosphorus",
          "Ferries cross the strait all day.\nThey cost less than a taxi.",
        ],
      ],
    );
  });

  it("gives İstanbul, istanbul and the dotted capital written as I and a combining dot one page", async () => {
    const lower = await page("istanbul");

    assert.deepEqual(await page("İstanbul"), lower);
    assert.deepEqual(await page("I\u0307stanbul"), lower);
    assert.deepEqual(await page("  ISTANBUL "), lower);
  });

  it("writes no overview when no Provider is saved, and shows the Items without one", async () => {
    const { overview, items } = await page("istanbul");

    assert.deepEqual(overview, {
      state: "idle",
      text: null,
      cited: [],
      builtFrom: 0,
      provider: false,
      failure: null,
    });
    assert.equal(
      items.every(({ inOverview }) => !inOverview),
      true,
    );
    assert.equal((await instance.send("POST", "/api/topics/istanbul/overview")).status, 409);
  });

  it("finds a Topic whose name holds a slash", async () => {
    const { topic, items } = await page("AI/ML");

    assert.equal(topic.name, "AI/ML");
    assert.deepEqual(
      items.map(({ id }) => id),
      [saved[SLASH_TOPIC]],
    );
  });

  it("finds a Topic named only with dots, and a tilde before dots, each at its own address", async () => {
    const found = await Promise.all([".", "..", "~.."].map((key) => page(key)));

    assert.deepEqual(
      found.map(({ topic, items }) => [topic.key, items.map(({ id }) => id)]),
      [
        [".", [saved[DOT_TOPIC]]],
        ["..", [saved[DOTS_TOPIC]]],
        ["~..", [saved[TILDE_DOTS_TOPIC]]],
      ],
    );
    assert.deepEqual(
      [".", "..", "~..", "~~.."].map((key) => topicApiPath(key)),
      ["/api/topics/~.", "/api/topics/~..", "/api/topics/~~..", "/api/topics/~~~.."],
    );
    assert.equal((await instance.send("GET", topicApiPath("..."))).status, 404);
    assert.equal((await instance.send("GET", `${topicApiPath("..")}/overview`)).status, 404);
  });

  it("refuses a Topic that does not exist", async () => {
    assert.equal((await instance.send("GET", "/api/topics/no-such-topic")).status, 404);
    assert.equal((await instance.send("POST", "/api/topics/no-such-topic/overview")).status, 404);
    assert.equal((await instance.send("GET", "/api/topics/istanbul?cursor=nope")).status, 400);
  });

  it("answers an agent token the same page as the owner's session", async () => {
    const { value } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
      name: "reader",
    });

    const owner = await instance.send("GET", "/api/topics/istanbul");
    const agent = await instance.sendWithToken(value, "GET", "/api/topics/istanbul");

    assert.equal(agent.status, 200);
    assert.equal(agent.body, owner.body);
    assert.equal(
      (await instance.sendWithToken("wrong", "GET", "/api/topics/istanbul")).status,
      401,
    );
  });

  it("drops a deleted Item from its Topic's list", async () => {
    const id = saved[ISTANBUL_ONE];

    assert.equal((await instance.send("DELETE", `/api/items/${String(id)}`)).status, 204);

    const { topic, items } = await page("istanbul");

    assert.equal(topic.itemCount, 1);
    assert.deepEqual(
      items.map((item) => item.id),
      [saved[ISTANBUL_TWO]],
    );
  });
});
